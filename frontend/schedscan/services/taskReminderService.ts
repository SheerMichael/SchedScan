import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { taskService, Task, TaskUrgency } from './taskService';

const TASK_REMINDER_CATEGORY = 'task-due-reminder-local';
const TASK_REMINDER_MAP_STORAGE_KEY = 'task_due_notification_map_v1';

const TWENTY_FOUR_HOURS_MINUTES = 24 * 60;
const SIXTY_MINUTES = 60;
const MIN_SCHEDULE_AHEAD_MS = 5000;

type ReminderStage =
  | 'due_24h'
  | 'due_1h'
  | 'due_time'
  | 'critical_30m'
  | 'critical_10m'
  | 'critical_5m'
  | 'critical_now';

type NotificationIdMap = Record<string, string[]>;

interface PlannedReminder {
  stage: ReminderStage;
  scheduledAt: Date;
  invasive: boolean;
  effectiveUrgency: TaskUrgency;
}

interface ScheduleTaskReminderOptions {
  skipInfrastructureCheck?: boolean;
  skipCancelExisting?: boolean;
  stagedNotificationMap?: NotificationIdMap;
}

let notificationInfrastructureReady = false;
let notificationInfrastructurePromise: Promise<boolean> | null = null;

const truncateTaskText = (text: string, maxLength: number = 140): string => {
  const normalized = (text || '').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
};

const getEffectiveUrgency = (task: Task, now: Date): TaskUrgency => {
  if (task.effective_urgency) {
    return task.effective_urgency;
  }

  const baseUrgency = (task.urgency || 'medium') as TaskUrgency;
  if (!task.due_date) {
    return baseUrgency;
  }

  const dueDate = new Date(task.due_date);
  if (Number.isNaN(dueDate.getTime())) {
    return baseUrgency;
  }

  const deltaMinutes = Math.floor((dueDate.getTime() - now.getTime()) / 60000);
  if (deltaMinutes <= SIXTY_MINUTES) {
    return 'critical';
  }
  if (deltaMinutes <= TWENTY_FOUR_HOURS_MINUTES && (baseUrgency === 'low' || baseUrgency === 'medium')) {
    return 'high';
  }
  return baseUrgency;
};

const addPlanIfFuture = (
  plans: PlannedReminder[],
  stage: ReminderStage,
  when: Date,
  invasive: boolean,
  effectiveUrgency: TaskUrgency,
  nowMs: number,
) => {
  if (when.getTime() <= nowMs + MIN_SCHEDULE_AHEAD_MS) {
    return;
  }
  plans.push({ stage, scheduledAt: when, invasive, effectiveUrgency });
};

