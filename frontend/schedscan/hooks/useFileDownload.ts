import { useState, useCallback, useRef } from 'react';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import api from '../services/api';
import { facultyTaskService } from '../services/facultyTaskService';

// ============================================
// MIME type helper
// ============================================
const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  txt: 'text/plain',
  zip: 'application/zip',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
};

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// ============================================
// Minimal task shape needed for download
// ============================================
interface DownloadableTask {
  id: number;
  file_name: string;
}

// ============================================
// Hook return type
// ============================================
export interface FileDownloadState {
  /** ID of the task currently being downloaded, or null */
  downloadingTaskId: number | null;
  /** Download progress 0–1, or -1 for indeterminate */
  downloadProgress: number;
  /** Human-readable status message */
  downloadStatus: string;
  /** Trigger a download for the given task */
  downloadFile: (task: DownloadableTask) => Promise<void>;
}

// ============================================
// Hook implementation
// ============================================
export function useFileDownload(): FileDownloadState {
  const [downloadingTaskId, setDownloadingTaskId] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('Preparing download...');

  // Guard ref prevents concurrent downloads even if state hasn't flushed
  const isDownloadingRef = useRef(false);

  const downloadFile = useCallback(async (task: DownloadableTask) => {
    if (isDownloadingRef.current) return;
    isDownloadingRef.current = true;

    setDownloadingTaskId(task.id);
    setDownloadProgress(0);
    setDownloadStatus('Preparing download...');

    try {
      const url = facultyTaskService.getTaskFileUrl(task.id);
      const apiBase = api.defaults.baseURL || '';
      const apiEndpoint = `${apiBase}${url}`;

      const safeName = (task.file_name || 'download').replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileUri = `${LegacyFileSystem.cacheDirectory ?? ''}${safeName}`;

      // Progress callback — handles indeterminate when Content-Length is missing
      const onProgress = (dp: LegacyFileSystem.DownloadProgressData) => {
        if (dp.totalBytesExpectedToWrite > 0) {
          setDownloadProgress(dp.totalBytesWritten / dp.totalBytesExpectedToWrite);
        } else {
          // Server didn't send Content-Length; use -1 to signal indeterminate
          setDownloadProgress(-1);
        }
      };

      // ---- Auth token ----
      let token = await SecureStore.getItemAsync('access_token');
      if (!token) {
        Alert.alert('Error', 'You are not logged in. Please log in and try again.');
        return;
      }

      // ---- Step 1: Hit authenticated API endpoint ----
      setDownloadStatus('Connecting to server...');
      let response = await LegacyFileSystem.downloadAsync(apiEndpoint, fileUri, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // If 401 (token expired), refresh once and retry
      if (response.status === 401) {
        setDownloadStatus('Refreshing session...');
        const newToken = await refreshToken();
        if (newToken) {
          token = newToken;
          response = await LegacyFileSystem.downloadAsync(apiEndpoint, fileUri, {
            headers: { Authorization: `Bearer ${newToken}` },
          });
        }
      }

      if (response.status !== 200) {
        const errorDetail = await readErrorBody(response.uri);
        Alert.alert(
          'Error',
          `Failed to download file (HTTP ${response.status}).${errorDetail ? '\n' + errorDetail : ''}`,
        );
        return;
      }

      // ---- Step 2: Check if response is an S3 pre-signed URL ----
      let finalUri = response.uri;

      const contentType =
        response.headers?.['content-type'] || response.headers?.['Content-Type'] || '';

      if (contentType.includes('application/json')) {
        try {
          const body = await LegacyFileSystem.readAsStringAsync(response.uri);
          const json = JSON.parse(body);

          if (json.download_url) {
            setDownloadStatus('Downloading file...');

            const downloadResumable = LegacyFileSystem.createDownloadResumable(
              json.download_url,
              fileUri,
              {},
              onProgress,
            );
            const result = await downloadResumable.downloadAsync();

            if (!result || result.status !== 200) {
              Alert.alert('Error', 'Failed to download file from storage.');
              return;
            }
            finalUri = result.uri;
          }
        } catch {
          // Not valid JSON — treat as direct file download
        }
      }

      // ---- Step 3: Share / save the file ----
      setDownloadProgress(1);
      setDownloadStatus('Opening file...');

      // Brief delay so user sees 100% before the share sheet covers the modal
      await delay(400);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(finalUri, {
          mimeType: getMimeType(safeName),
          dialogTitle: `Save ${task.file_name || 'file'}`,
        });
      } else {
        Alert.alert('Downloaded', 'File downloaded successfully.');
      }
    } catch (err) {
      console.error('Download error:', err);
      Alert.alert('Error', 'Failed to download file. Please check your connection and try again.');
    } finally {
      setDownloadingTaskId(null);
      setDownloadProgress(0);
      isDownloadingRef.current = false;
    }
  }, []);

  return { downloadingTaskId, downloadProgress, downloadStatus, downloadFile };
}

// ============================================
// Helpers
// ============================================

async function refreshToken(): Promise<string | null> {
  try {
    const refresh = await SecureStore.getItemAsync('refresh_token');
    if (refresh) {
      const resp = await api.post('/auth/token/refresh/', { refresh });
      const newToken: string = resp.data.access;
      await SecureStore.setItemAsync('access_token', newToken);
      return newToken;
    }
  } catch (err) {
    console.error('Token refresh failed during download:', err);
  }
  return null;
}

async function readErrorBody(uri?: string): Promise<string> {
  if (!uri) return '';
  try {
    const body = await LegacyFileSystem.readAsStringAsync(uri);
    return body.substring(0, 500);
  } catch {
    return '';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
