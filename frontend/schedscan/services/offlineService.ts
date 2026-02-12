import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import api from './api';

// ============================================
// Storage Keys
// ============================================
const KEYS = {
    ACTIVE_SCHEDULE: 'offline_active_schedule',
    SYNC_QUEUE: 'offline_sync_queue',
    LAST_SYNC: 'offline_last_sync',
};

// ============================================
// Types
// ============================================

export interface SyncOperation {
    id: string;               // Unique ID for this operation
    type: 'CREATE_TASK' | 'UPDATE_TASK' | 'DELETE_TASK';
    endpoint: string;         // API endpoint
    method: 'POST' | 'PATCH' | 'DELETE';
    data?: any;               // Request body
    metadata: {
        subject_code: string;   // For cache invalidation after sync
        local_id?: number;      // Temp ID for created items
        task_id?: number;       // Real ID for updates/deletes
    };
    created_at: string;
    retries: number;
}

type ConnectivityListener = (isConnected: boolean) => void;
type SyncCompleteListener = (result: { processed: number; failed: number }) => void;

// ============================================
// Offline Service
// ============================================

class OfflineService {
    private _isConnected: boolean = true;
    private _connectivityListeners: ConnectivityListener[] = [];
    private _syncCompleteListeners: SyncCompleteListener[] = [];
    private _isSyncing: boolean = false;
    private _unsubscribeNetInfo: (() => void) | null = null;