const buildReminderPlan = (task: Task, now: Date): PlannedReminder[] => {
  if (task.is_completed || !task.due_date) {
    return [];
  }

  const dueDate = new Date(task.due_date);
  if (Number.isNaN(dueDate.getTime())) {
    return [];
  }

  const effectiveUrgency = getEffectiveUrgency(task, now);
  const isCritical = effectiveUrgency === 'critical';
  const nowMs = now.getTime();
  const plans: PlannedReminder[] = [];

  addPlanIfFuture(
    plans,
    'due_24h',
    new Date(dueDate.getTime() - TWENTY_FOUR_HOURS_MINUTES * 60000),
    false,
    effectiveUrgency,
    nowMs,
  );

  addPlanIfFuture(
    plans,
    'due_1h',
    new Date(dueDate.getTime() - SIXTY_MINUTES * 60000),
    isCritical,
    effectiveUrgency,
    nowMs,
  );

  addPlanIfFuture(plans, 'due_time', dueDate, isCritical, effectiveUrgency, nowMs);

  if (isCritical) {
    addPlanIfFuture(
      plans,
      'critical_30m',
      new Date(dueDate.getTime() - 30 * 60000),
      true,
      effectiveUrgency,
      nowMs,
    );
    addPlanIfFuture(
      plans,
      'critical_10m',
      new Date(dueDate.getTime() - 10 * 60000),
      true,
      effectiveUrgency,
      nowMs,
    );
    addPlanIfFuture(
      plans,
      'critical_5m',
      new Date(dueDate.getTime() - 5 * 60000),
      true,
      effectiveUrgency,
      nowMs,
    );

    // If already inside the final critical window, fire one immediate alarm.
    const deltaMinutes = Math.floor((dueDate.getTime() - nowMs) / 60000);
    if (deltaMinutes <= 5 && deltaMinutes >= -15) {
      addPlanIfFuture(
        plans,
        'critical_now',
        new Date(nowMs + 8000),
        true,
        effectiveUrgency,
        nowMs,
      );
    }
  }

  const deduped = new Map<ReminderStage, PlannedReminder>();
  for (const plan of plans) {
    if (!deduped.has(plan.stage)) {
      deduped.set(plan.stage, plan);
    }
  }

  return Array.from(deduped.values()).sort(
    (left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime(),
  );
};

const buildReminderTitle = (task: Task, stage: ReminderStage, critical: boolean): string => {
  if (stage === 'due_24h') {
    return `Upcoming Task: ${task.subject_code}`;
  }
  if (critical) {
    return `Critical Task: ${task.subject_code}`;
  }
  if (stage === 'due_1h') {
    return `Task Due Soon: ${task.subject_code}`;
  }
  return `Task Due: ${task.subject_code}`;
};

const buildReminderBody = (task: Task, stage: ReminderStage, dueDateLabel: string): string => {
  const text = truncateTaskText(task.text);

  if (stage === 'due_24h') {
    return `${text}\nDue within 24 hours: ${dueDateLabel}`;
  }
  if (stage === 'due_1h') {
    return `${text}\nDue within 1 hour: ${dueDateLabel}`;
  }
  if (stage === 'due_time') {
    return `${text}\nDue now: ${dueDateLabel}`;
  }
  return `${text}\nAct now. Deadline: ${dueDateLabel}`;
};

const getNotificationMap = async (): Promise<NotificationIdMap> => {
  try {
    const raw = await AsyncStorage.getItem(TASK_REMINDER_MAP_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as NotificationIdMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('[TaskReminder] Failed to read notification map:', error);
    return {};
  }
};

const saveNotificationMap = async (map: NotificationIdMap): Promise<void> => {
  try {
    await AsyncStorage.setItem(TASK_REMINDER_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.warn('[TaskReminder] Failed to persist notification map:', error);
  }
};

const cancelNotificationIds = async (ids: string[]): Promise<void> => {
  await Promise.all(
    ids.map(async (id) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // Ignore stale IDs.
      }
    }),
  );
};

const ensureNotificationInfrastructure = async (): Promise<boolean> => {
  if (notificationInfrastructureReady) {
    return true;
  }

  if (notificationInfrastructurePromise) {
    return notificationInfrastructurePromise;
  }

  notificationInfrastructurePromise = (async () => {
    try {
      const permission = await Notifications.getPermissionsAsync();
      let status = permission.status;

      if (status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }

      if (status !== 'granted') {
        return false;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          sound: 'default',
        });
        await Notifications.setNotificationChannelAsync('urgent', {
          name: 'urgent',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 250, 500, 250, 700],
          sound: 'default',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      }

      notificationInfrastructureReady = true;
      return true;
    } catch (error) {
      console.warn('[TaskReminder] Failed to ensure notification infra:', error);
      return false;
    } finally {
      notificationInfrastructurePromise = null;
    }
  })();

  return notificationInfrastructurePromise;
};

export const cancelTaskDueReminders = async (taskId: number): Promise<void> => {
  const map = await getNotificationMap();
  const mapKey = String(taskId);
  const ids = map[mapKey] || [];

  if (ids.length > 0) {
    await cancelNotificationIds(ids);
  }

  delete map[mapKey];
  await saveNotificationMap(map);
};

export const cancelAllTaskDueReminders = async (): Promise<void> => {
  const map = await getNotificationMap();
  const allIds = Object.values(map).flat();
  if (allIds.length > 0) {
    await cancelNotificationIds(allIds);
  }
  await AsyncStorage.removeItem(TASK_REMINDER_MAP_STORAGE_KEY);
};

const scheduleTaskDueRemindersForTaskInternal = async (
  task: Task,
  options: ScheduleTaskReminderOptions = {},
): Promise<number> => {
  if (!task?.id) {
    return 0;
  }

  if (!options.skipInfrastructureCheck) {
    const canNotify = await ensureNotificationInfrastructure();
    if (!canNotify) {
      return 0;
    }
  }

  if (!options.skipCancelExisting) {
    await cancelTaskDueReminders(task.id);
  }

  if (task.is_completed || !task.due_date) {
    return 0;
  }

  const now = new Date();
  const plans = buildReminderPlan(task, now);
  if (plans.length === 0) {
    return 0;
  }

  const dueDateLabel = new Date(task.due_date).toLocaleString();
  const scheduledIds: string[] = [];

  for (const plan of plans) {
    const critical = plan.invasive || plan.effectiveUrgency === 'critical';
    const title = buildReminderTitle(task, plan.stage, critical);
    const body = buildReminderBody(task, plan.stage, dueDateLabel);

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          channelId: critical ? 'urgent' : 'default',
          priority: critical
            ? Notifications.AndroidNotificationPriority.MAX
            : Notifications.AndroidNotificationPriority.DEFAULT,
          data: {
            category: TASK_REMINDER_CATEGORY,
            type: 'task_due_reminder',
            task_kind: 'personal',
            task_id: task.id,
            subject_code: task.subject_code,
            urgency: plan.effectiveUrgency,
            reminder_stage: plan.stage,
            invasive: critical,
            local_generated: true,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: plan.scheduledAt,
        },
      });
      scheduledIds.push(id);
    } catch (error) {
      console.warn(`[TaskReminder] Failed to schedule stage ${plan.stage} for task ${task.id}:`, error);
    }
  }

  if (scheduledIds.length > 0) {
    if (options.stagedNotificationMap) {
      options.stagedNotificationMap[String(task.id)] = scheduledIds;
    } else {
      const map = await getNotificationMap();
      map[String(task.id)] = scheduledIds;
      await saveNotificationMap(map);
    }
  }

  return scheduledIds.length;
};

export const scheduleTaskDueRemindersForTask = async (
  task: Task,
  options: ScheduleTaskReminderOptions = {},
): Promise<number> => {
  return scheduleTaskDueRemindersForTaskInternal(task, options);
};

export const resyncTaskDueReminders = async (subjectCodes: string[]): Promise<number> => {
  const uniqueCodes = Array.from(
    new Set(subjectCodes.map((code) => String(code || '').trim()).filter(Boolean)),
  );

  if (uniqueCodes.length === 0) {
    await cancelAllTaskDueReminders();
    return 0;
  }

  const canNotify = await ensureNotificationInfrastructure();
  if (!canNotify) {
    return 0;
  }

  await cancelAllTaskDueReminders();

  const tasksBySubject = await Promise.allSettled(
    uniqueCodes.map(async (subjectCode) => ({
      subjectCode,
      tasks: await taskService.getTasks(subjectCode),
    })),
  );

  const reminderMap: NotificationIdMap = {};
  let scheduled = 0;
  for (const result of tasksBySubject) {
    if (result.status !== 'fulfilled') {
      console.warn('[TaskReminder] Failed to fetch tasks while resyncing reminders:', result.reason);
      continue;
    }

    for (const task of result.value.tasks) {
      scheduled += await scheduleTaskDueRemindersForTaskInternal(task, {
        skipInfrastructureCheck: true,
        skipCancelExisting: true,
        stagedNotificationMap: reminderMap,
      });
    }
  }

  if (Object.keys(reminderMap).length > 0) {
    await saveNotificationMap(reminderMap);
  }

  return scheduled;
};

export const taskReminderService = {
  resyncTaskDueReminders,
  scheduleTaskDueRemindersForTask,
  cancelTaskDueReminders,
  cancelAllTaskDueReminders,
};

export default taskReminderService;