    /**
     * Initialize NetInfo listener. Call once on app start.
     */
    init() {
        this._unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
            const wasOffline = !this._isConnected;
            this._isConnected = state.isConnected ?? true;

            // Notify connectivity listeners
            this._connectivityListeners.forEach(fn => fn(this._isConnected));

            // Auto-sync when coming back online
            if (wasOffline && this._isConnected) {
                console.log('[Offline] Back online — processing sync queue');
                this.processQueue();
            }
        });
    }

    /**
     * Cleanup listener on unmount.
     */
    destroy() {
        this._unsubscribeNetInfo?.();
    }

    /**
     * Whether the device currently has connectivity.
     */
    get isConnected(): boolean {
        return this._isConnected;
    }

    /**
     * Subscribe to connectivity changes.
     * Returns an unsubscribe function.
     */
    onConnectivityChange(listener: ConnectivityListener): () => void {
        this._connectivityListeners.push(listener);
        return () => {
            this._connectivityListeners = this._connectivityListeners.filter(fn => fn !== listener);
        };
    }

    /**
     * Subscribe to sync completion events.
     * Returns an unsubscribe function.
     */
    onSyncComplete(listener: SyncCompleteListener): () => void {
        this._syncCompleteListeners.push(listener);
        return () => {
            this._syncCompleteListeners = this._syncCompleteListeners.filter(fn => fn !== listener);
        };
    }

    // ============================================
    // Persistent Cache — Active Schedule
    // ============================================

    async cacheActiveSchedule(schedule: any): Promise<void> {
        try {
            await AsyncStorage.setItem(KEYS.ACTIVE_SCHEDULE, JSON.stringify(schedule));
        } catch (e) {
            console.error('[Offline] Failed to cache active schedule:', e);
        }
    }

    async getCachedActiveSchedule(): Promise<any | null> {
        try {
            const raw = await AsyncStorage.getItem(KEYS.ACTIVE_SCHEDULE);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.error('[Offline] Failed to read cached schedule:', e);
            return null;
        }
    }

    async clearCachedSchedule(): Promise<void> {
        try {
            await AsyncStorage.removeItem(KEYS.ACTIVE_SCHEDULE);
        } catch (e) {
            console.error('[Offline] Failed to clear cached schedule:', e);
        }
    }

    // ============================================
    // Sync Queue
    // ============================================

    /**
     * Add a failed write operation to the sync queue.
     * Deduplicates: for UPDATE_TASK/DELETE_TASK, replaces any existing
     * operation targeting the same task_id.
     */
    async enqueue(op: Omit<SyncOperation, 'id' | 'created_at' | 'retries'>): Promise<void> {
        try {
            let queue = await this._getQueue();

            const operation: SyncOperation = {
                ...op,
                id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                created_at: new Date().toISOString(),
                retries: 0,
            };

            // Deduplicate: replace older operations for the same task_id
            if (op.metadata.task_id && (op.type === 'UPDATE_TASK' || op.type === 'DELETE_TASK')) {
                // If deleting, remove any prior UPDATE for this task_id too
                if (op.type === 'DELETE_TASK') {
                    queue = queue.filter(
                        q => !(q.metadata.task_id === op.metadata.task_id &&
                            (q.type === 'UPDATE_TASK' || q.type === 'DELETE_TASK')),
                    );
                } else {
                    // For UPDATE, replace the last UPDATE for this task_id
                    queue = queue.filter(
                        q => !(q.metadata.task_id === op.metadata.task_id && q.type === 'UPDATE_TASK'),
                    );
                }
            }

            queue.push(operation);
            await this._saveQueue(queue);
            console.log('[Offline] Enqueued operation:', operation.type, operation.id);
        } catch (e) {
            console.error('[Offline] Failed to enqueue operation:', e);
        }
    }

    /**
     * Process all pending operations in the queue.
     * Operations are processed in FIFO order.
     * Failed operations are retried up to 3 times, then discarded.
     *
     * For CREATE_TASK, the response is used to reconcile the temp local ID
     * with the real backend ID in the local cache.
     */
    async processQueue(): Promise<{ processed: number; failed: number }> {
        if (this._isSyncing) {
            console.log('[Offline] Sync already in progress, skipping');
            return { processed: 0, failed: 0 };
        }

        if (!this._isConnected) {
            console.log('[Offline] Still offline, cannot process queue');
            return { processed: 0, failed: 0 };
        }

        const queue = await this._getQueue();
        if (queue.length === 0) {
            return { processed: 0, failed: 0 };
        }

        this._isSyncing = true;
        console.log(`[Offline] Processing ${queue.length} queued operations`);

        let processed = 0;
        let failed = 0;
        const remaining: SyncOperation[] = [];

        for (const op of queue) {
            try {
                const response = await this._executeOperation(op);

                // Reconcile temp ID with real backend ID for created tasks
                if (op.type === 'CREATE_TASK' && response?.data?.id && op.metadata.local_id) {
                    await this._reconcileTempId(
                        op.metadata.subject_code,
                        op.metadata.local_id,
                        response.data,
                    );
                }

                processed++;
                console.log('[Offline] Synced:', op.type, op.id);
            } catch (e: any) {
                op.retries++;
                if (op.retries < 3) {
                    remaining.push(op);
                    console.warn(`[Offline] Retry ${op.retries}/3 for`, op.type, op.id);
                } else {
                    failed++;
                    console.error('[Offline] Giving up on operation after 3 retries:', op.type, op.id);
                }
            }
        }

        await this._saveQueue(remaining);
        this._isSyncing = false;

        await AsyncStorage.setItem(KEYS.LAST_SYNC, new Date().toISOString());

        const result = { processed, failed };
        console.log(`[Offline] Sync complete: ${processed} processed, ${failed} failed, ${remaining.length} remaining`);

        // Notify sync-complete listeners (separate from connectivity listeners)
        this._syncCompleteListeners.forEach(fn => fn(result));

        return result;
    }

    /**
     * Get the number of pending operations.
     */
    async getPendingCount(): Promise<number> {
        const queue = await this._getQueue();
        return queue.length;
    }

    /**
     * Clear the entire sync queue. Use on logout.
     */
    async clearQueue(): Promise<void> {
        await AsyncStorage.removeItem(KEYS.SYNC_QUEUE);
    }

    /**
     * Clear all offline data (schedule cache + sync queue).
     * Does NOT clear taskService caches — that is handled by taskService.clearAllCaches().
     */
    async clearAll(): Promise<void> {
        try {
            const allKeys = await AsyncStorage.getAllKeys();
            const offlineKeys = allKeys.filter(k => k.startsWith('offline_'));
            if (offlineKeys.length > 0) {
                await AsyncStorage.multiRemove(offlineKeys);
            }
            console.log('[Offline] Cleared all offline data');
        } catch (e) {
            console.error('[Offline] Failed to clear offline data:', e);
        }
    }

    // ============================================
    // Private Helpers
    // ============================================

    private async _getQueue(): Promise<SyncOperation[]> {
        try {
            const raw = await AsyncStorage.getItem(KEYS.SYNC_QUEUE);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    private async _saveQueue(queue: SyncOperation[]): Promise<void> {
        await AsyncStorage.setItem(KEYS.SYNC_QUEUE, JSON.stringify(queue));
    }

    private async _executeOperation(op: SyncOperation): Promise<any> {
        switch (op.method) {
            case 'POST':
                return api.post(op.endpoint, op.data);
            case 'PATCH':
                return api.patch(op.endpoint, op.data);
            case 'DELETE':
                return api.delete(op.endpoint);
        }
    }

    /**
     * After a CREATE_TASK sync succeeds, replace the temp local ID
     * in the task cache with the real backend task data.
     */
    private async _reconcileTempId(
        subjectCode: string,
        tempId: number,
        realTask: any,
    ): Promise<void> {
        try {
            const cacheKey = `tasks_cache_${subjectCode}`;
            const raw = await AsyncStorage.getItem(cacheKey);
            if (!raw) return;

            const tasks = JSON.parse(raw);
            const index = tasks.findIndex((t: any) => t.id === tempId);
            if (index !== -1) {
                tasks[index] = realTask;
                await AsyncStorage.setItem(cacheKey, JSON.stringify(tasks));
                console.log(`[Offline] Reconciled temp ID ${tempId} → ${realTask.id} for ${subjectCode}`);
            }
        } catch (e) {
            console.error('[Offline] Failed to reconcile temp ID:', e);
        }
    }
}

// Export singleton
export const offlineService = new OfflineService();
