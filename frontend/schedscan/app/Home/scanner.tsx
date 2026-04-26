import { View, Text, TouchableOpacity, Image, Alert, ActivityIndicator, Modal, TextInput, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { Images, Files, GraduationCap, Briefcase, ArrowRight, AlertTriangle, Info, CheckCircle2, AlertCircle } from "lucide-react-native";
import { authService } from '../../services/authService';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import {
  courseService,
  Course,
  ExtractionJobDoneResponse,
  PollingCancelToken,
  RecentExtractionJob,
  UploadCORAcceptedResponse,
} from '../../services/courseService';
import { scheduleStorageService } from '../../services/scheduleStorageService';
import { useAuth } from '../../context/AuthContext';
import FacultyModeModal from '../../components/FacultyModeModal';
import FacultyMatchModal from '../../components/FacultyMatchModal';
import ExtractionPreviewModal from '../../components/ExtractionPreviewModal';
import { pendingEnrollmentService } from '../../services/pendingEnrollmentService';
import { detectSemesterFromDate } from '../../utils/semesterUtils';
import api from '../../services/api';

type ActivePollState = {
  jobId: string;
  uploadType: 'student' | 'faculty';
  isRetry: boolean;
  cancelToken: PollingCancelToken;
};

type PersistedBackgroundJobState = {
  jobId: string;
  uploadType: 'student' | 'faculty';
  isRetry: boolean;
  updatedAt: string;
};

type ExtractionFailureCategory =
  | 'ownership_mismatch'
  | 'metadata_mismatch'
  | 'missing_day'
  | 'timeout'
  | 'low_confidence'
  | 'parse_error'
  | 'no_text'
  | 'system_error'
  | 'unknown';

type ExtractionFailureInput = {
  message?: string;
  retryable?: boolean;
  failureCategory?: string | null;
  code?: string | null;
};

type ExtractionFailureDescriptor = {
  title: string;
  message: string;
  retryable: boolean;
  category: ExtractionFailureCategory;
};

type RecentJobsFilter = 'all' | 'failed' | 'processing' | 'done';

const BACKGROUND_EXTRACTION_JOB_KEY = '@schedscan/background-extraction-job';

const normalizeFailureCategory = (value: unknown): ExtractionFailureCategory => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'ownership_mismatch') return 'ownership_mismatch';
  if (normalized === 'metadata_mismatch') return 'metadata_mismatch';
  if (normalized === 'missing_day') return 'missing_day';
  if (normalized === 'timeout') return 'timeout';
  if (normalized === 'low_confidence') return 'low_confidence';
  if (normalized === 'parse_error') return 'parse_error';
  if (normalized === 'no_text') return 'no_text';
  if (normalized === 'system_error') return 'system_error';
  return 'unknown';
};

export default function Scanner() {
  const router = useRouter();
  const { user, activateFacultyMode, setPendingFacultyUnlock, refreshUser } = useAuth();

  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<'faculty' | 'student' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [uploadedCourses, setUploadedCourses] = useState<Course[]>([]);
  const [uploadedSemester, setUploadedSemester] = useState<string>('');
  const [uploadedSchoolYear, setUploadedSchoolYear] = useState<string>('');
  const [reportModal, setReportModal] = useState(false);
  const [incidentDetails, setIncidentDetails] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadErrorTitle, setUploadErrorTitle] = useState('Upload Failed');
  const [uploadFailureCategory, setUploadFailureCategory] = useState<ExtractionFailureCategory>('unknown');
  const [failureRetryable, setFailureRetryable] = useState(true);
  const [processingSubtitle, setProcessingSubtitle] = useState('Extracting course data...');
  const [showBehindScenesModal, setShowBehindScenesModal] = useState(false);
  const [backgroundJobId, setBackgroundJobId] = useState('');
  const [showRecentJobsModal, setShowRecentJobsModal] = useState(false);
  const [recentExtractionJobs, setRecentExtractionJobs] = useState<RecentExtractionJob[]>([]);
  const [isLoadingRecentExtractionJobs, setIsLoadingRecentExtractionJobs] = useState(false);
  const [isClearingRecentJobs, setIsClearingRecentJobs] = useState(false);
  const [isClearRecentJobsSupported, setIsClearRecentJobsSupported] = useState(true);
  const [recentJobsFilter, setRecentJobsFilter] = useState<RecentJobsFilter>('all');
  const activePollRef = useRef<ActivePollState | null>(null);
  const backgroundJobUploadTypeRef = useRef<'student' | 'faculty' | null>(null);
  const backgroundJobIsRetryRef = useRef(false);
  const hydratedBackgroundJobRef = useRef(false);

  // Faculty mode unlock modal
  const [showFacultyModeModal, setShowFacultyModeModal] = useState(false);

  // Faculty match modal — shown after student extraction when pending enrollments exist
  const [showFacultyMatchModal, setShowFacultyMatchModal] = useState(false);

  // Extraction preview modal — shown right after extraction succeeds so user can verify
  const [showExtractionPreviewModal, setShowExtractionPreviewModal] = useState(false);
  // Tracks which upload type triggered the current preview (needed by confirm handler)
  const previewUploadTypeRef = useRef<'student' | 'faculty'>('student');

  // Student number modal — shown before first student COR upload when number is not on profile
  const [showStudentNumberModal, setShowStudentNumberModal] = useState(false);
  const [studentNumberInput, setStudentNumberInput] = useState('');
  const [studentNumberSaving, setStudentNumberSaving] = useState(false);
  const [studentNumberError, setStudentNumberError] = useState('');
  // Pending file waiting for student number to be set before upload can proceed
  const pendingUploadFileRef = useRef<any>(null);

  // --- Logic Helpers (Rate Limit, Upload, Etc) ---

  const MAX_REPORT_LENGTH = 500;

  const persistBackgroundJobState = useCallback(async (
    jobId: string,
    uploadType: 'student' | 'faculty',
    isRetry: boolean,
  ) => {
    try {
      const payload: PersistedBackgroundJobState = {
        jobId,
        uploadType,
        isRetry,
        updatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(BACKGROUND_EXTRACTION_JOB_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to persist background extraction job state:', error);
    }
  }, []);

  const clearPersistedBackgroundJobState = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(BACKGROUND_EXTRACTION_JOB_KEY);
    } catch (error) {
      console.error('Failed to clear persisted extraction job state:', error);
    }
  }, []);

  const loadPersistedBackgroundJobState = useCallback(async (): Promise<PersistedBackgroundJobState | null> => {
    try {
      const raw = await AsyncStorage.getItem(BACKGROUND_EXTRACTION_JOB_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<PersistedBackgroundJobState>;
      if (
        typeof parsed?.jobId !== 'string'
        || (parsed?.uploadType !== 'student' && parsed?.uploadType !== 'faculty')
      ) {
        await AsyncStorage.removeItem(BACKGROUND_EXTRACTION_JOB_KEY);
        return null;
      }

      return {
        jobId: parsed.jobId,
        uploadType: parsed.uploadType,
        isRetry: parsed.isRetry === true,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      };
    } catch (error) {
      console.error('Failed to load persisted extraction job state:', error);
      try {
        await AsyncStorage.removeItem(BACKGROUND_EXTRACTION_JOB_KEY);
      } catch (cleanupError) {
        console.error('Failed to remove invalid persisted extraction job state:', cleanupError);
      }
      return null;
    }
  }, []);

  const isAsyncUploadResponse = (value: any): value is UploadCORAcceptedResponse => {
    return Boolean(value && typeof value.job_id === 'string' && value.status === 'processing');
  };

  const clearActivePolling = useCallback(() => {
    if (activePollRef.current) {
      activePollRef.current.cancelToken.isCancelled = true;
      activePollRef.current = null;
    }
  }, []);

  const isRecoverableUploadError = (error: any): boolean => {
    if (error?.response) {
      return false;
    }
    const code = String(error?.code || '').toUpperCase();
    const msg = String(error?.message || '').toLowerCase();
    return (
      code === 'ECONNABORTED' ||
      msg.includes('network error') ||
      msg.includes('timeout') ||
      msg.includes('timed out')
    );
  };

  const buildFailureDescriptor = useCallback((input: ExtractionFailureInput): ExtractionFailureDescriptor => {
    const rawMessage = String(input.message || '').trim();
    const messageLower = rawMessage.toLowerCase();
    const code = String(input.code || '').toUpperCase();

    let category = normalizeFailureCategory(input.failureCategory);
    if (category === 'unknown') {
      if (code === 'STUDENT_NUMBER_MISSING') {
        category = 'metadata_mismatch';
      } else if (
        code === 'OWNERSHIP_MISMATCH'
        || messageLower.includes('does not match your registered student number')
        || messageLower.includes('please upload your own cor')
      ) {
        category = 'ownership_mismatch';
      }
    }

    let retryable = input.retryable !== false;
    if (category === 'ownership_mismatch') {
      retryable = false;
    }

    let title = 'Upload Failed';
    if (category === 'ownership_mismatch') {
      title = 'COR Ownership Check Failed';
    } else if (category === 'metadata_mismatch') {
      title = code === 'STUDENT_NUMBER_MISSING' ? 'Student Number Not Detected' : 'COR Verification Failed';
    } else if (category === 'missing_day') {
      title = 'No Days Detected';
    }

    let message = rawMessage;
    if (!message) {
      if (category === 'ownership_mismatch') {
        message = 'The student number in the document did not match your registered number. Please upload your own COR.';
      } else if (category === 'metadata_mismatch') {
        message = 'We could not verify the student number from your COR. Please upload a clearer document.';
      } else if (category === 'missing_day') {
        message = 'No class days were detected from the uploaded timetable. Please upload a clearer image where day columns are visible.';
      } else {
        message = 'Extraction failed. Please try again.';
      }
    }

    return {
      title,
      message,
      retryable,
      category,
    };
  }, []);

  const handleExtractionSuccess = useCallback(async (
    response: { courses: Course[]; semester?: string; school_year?: string },
    uploadType: 'student' | 'faculty',
    options?: { isRetry?: boolean; alreadyRecorded?: boolean }
  ) => {
    const isRetry = options?.isRetry === true;
    const alreadyRecorded = options?.alreadyRecorded === true;

    if (!response?.courses || response.courses.length === 0) {
      throw new Error(
        'No courses were extracted. Please try again with a clearer image or a valid COR file.'
      );
    }

    await clearPersistedBackgroundJobState();

    // Record one upload attempt when the async job is accepted.
    if (!isRetry && !alreadyRecorded && user?.id) {
      await scheduleStorageService.recordUpload(user.id);
    }

    setUploadedCourses(response.courses);

    if (response.semester) {
      setUploadedSemester(response.semester);
      setUploadedSchoolYear(response.school_year || '');
    } else {
      const detected = detectSemesterFromDate();
      setUploadedSemester(detected.semester);
      setUploadedSchoolYear(detected.schoolYear);
    }

    setIsUploading(false);
    setShowBehindScenesModal(false);
    setBackgroundJobId('');

    // Show preview so the user can verify before saving.
    previewUploadTypeRef.current = uploadType;
    setShowExtractionPreviewModal(true);
  }, [clearPersistedBackgroundJobState, user?.id]);

  const showExtractionFailure = useCallback((input: ExtractionFailureInput) => {
    const failure = buildFailureDescriptor(input);
    setShowBehindScenesModal(false);
    setIsUploading(false);
    setBackgroundJobId('');
    setFailureRetryable(failure.retryable);
    setUploadErrorTitle(failure.title);
    setUploadFailureCategory(failure.category);
    setUploadError(failure.message);
    setReportModal(true);
  }, [buildFailureDescriptor]);

  const finalizeJobFromPush = useCallback(async (activePoll: ActivePollState) => {
    try {
      setProcessingSubtitle('Finalizing extraction...');
      const response = await api.get(`/extraction-jobs/${activePoll.jobId}/`, {
        timeout: 20000,
      });
      const jobStatus = response.data;

      if (jobStatus.status === 'done') {
        await handleExtractionSuccess(jobStatus as ExtractionJobDoneResponse, activePoll.uploadType, {
          isRetry: activePoll.isRetry,
          alreadyRecorded: true,
        });
        return;
      }

      if (jobStatus.status === 'failed') {
        await clearPersistedBackgroundJobState();
        showExtractionFailure({
          message: jobStatus.message,
          retryable: jobStatus.retryable,
          failureCategory: jobStatus.failure_category,
        });
        return;
      }

      setIsUploading(false);
      setShowBehindScenesModal(true);
    } catch {
      setIsUploading(false);
      Alert.alert('Status Check Failed', 'Unable to fetch extraction result. Please check your schedules shortly.');
    }
  }, [clearPersistedBackgroundJobState, handleExtractionSuccess, showExtractionFailure]);

  const reconcileBackgroundJob = useCallback(async (): Promise<boolean> => {
    if (!backgroundJobId) {
      return false;
    }

    try {
      setProcessingSubtitle('Checking latest extraction status...');
      const response = await api.get(`/extraction-jobs/${backgroundJobId}/`, {
        timeout: 20000,
      });
      const jobStatus = response.data;

      if (jobStatus.status === 'done') {
        clearActivePolling();
        setShowBehindScenesModal(false);
        await handleExtractionSuccess(
          jobStatus as ExtractionJobDoneResponse,
          backgroundJobUploadTypeRef.current || selectedRole || 'student',
          {
            isRetry: backgroundJobIsRetryRef.current,
            alreadyRecorded: true,
          }
        );
        return true;
      }

      if (jobStatus.status === 'failed') {
        clearActivePolling();
        await clearPersistedBackgroundJobState();
        showExtractionFailure({
          message: jobStatus.message,
          retryable: jobStatus.retryable,
          failureCategory: jobStatus.failure_category,
        });
        return true;
      }

      setProcessingSubtitle('Extraction is still running in the background...');
      return false;
    } catch (error) {
      console.error('Failed to reconcile background extraction job:', error);
      setProcessingSubtitle('Still processing. You can check again shortly.');
      return false;
    }
  }, [
    backgroundJobId,
    clearActivePolling,
    clearPersistedBackgroundJobState,
    handleExtractionSuccess,
    selectedRole,
    showExtractionFailure,
  ]);

  useEffect(() => {
    if (!backgroundJobId) {
      return;
    }

    const interval = setInterval(() => {
      // If an active poll loop is still running, avoid duplicate status checks.
      if (activePollRef.current) {
        return;
      }
      reconcileBackgroundJob().catch((error) => {
        console.error('Background reconciliation timer error:', error);
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [backgroundJobId, reconcileBackgroundJob]);

  const resumePollingForJob = useCallback(async (
    jobId: string,
    uploadType: 'student' | 'faculty',
    isRetry: boolean
  ) => {
    backgroundJobUploadTypeRef.current = uploadType;
    backgroundJobIsRetryRef.current = isRetry;

    const cancelToken: PollingCancelToken = { isCancelled: false };
    activePollRef.current = {
      jobId,
      uploadType,
      isRetry,
      cancelToken,
    };

    setBackgroundJobId(jobId);
    await persistBackgroundJobState(jobId, uploadType, isRetry);
    setIsUploading(false);
    setShowBehindScenesModal(true);
    setProcessingSubtitle('Extraction is running in the background...');

    const result = await courseService.pollExtractionJob(jobId, {
      maxAttempts: 40,
      intervalMs: 3000,
      cancelToken,
    });

    if (!activePollRef.current || activePollRef.current.jobId !== jobId) {
      return;
    }
    activePollRef.current = null;

    if (result.status === 'done') {
      setShowBehindScenesModal(false);
      await handleExtractionSuccess(result, uploadType, {
        isRetry,
        alreadyRecorded: true,
      });
      return;
    }

    if (result.status === 'failed') {
      await clearPersistedBackgroundJobState();
      showExtractionFailure({
        message: result.message,
        retryable: result.retryable,
        failureCategory: result.failure_category,
      });
      return;
    }

    setShowBehindScenesModal(true);
    setProcessingSubtitle('Still processing in background. We will keep checking status.');
  }, [
    clearPersistedBackgroundJobState,
    handleExtractionSuccess,
    persistBackgroundJobState,
    showExtractionFailure,
  ]);

  const recoverFromRecentJobs = useCallback(async (
    uploadType: 'student' | 'faculty',
    isRetry: boolean
  ): Promise<boolean> => {
    const jobs = await courseService.getRecentExtractionJobs({ uploadType, limit: 5 });
    if (!jobs.length) {
      return false;
    }

    const latestDone = jobs.find((job: RecentExtractionJob) => job.status === 'done' && (job.total_courses || 0) > 0);
    if (latestDone && Array.isArray(latestDone.courses) && latestDone.courses.length > 0) {
      await handleExtractionSuccess(
        {
          courses: latestDone.courses,
          semester: latestDone.semester,
          school_year: latestDone.school_year,
        },
        uploadType,
        {
          isRetry,
          alreadyRecorded: true,
        }
      );
      return true;
    }

    const latestProcessing = jobs.find((job: RecentExtractionJob) => job.status === 'processing');
    if (latestProcessing?.job_id) {
      if (!isRetry && user?.id) {
        await scheduleStorageService.recordUpload(user.id);
      }
      await resumePollingForJob(latestProcessing.job_id, uploadType, isRetry);
      return true;
    }

    return false;
  }, [handleExtractionSuccess, resumePollingForJob, user?.id]);

  const loadRecentExtractionJobs = useCallback(async () => {
    if (!user?.id) {
      setRecentExtractionJobs([]);
      return;
    }

    try {
      setIsLoadingRecentExtractionJobs(true);
      const jobs = await courseService.getRecentExtractionJobs({ limit: 12 });
      setRecentExtractionJobs(jobs);
    } catch (error) {
      console.error('Failed to load recent extraction jobs in scanner:', error);
      setRecentExtractionJobs([]);
    } finally {
      setIsLoadingRecentExtractionJobs(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadRecentExtractionJobs().catch((error) => {
      console.error('Failed to load recent extraction jobs on scanner open:', error);
    });
  }, [loadRecentExtractionJobs]);

  useEffect(() => {
    if (showRecentJobsModal) {
      setRecentJobsFilter('all');
      loadRecentExtractionJobs().catch((error) => {
        console.error('Failed to refresh scanner extraction history modal:', error);
      });
    }
  }, [showRecentJobsModal, loadRecentExtractionJobs]);

  const filteredRecentExtractionJobs = useMemo(() => {
    if (recentJobsFilter === 'all') {
      return recentExtractionJobs;
    }
    return recentExtractionJobs.filter((job) => job.status === recentJobsFilter);
  }, [recentExtractionJobs, recentJobsFilter]);

  const recentJobsCounts = useMemo(() => {
    return {
      all: recentExtractionJobs.length,
      failed: recentExtractionJobs.filter((job) => job.status === 'failed').length,
      processing: recentExtractionJobs.filter((job) => job.status === 'processing').length,
      done: recentExtractionJobs.filter((job) => job.status === 'done').length,
    };
  }, [recentExtractionJobs]);

  const clearableRecentJobsCount = useMemo(() => {
    return recentExtractionJobs.filter((job) => job.status === 'done' || job.status === 'failed').length;
  }, [recentExtractionJobs]);

  const renderJobStatusStyle = useCallback((status: string) => {
    if (status === 'done') return 'bg-emerald-100 text-emerald-700';
    if (status === 'failed') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  }, []);

  const handleClearRecentExtractions = useCallback(() => {
    if (clearableRecentJobsCount === 0) {
      Alert.alert('Nothing to clear', 'Only completed and failed jobs can be cleared right now.');
      return;
    }

    Alert.alert(
      'Clear recent extractions?',
      `This will remove ${clearableRecentJobsCount} completed/failed ${clearableRecentJobsCount === 1 ? 'job' : 'jobs'} from your extraction history.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setIsClearingRecentJobs(true);
            courseService.clearRecentExtractionJobs()
              .then(async (result) => {
                await loadRecentExtractionJobs();

                const keptProcessing = result.remaining_processing || 0;
                if (keptProcessing > 0) {
                  Alert.alert(
                    'History cleared',
                    `Cleared ${result.deleted_count} jobs. ${keptProcessing} active ${keptProcessing === 1 ? 'job is' : 'jobs are'} still processing and kept visible.`
                  );
                } else {
                  Alert.alert('History cleared', `Cleared ${result.deleted_count} recent jobs.`);
                }
              })
              .catch((error) => {
                console.error('Failed to clear recent extraction jobs:', error);
                if (error?.response?.status === 405) {
                  setIsClearRecentJobsSupported(false);
                  Alert.alert(
                    'Clear not available yet',
                    'Your current backend does not support clearing extraction history yet. Please update or redeploy backend, then try again.'
                  );
                } else {
                  Alert.alert('Clear failed', 'Unable to clear recent extraction history right now.');
                }
              })
              .finally(() => {
                setIsClearingRecentJobs(false);
              });
          },
        },
      ]
    );
  }, [clearableRecentJobsCount, loadRecentExtractionJobs]);

  useEffect(() => {
    if (hydratedBackgroundJobRef.current) {
      return;
    }
    hydratedBackgroundJobRef.current = true;

    let isCancelled = false;

    const rehydrateBackgroundJob = async () => {
      const persisted = await loadPersistedBackgroundJobState();
      if (!persisted || isCancelled || activePollRef.current) {
        return;
      }

      backgroundJobUploadTypeRef.current = persisted.uploadType;
      backgroundJobIsRetryRef.current = persisted.isRetry;
      setBackgroundJobId(persisted.jobId);
      setShowBehindScenesModal(true);
      setProcessingSubtitle('Recovered a background extraction job. Reconnecting...');

      try {
        const response = await api.get(`/extraction-jobs/${persisted.jobId}/`, {
          timeout: 20000,
        });
        const jobStatus = response.data;
        if (isCancelled) {
          return;
        }

        if (jobStatus.status === 'done') {
          await handleExtractionSuccess(
            jobStatus as ExtractionJobDoneResponse,
            persisted.uploadType,
            {
              isRetry: persisted.isRetry,
              alreadyRecorded: true,
            }
          );
          return;
        }

        if (jobStatus.status === 'failed') {
          await clearPersistedBackgroundJobState();
          setBackgroundJobId('');
          showExtractionFailure({
            message: jobStatus.message,
            retryable: jobStatus.retryable,
            failureCategory: jobStatus.failure_category,
          });
          return;
        }
      } catch (error) {
        console.error('Failed to restore persisted extraction job status:', error);
      }

      if (!isCancelled) {
        await resumePollingForJob(persisted.jobId, persisted.uploadType, persisted.isRetry);
      }
    };

    rehydrateBackgroundJob().catch((error) => {
      console.error('Background extraction rehydration failed:', error);
    });

    return () => {
      isCancelled = true;
    };
  }, [
    clearPersistedBackgroundJobState,
    handleExtractionSuccess,
    loadPersistedBackgroundJobState,
    resumePollingForJob,
    showExtractionFailure,
  ]);

  useEffect(() => {
    const handleExtractionNotification = async (rawData: unknown) => {
      const data = (rawData ?? {}) as Record<string, any>;
      if (data.type !== 'extraction_job' || typeof data.job_id !== 'string') {
        return;
      }

      const activePoll = activePollRef.current;
      if (!activePoll || activePoll.jobId !== data.job_id) {
        return;
      }

      activePoll.cancelToken.isCancelled = true;
      activePollRef.current = null;
      await finalizeJobFromPush(activePoll);
    };

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      handleExtractionNotification(notification.request.content.data).catch((error) => {
        console.error('Failed to handle extraction notification:', error);
      });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleExtractionNotification(response.notification.request.content.data).catch((error) => {
        console.error('Failed to handle extraction notification response:', error);
      });
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
      clearActivePolling();
    };
  }, [clearActivePolling, finalizeJobFromPush]);

  const handleSubmit = async () => {
    const sanitizedDetails = incidentDetails.trim().slice(0, MAX_REPORT_LENGTH);
    if (!sanitizedDetails) return;

    try {
      await api.post('/reports/submit/', {
        description: sanitizedDetails,
        upload_error: uploadError,
      });
      Alert.alert('Report Submitted', 'Thank you — our team will investigate.');
    } catch (error: any) {
      console.error('Failed to submit report:', error);
      Alert.alert('Submission Failed', 'Could not send your report. Please try again later.');
    }
    dismissErrorModal();
  };

  const dismissErrorModal = () => {
    setReportModal(false);
    setUploadError('');
    setUploadErrorTitle('Upload Failed');
    setUploadFailureCategory('unknown');
    setIncidentDetails('');
    setFailureRetryable(true);
  };

  const checkRateLimit = async (): Promise<boolean> => {
    if (!user?.id) {
      Alert.alert('Error', 'User not authenticated');
      return false;
    }
    const { allowed, remainingSeconds } = await scheduleStorageService.canUpload(user.id);
    if (!allowed) {
      Alert.alert('Please Wait', `You can upload again in ${remainingSeconds} seconds.\n\nRate limit: 1 upload per minute.`);
      return false;
    }
    return true;
  };

  const STUDENT_NUMBER_REGEX = /^\d{4}-\d{4,6}$/;

  const handleRoleSelection = (role: 'faculty' | 'student') => {
    setSelectedRole(role);
    // If switching to student mode and the user has no student number yet,
    // immediately show the student number collection modal.
    if (role === 'student' && !user?.student_number) {
      setStudentNumberInput('');
      setStudentNumberError('');
      pendingUploadFileRef.current = null; // no file pending yet, just pre-collecting
      setShowStudentNumberModal(true);
    }
  };

  /**
   * Save the student number via API, refresh user context, then optionally
   * proceed with a pending file upload.
   */
  const handleSaveStudentNumber = async () => {
    const trimmed = studentNumberInput.trim();
    if (!STUDENT_NUMBER_REGEX.test(trimmed)) {
      setStudentNumberError('Use format YYYY-NNNNN (e.g., 2022-01191)');
      return;
    }

    try {
      setStudentNumberSaving(true);
      setStudentNumberError('');
      await authService.setStudentNumber(trimmed);
      await refreshUser(); // sync updated user into AuthContext
      setShowStudentNumberModal(false);

      // If the modal was triggered mid-upload (STUDENT_NUMBER_REQUIRED response),
      // resume the upload automatically now that the number is saved.
      const pending = pendingUploadFileRef.current;
      if (pending) {
        pendingUploadFileRef.current = null;
        await uploadFile(pending.file, pending.uploadType, pending.options);
      }
    } catch (error: any) {
      const data = error?.response?.data || {};
      if (data.code === 'STUDENT_NUMBER_TAKEN') {
        setStudentNumberError('This student number is already registered to another account.');
      } else if (data.code === 'STUDENT_NUMBER_ALREADY_SET') {
        // Edge case: another device already set it — just dismiss and proceed
        setShowStudentNumberModal(false);
        await refreshUser();
      } else if (data.code === 'INVALID_FORMAT') {
        setStudentNumberError('Invalid format. Use YYYY-NNNNN (e.g., 2022-01191).');
      } else {
        setStudentNumberError('Failed to save. Please try again.');
      }
    } finally {
      setStudentNumberSaving(false);
    }
  };

  const handleConfirmStudentNumberPress = () => {
    const trimmed = studentNumberInput.trim();
    if (!STUDENT_NUMBER_REGEX.test(trimmed)) {
      setStudentNumberError('Use format YYYY-NNNNN (e.g., 2022-01191)');
      return;
    }

    Alert.alert(
      'Confirm Student Number',
      `You entered ${trimmed}. This cannot be changed later. Continue?`,
      [
        {
          text: 'Edit',
          style: 'cancel',
        },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: () => {
            handleSaveStudentNumber().catch((error) => {
              console.error('Failed to save confirmed student number:', error);
            });
          },
        },
      ]
    );
  };

  const handleDocumentUpload = async () => {
    if (!selectedRole) { Alert.alert('Error', 'Please select a role first'); return; }
    if (!(await checkRateLimit())) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setSelectedFile({ uri: file.uri, name: file.name, mimeType: file.mimeType, size: file.size, uploadType: selectedRole });
        await uploadFile(file, selectedRole);
      }
    } catch {
      showExtractionFailure({ message: 'Failed to pick document. Please try again.', retryable: true });
    }
  };

  const handleImageGallery = async () => {
    if (!selectedRole) { Alert.alert('Error', 'Please select a role first'); return; }
    if (!(await checkRateLimit())) return;

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8, // Reduced quality for faster upload while maintaining OCR readability
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const image = result.assets[0];
        setSelectedFile({ uri: image.uri, name: 'image.jpg', mimeType: 'image/jpeg', uploadType: selectedRole });
        await uploadFile(image, selectedRole);
      }
    } catch {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleCameraCapture = async () => {
    if (!selectedRole) { Alert.alert('Error', 'Please select a role first'); return; }
    if (!(await checkRateLimit())) return;

    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8, // Reduced quality for faster upload while maintaining OCR readability
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const image = result.assets[0];
        setSelectedFile({ uri: image.uri, name: 'camera-capture.jpg', mimeType: 'image/jpeg', uploadType: selectedRole });
        await uploadFile(image, selectedRole);
      }
    } catch {
      Alert.alert('Error', 'Failed to capture image');
    }
  };

  // Upload function to backend
  const uploadFile = async (
    file: any,
    uploadType: 'student' | 'faculty',
    options?: { isRetry?: boolean; confirmOldSchedule?: boolean }
  ) => {
    const isRetry = options?.isRetry === true;
    const confirmOldSchedule = options?.confirmOldSchedule === true;
    setFailureRetryable(true);
    setUploadErrorTitle('Upload Failed');
    setUploadFailureCategory('unknown');
    setIsUploading(true);
    setProcessingSubtitle('Uploading document...');
    try {
      const response = await courseService.uploadCOR(file, uploadType, {
        confirmOldSchedule,
      });

      if (isAsyncUploadResponse(response)) {
        if (!isRetry && user?.id) {
          await scheduleStorageService.recordUpload(user.id);
        }

        await resumePollingForJob(response.job_id, uploadType, isRetry);
        return;
      }

      await handleExtractionSuccess(response, uploadType, { isRetry });
    } catch (error: any) {
      const responsePayload = error?.response?.data || {};

      if (responsePayload.code === 'STUDENT_NUMBER_REQUIRED') {
        // User has no student number on profile yet — show collection modal.
        // Store the file + options so the modal's confirm handler can retry.
        setIsUploading(false);
        setShowBehindScenesModal(false);
        pendingUploadFileRef.current = { file, uploadType, options };
        setStudentNumberInput('');
        setStudentNumberError('');
        setShowStudentNumberModal(true);
        return;
      }

      if (responsePayload.code === 'OLD_SCHEDULE_CONFIRM_REQUIRED' && !confirmOldSchedule) {
        setIsUploading(false);
        setShowBehindScenesModal(false);

        const detectedTerm = [responsePayload.detected_semester, responsePayload.detected_school_year]
          .filter(Boolean)
          .join(' ');
        const currentTerm = [responsePayload.current_semester, responsePayload.current_school_year]
          .filter(Boolean)
          .join(' ');
        const fallbackMessage = detectedTerm && currentTerm
          ? `Detected ${detectedTerm}, which looks older than current term ${currentTerm}. Save and process this old schedule anyway?`
          : 'This document appears to be from an older term. Save and process this old schedule anyway?';

        Alert.alert(
          'Old Schedule Detected',
          responsePayload.message || fallbackMessage,
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Save Old Schedule',
              onPress: () => {
                uploadFile(file, uploadType, {
                  isRetry,
                  confirmOldSchedule: true,
                }).catch((confirmError) => {
                  console.error('Confirmed old-schedule upload failed:', confirmError);
                });
              },
            },
          ]
        );
        return;
      }

      if (isRecoverableUploadError(error)) {
        try {
          setProcessingSubtitle('Checking extraction status...');
          const recovered = await recoverFromRecentJobs(uploadType, isRetry);
          if (recovered) {
            return;
          }
        } catch (recoveryError) {
          console.error('Recovery from recent extraction jobs failed:', recoveryError);
        }
      }

      showExtractionFailure({
        message:
          responsePayload.error ||
          responsePayload.message ||
          (isRecoverableUploadError(error)
            ? 'Upload request timed out on the network. Extraction may still be running in the background. Please wait for notification or retry shortly.'
            : error.message) ||
          'Failed to upload file. Please try again.',
        retryable: responsePayload.retryable,
        failureCategory: responsePayload.failure_category || responsePayload.category,
        code: responsePayload.code,
      });
    }
  };

  const retryExtraction = async (source: 'error' | 'save') => {
    if (!selectedFile || !selectedRole) {
      Alert.alert('Retry Unavailable', 'No uploaded file found. Please pick a file again.');
      return;
    }

    if (source === 'save') {
      setShowTitleModal(false);
    }

    setReportModal(false);
    setFailureRetryable(true);
    setUploadErrorTitle('Upload Failed');
    setUploadFailureCategory('unknown');
    setUploadError('');
    await uploadFile(selectedFile, selectedRole, { isRetry: true });
  };

  const saveScheduleOnly = async () => {
    if (!scheduleTitle.trim()) { Alert.alert('Error', 'Please enter a schedule title'); return; }
    if (!user?.id) { Alert.alert('Error', 'User not authenticated'); return; }
    try {
      await scheduleStorageService.saveSchedule(scheduleTitle.trim(), uploadedCourses, selectedRole!, user.id, false, uploadedSemester, uploadedSchoolYear);
      setShowTitleModal(false);

      // If this was a faculty schedule and user is not yet faculty, show unlock modal
      if (selectedRole === 'faculty' && user.user_type !== 'faculty') {
        setShowFacultyModeModal(true);
      } else {
        Alert.alert('Saved!', `Schedule "${scheduleTitle}" saved.`, [
          { text: 'OK', onPress: () => { resetScanner(); router.push(selectedRole === 'student' ? '/Home/Schedules/student' : '/Home/Schedules/faculty'); } }
        ]);
      }
    } catch {
      Alert.alert('Error', 'Failed to save schedule.');
    }
  };

  const saveAndApplyReminders = async () => {
    if (!scheduleTitle.trim()) { Alert.alert('Error', 'Please enter a schedule title'); return; }
    if (!user?.id) { Alert.alert('Error', 'User not authenticated'); return; }
    try {
      await scheduleStorageService.saveSchedule(scheduleTitle.trim(), uploadedCourses, selectedRole!, user.id, true, uploadedSemester, uploadedSchoolYear);
      setShowTitleModal(false);

      // If this was a faculty schedule and user is not yet faculty, show unlock modal
      if (selectedRole === 'faculty' && user.user_type !== 'faculty') {
        setShowFacultyModeModal(true);
      } else {
        Alert.alert('Success!', `Schedule "${scheduleTitle}" is now active!`, [
          { text: 'OK', onPress: () => { resetScanner(); router.replace('/Home/home'); } }
        ]);
      }
    } catch {
      Alert.alert('Error', 'Failed to save schedule.');
    }
  };

  const handleFacultyModeConfirm = async () => {
    const success = await activateFacultyMode();
    setShowFacultyModeModal(false);
    if (success) {
      Alert.alert(
        'Faculty Mode Activated!',
        'You now have access to class management features — generate class codes, assign tasks, and track student progress.',
        [{ text: 'View Faculty Schedules', onPress: () => { resetScanner(); router.push('/Home/Schedules/faculty'); } }]
      );
    } else {
      Alert.alert('Error', 'Failed to activate faculty mode. Please try again from Settings.');
      resetScanner();
      router.replace('/Home/home');
    }
  };

  const handleFacultyModeDismiss = () => {
    setShowFacultyModeModal(false);
    // Set pending flag so the banner appears on home screen
    setPendingFacultyUnlock(true);
    Alert.alert('Saved!', `Schedule "${scheduleTitle}" saved. You can switch to Faculty Mode anytime from your account settings.`, [
      { text: 'OK', onPress: () => { resetScanner(); router.replace('/Home/home'); } }
    ]);
  };

  const resetScanner = () => {
    clearActivePolling();
    clearPersistedBackgroundJobState().catch((error) => {
      console.error('Failed to clear persisted extraction job state during reset:', error);
    });
    backgroundJobUploadTypeRef.current = null;
    backgroundJobIsRetryRef.current = false;
    setSelectedFile(null);
    setSelectedRole(null);
    setScheduleTitle('');
    setUploadedCourses([]);
    setUploadedSemester('');
    setUploadedSchoolYear('');
    setUploadErrorTitle('Upload Failed');
    setUploadFailureCategory('unknown');
    setFailureRetryable(true);
    setShowBehindScenesModal(false);
    setBackgroundJobId('');
  };

  const canRetryExtraction = Boolean(selectedFile && selectedRole && failureRetryable);
  const isOwnershipMismatchFailure = uploadFailureCategory === 'ownership_mismatch';

  // ─── Extraction preview handlers ────────────────────────────────────────

  /**
   * User confirmed the preview looks correct. Now check for faculty matches
   * (student uploads) before proceeding to the save-title modal.
   */
  const handlePreviewConfirm = useCallback(async () => {
    setShowExtractionPreviewModal(false);

    const uploadType = previewUploadTypeRef.current;

    if (uploadType === 'student') {
      try {
        let pendingCount = 0;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const pending = await pendingEnrollmentService.getPendingEnrollments();
          pendingCount = pending.count || 0;
          if (pendingCount > 0) break;
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700));
        }
        if (pendingCount > 0) {
          setShowFacultyMatchModal(true);
          return;
        }
      } catch {
        // Silently ignore — don't block the success flow
      }
    }

    setShowTitleModal(true);
  }, []);

  /** User wants to re-upload the same file. */
  const handlePreviewRetry = useCallback(() => {
    setShowExtractionPreviewModal(false);
    setUploadedCourses([]);
    setUploadedSemester('');
    setUploadedSchoolYear('');
    if (selectedFile && selectedRole) {
      uploadFile(selectedFile, selectedRole, { isRetry: true }).catch((err) => {
        console.error('Preview retry upload failed:', err);
      });
    } else {
      Alert.alert('Retry Unavailable', 'No file found to retry. Please pick a new file.');
    }
  }, [selectedFile, selectedRole]); // eslint-disable-line react-hooks/exhaustive-deps

  /** User dismissed the preview without saving. */
  const handlePreviewDiscard = useCallback(() => {
    setShowExtractionPreviewModal(false);
    resetScanner();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const LeftPointingArrow = ({ size = 24, color = '#ffffff' }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <Path d="M19 12H6M12 5l-7 7 7 7" />
    </Svg>
  );

  return (
    <View className="flex-1 bg-[#B88080]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 pt-12 pb-4 z-20">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 rounded-full bg-white/10">
          <LeftPointingArrow size={24} color="#ffffff" />
        </TouchableOpacity>

        <Text className="text-white text-lg font-bold tracking-wide">
          {!selectedRole ? "Select Role" : selectedFile ? "Preview" : "Scanner"}
        </Text>

        <View className="w-10" />
      </View>

      {/* Main Content Area */}
      <View className="flex-1 px-6">

        {!selectedRole ? (
          /* --- NEW ROLE SELECTION SCREEN --- */
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 32, paddingBottom: 80 }}>
            <Text className="text-white text-3xl font-bold mb-2">Welcome,</Text>
            <Text className="text-white/80 text-lg mb-8">Who is this schedule for?</Text>

            <View className="gap-4">
              {/* Student Card */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => handleRoleSelection('student')}
                className="bg-white rounded-2xl p-5 flex-row items-center shadow-sm"
              >
                <View className="bg-red-100 p-3 rounded-full mr-4">
                  <GraduationCap size={28} color="#5C2E2E" />
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-bold text-gray-900">Student</Text>
                  <Text className="text-gray-500 text-sm">Scan study load</Text>
                </View>
                <ArrowRight size={20} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Faculty Card */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => handleRoleSelection('faculty')}
                className="bg-white rounded-2xl p-5 flex-row items-center shadow-sm"
              >
                <View className="bg-orange-100 p-3 rounded-full mr-4">
                  <Briefcase size={28} color="#7C2D12" />
                </View>
                <View className="flex-1">
                  <Text className="text-xl font-bold text-gray-900">Faculty</Text>
                  <Text className="text-gray-500 text-sm">Scan teaching load</Text>
                </View>
                <ArrowRight size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Immediate recent extractions access */}
            <View className="mt-6 bg-white/90 rounded-2xl p-4 border border-white/60">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-bold text-gray-900">Recent Extractions</Text>
                <TouchableOpacity onPress={() => setShowRecentJobsModal(true)}>
                  <Text className="text-xs font-semibold text-[#7C2D12]">View all</Text>
                </TouchableOpacity>
              </View>

              {isLoadingRecentExtractionJobs ? (
                <View className="py-3 flex-row items-center">
                  <ActivityIndicator size="small" color="#B88080" />
                  <Text className="text-xs text-gray-500 ml-2">Loading extraction history...</Text>
                </View>
              ) : recentExtractionJobs.length === 0 ? (
                <Text className="text-xs text-gray-500 py-2">No recent extraction jobs yet.</Text>
              ) : (
                <>
                  {recentExtractionJobs.slice(0, 3).map((job) => (
                    <View key={job.job_id} className="border border-gray-100 rounded-lg p-2 mb-2 last:mb-0 bg-white">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-[11px] font-semibold text-gray-700 flex-1 mr-2" numberOfLines={1}>
                          {job.file_name || job.job_id}
                        </Text>
                        <View className={`px-2 py-0.5 rounded-full ${renderJobStatusStyle(job.status)}`}>
                          <Text className="text-[10px] font-bold uppercase">{job.status}</Text>
                        </View>
                      </View>
                    </View>
                  ))}

                  <View className="flex-row mt-3">
                    <TouchableOpacity
                      onPress={() => setShowRecentJobsModal(true)}
                      className="flex-1 mr-2 py-2 rounded-lg bg-gray-100"
                      activeOpacity={0.8}
                    >
                      <Text className="text-xs text-center font-semibold text-gray-700">Manage</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleClearRecentExtractions}
                      disabled={!isClearRecentJobsSupported || isClearingRecentJobs || clearableRecentJobsCount === 0}
                      className="flex-1 py-2 rounded-lg bg-red-50 border border-red-100"
                      style={{ opacity: !isClearRecentJobsSupported || isClearingRecentJobs || clearableRecentJobsCount === 0 ? 0.5 : 1 }}
                      activeOpacity={0.8}
                    >
                      <Text className="text-xs text-center font-semibold text-red-700">
                        {isClearingRecentJobs ? 'Clearing...' : 'Clear'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>

        ) : (
          /* --- SCANNER VIEW (Active once role is selected) --- */
          <View className="flex-1 items-center pt-8">

            {/* Viewfinder Center */}
            <View className="w-full aspect-[3/4] relative justify-center items-center">
              {/* Corner Brackets */}
              <View className="absolute top-0 left-0 w-12 h-12 border-l-4 border-t-4 border-white" />
              <View className="absolute top-0 right-0 w-12 h-12 border-r-4 border-t-4 border-white" />
              <View className="absolute bottom-0 left-0 w-12 h-12 border-l-4 border-b-4 border-white" />
              <View className="absolute bottom-0 right-0 w-12 h-12 border-r-4 border-b-4 border-white" />

              <View className="w-full h-full relative p-4">
                {selectedFile ? (
                  /* Preview Image */
                  <View className="w-full h-full rounded-lg overflow-hidden bg-white/10 border border-white/30">
                    {selectedFile.mimeType?.startsWith('image/') ? (
                      <Image source={{ uri: selectedFile.uri }} className="w-full h-full" resizeMode="contain" />
                    ) : (
                      <View className="flex-1 justify-center items-center bg-white/90">
                        <Files size={64} color="#B88080" />
                        <Text className="text-gray-800 font-bold text-lg mt-4 text-center px-4">{selectedFile.name}</Text>
                        <Text className="text-gray-500 mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  /* Empty State Text */
                  <View className="flex-1 justify-center items-center">
                    <Text className="text-white/50 text-center font-medium">Align schedule within frame</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Bottom Controls */}
            <View className="flex-row justify-around items-center w-full mt-10 px-8 py-4 bg-white/10 rounded-3xl">
              <TouchableOpacity onPress={handleImageGallery} className="p-3 bg-white rounded-full">
                <Images size={24} color="#444" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={selectedFile ? resetScanner : handleCameraCapture}
                className="w-16 h-16 bg-white rounded-full justify-center items-center border-4 border-[#B88080]"
              >
                <View className="w-12 h-12 bg-[#B88080] rounded-full" />
              </TouchableOpacity>

              <TouchableOpacity onPress={handleDocumentUpload} className="p-3 bg-white rounded-full">
                <Files size={24} color="#444" />
              </TouchableOpacity>
            </View>

            {/* Role Indicator */}
            <View className="mt-6 bg-black/20 px-4 py-1 rounded-full">
              <Text className="text-white text-xs font-medium uppercase tracking-widest">{selectedRole} Mode</Text>
            </View>

            {/* Extraction history entrypoint lives in Scanner */}
            <TouchableOpacity
              onPress={() => setShowRecentJobsModal(true)}
              className="mt-3 bg-white/90 px-4 py-2 rounded-full"
              activeOpacity={0.85}
            >
              <Text className="text-xs font-semibold text-[#5C2E2E]">
                Recent Extraction Jobs {recentJobsCounts.failed > 0 ? `(${recentJobsCounts.failed} failed)` : ''}
              </Text>
            </TouchableOpacity>

          </View>
        )}
      </View>

      {/* Loading Overlay */}
      {isUploading && (
        <View className="absolute inset-0 bg-black/50 justify-center items-center z-50">
          <View className="bg-white rounded-xl p-6 items-center w-64">
            <ActivityIndicator size="large" color="#B88080" />
            <Text className="mt-4 text-lg font-bold text-gray-800">Processing</Text>
            <Text className="text-sm text-gray-500 mt-1">{processingSubtitle}</Text>
            <Text className="text-xs text-gray-400 mt-2 text-center">
              We will continue this in the background after upload is accepted.
            </Text>
          </View>
        </View>
      )}

      <Modal
        visible={showBehindScenesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBehindScenesModal(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="bg-white rounded-2xl p-6 w-full shadow-lg">
            <Text className="text-xl font-bold text-gray-900 mb-2">Extraction Running in Background</Text>
            <Text className="text-sm text-gray-600 leading-5 mb-3">
              Your file is accepted and being processed on our server. You can safely leave this page and keep using the app.
            </Text>
            <Text className="text-sm text-gray-600 leading-5 mb-4">
              We will send a notification when your schedule is extracted and saved.
            </Text>

            {backgroundJobId ? (
              <View className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 mb-4">
                <Text className="text-xs text-gray-500">Job ID</Text>
                <Text className="text-xs text-gray-700 mt-1">{backgroundJobId}</Text>
              </View>
            ) : null}

            <Text className="text-xs text-gray-500 mb-4">{processingSubtitle}</Text>

            <View className="gap-3">
              <TouchableOpacity
                className="bg-gray-100 py-3 rounded-xl"
                onPress={() => {
                  reconcileBackgroundJob().catch((error) => {
                    console.error('Manual background job check failed:', error);
                  });
                }}
              >
                <Text className="text-center font-semibold text-gray-700">Check Status Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-[#B88080] py-3 rounded-xl"
                onPress={() => {
                  setShowBehindScenesModal(false);
                  router.replace('/Home/home');
                }}
              >
                <Text className="text-center font-bold text-white">Continue Using App</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-gray-100 py-3 rounded-xl"
                onPress={() => setShowBehindScenesModal(false)}
              >
                <Text className="text-center font-semibold text-gray-700">Stay Here</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Title Input Modal */}
      <Modal
        visible={showTitleModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowTitleModal(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-6">
          <View className="bg-white rounded-2xl p-6 w-full shadow-lg">
            <Text className="text-xl font-bold text-gray-800 mb-1">Save Schedule</Text>
            <Text className="text-sm text-gray-500 mb-4">{uploadedCourses.length} courses extracted</Text>

            <TouchableOpacity
              className="bg-gray-100 py-2 rounded-xl mb-4"
              onPress={() => retryExtraction('save')}
              disabled={isUploading || !canRetryExtraction}
              style={{ opacity: !canRetryExtraction || isUploading ? 0.5 : 1 }}
            >
              <Text className="text-center font-semibold text-gray-700">
                {failureRetryable ? 'Retry Extraction' : 'Retry Not Available'}
              </Text>
            </TouchableOpacity>

            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3 text-base"
              placeholder="e.g., 1st Sem 2025"
              value={scheduleTitle}
              onChangeText={setScheduleTitle}
              autoFocus
            />

            {/* Semester Picker */}
            <Text className="text-sm font-semibold text-gray-700 mb-2">Semester</Text>
            <View className="flex-row gap-2 mb-3">
              {[
                { label: '1st Sem', value: '1ST' },
                { label: '2nd Sem', value: '2ND' },
                { label: 'Summer', value: 'SUMMER' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setUploadedSemester(opt.value)}
                  className={`flex-1 py-2 rounded-lg border ${uploadedSemester === opt.value
                      ? 'bg-[#B88080] border-[#B88080]'
                      : 'bg-gray-50 border-gray-200'
                    }`}
                >
                  <Text
                    className={`text-center text-sm font-semibold ${uploadedSemester === opt.value ? 'text-white' : 'text-gray-600'
                      }`}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* School Year */}
            <Text className="text-sm font-semibold text-gray-700 mb-2">School Year</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 text-base"
              placeholder="e.g., 2025-2026"
              value={uploadedSchoolYear}
              onChangeText={setUploadedSchoolYear}
            />

            <View className="gap-3">
              <TouchableOpacity className="bg-[#B88080] py-3 rounded-xl" onPress={saveAndApplyReminders}>
                <Text className="text-center font-bold text-white">Save & Apply Active</Text>
              </TouchableOpacity>

              <TouchableOpacity className="bg-gray-100 py-3 rounded-xl" onPress={saveScheduleOnly}>
                <Text className="text-center font-semibold text-gray-700">Save Only</Text>
              </TouchableOpacity>

              <TouchableOpacity className="py-2" onPress={() => { setShowTitleModal(false); setScheduleTitle(''); resetScanner(); }}>
                <Text className="text-center text-gray-400">Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Scanner extraction history modal */}
      <Modal
        visible={showRecentJobsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRecentJobsModal(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-5">
          <View className="bg-white rounded-2xl w-full max-h-[80%] p-5">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-lg font-bold text-gray-900">Recent Extraction Jobs</Text>
              <View className="flex-row items-center">
                <TouchableOpacity
                  onPress={handleClearRecentExtractions}
                  disabled={!isClearRecentJobsSupported || isClearingRecentJobs || clearableRecentJobsCount === 0}
                  className="mr-3"
                >
                  <Text className="text-sm font-semibold text-red-600" style={{ opacity: !isClearRecentJobsSupported || isClearingRecentJobs || clearableRecentJobsCount === 0 ? 0.45 : 1 }}>
                    {isClearingRecentJobs ? 'Clearing...' : 'Clear'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowRecentJobsModal(false)}>
                  <Text className="text-sm font-semibold text-gray-500">Close</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text className="text-xs text-gray-500 mb-1">
              {isClearRecentJobsSupported
                ? 'Clear removes completed and failed jobs. Active processing jobs remain visible.'
                : 'Clear is unavailable on your current backend version.'}
            </Text>

            <Text className="text-xs text-gray-500 mb-2">
              {recentJobsCounts.failed > 0
                ? `${recentJobsCounts.failed} failed ${recentJobsCounts.failed === 1 ? 'job' : 'jobs'} need attention.`
                : 'No failed jobs right now.'}
            </Text>

            <View className="h-px bg-gray-100 mb-3" />

            <Text className="text-xs text-gray-500 mb-3">
              {selectedRole ? `${selectedRole.toUpperCase()} uploads` : 'Upload history'}
            </Text>

            <TouchableOpacity
              onPress={() => {
                loadRecentExtractionJobs().catch((error) => {
                  console.error('Manual scanner extraction history refresh failed:', error);
                });
              }}
              className="self-start mb-3 px-3 py-1.5 bg-gray-100 rounded-full"
              activeOpacity={0.75}
            >
              <Text className="text-xs font-semibold text-gray-700">Refresh</Text>
            </TouchableOpacity>

            <View className="flex-row flex-wrap mb-3">
              {([
                { key: 'all', label: 'All' },
                { key: 'failed', label: 'Failed' },
                { key: 'processing', label: 'Processing' },
                { key: 'done', label: 'Done' },
              ] as { key: RecentJobsFilter; label: string }[]).map((option) => {
                const isActive = recentJobsFilter === option.key;
                const count = recentJobsCounts[option.key];
                return (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => setRecentJobsFilter(option.key)}
                    className={`mr-2 mb-2 px-3 py-1.5 rounded-full border ${
                      isActive
                        ? 'bg-[#B88080] border-[#B88080]'
                        : 'bg-white border-gray-200'
                    }`}
                    activeOpacity={0.75}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        isActive ? 'text-white' : 'text-gray-700'
                      }`}
                    >
                      {option.label} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {isLoadingRecentExtractionJobs ? (
              <View className="py-6 flex-row items-center justify-center">
                <ActivityIndicator size="small" color="#B88080" />
                <Text className="text-sm text-gray-500 ml-2">Loading extraction history...</Text>
              </View>
            ) : filteredRecentExtractionJobs.length === 0 ? (
              <View className="py-6">
                <Text className="text-sm text-gray-500 text-center">
                  {recentJobsFilter === 'all'
                    ? 'No recent extraction jobs yet.'
                    : `No ${recentJobsFilter} jobs in recent history.`}
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {filteredRecentExtractionJobs.map((job) => {
                  const statusStyle = renderJobStatusStyle(job.status);

                  const actionLabel =
                    job.status === 'done'
                      ? 'View Schedules'
                      : job.status === 'processing'
                        ? 'Track Status'
                        : 'Try New Upload';

                  return (
                    <View key={job.job_id} className="border border-gray-100 rounded-xl p-3 mb-2">
                      <View className="flex-row items-center justify-between mb-1">
                        <Text className="text-xs font-semibold text-gray-700 flex-1 mr-2" numberOfLines={1}>
                          {job.file_name || job.job_id}
                        </Text>
                        <View className={`px-2 py-0.5 rounded-full ${statusStyle}`}>
                          <Text className="text-[10px] font-bold uppercase">{job.status}</Text>
                        </View>
                      </View>

                      <Text className="text-[11px] text-gray-500 mb-2" numberOfLines={2}>
                        {job.message || 'Extraction status available.'}
                      </Text>

                      <TouchableOpacity
                        onPress={() => {
                          if (job.status === 'done') {
                            setShowRecentJobsModal(false);
                            router.push('/Home/schedules');
                            return;
                          }

                          if (job.status === 'processing' && job.job_id) {
                            const uploadTypeForJob =
                              job.upload_type === 'faculty' || job.upload_type === 'student'
                                ? job.upload_type
                                : (selectedRole || 'student');
                            setShowRecentJobsModal(false);
                            setProcessingSubtitle('Reconnecting to extraction job...');
                            resumePollingForJob(job.job_id, uploadTypeForJob, false).catch((error) => {
                              console.error('Failed to reconnect extraction polling:', error);
                            });
                            return;
                          }

                          setShowRecentJobsModal(false);
                        }}
                        className="self-start px-3 py-1.5 bg-gray-100 rounded-full"
                      >
                        <Text className="text-[10px] font-semibold text-gray-700">{actionLabel}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Extraction Preview Modal \u2014 shown after successful scan for user to verify */}
      <ExtractionPreviewModal
        visible={showExtractionPreviewModal}
        courses={uploadedCourses}
        semester={uploadedSemester}
        schoolYear={uploadedSchoolYear}
        uploadType={previewUploadTypeRef.current}
        onConfirm={() => {
          handlePreviewConfirm().catch((err) => {
            console.error('Preview confirm failed:', err);
          });
        }}
        onRetry={handlePreviewRetry}
        onDiscard={handlePreviewDiscard}
      />

      {/* Faculty Mode Unlock Modal */}
      <FacultyModeModal
        visible={showFacultyModeModal}
        onConfirm={handleFacultyModeConfirm}
        onDismiss={handleFacultyModeDismiss}
      />

      {/* Faculty Match Modal — shown after student extraction when matches exist */}
      <FacultyMatchModal
        visible={showFacultyMatchModal}
        onClose={() => {
          setShowFacultyMatchModal(false);
          // User skipped matching — proceed to save title modal
          setShowTitleModal(true);
        }}
        onAccepted={(_count) => {
          setShowFacultyMatchModal(false);
          // Matches accepted — proceed to save title modal
          setShowTitleModal(true);
        }}
      />

      {/* Student Number Collection Modal
          Shown when a user without a student number selects Student mode or
          tries to upload a student COR. Collects the number, saves it via
          PATCH /api/auth/student-number/, then resumes any pending upload. */}
      <Modal
        visible={showStudentNumberModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!studentNumberSaving) {
            setShowStudentNumberModal(false);
            pendingUploadFileRef.current = null;
          }
        }}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10">
            {/* Header */}
            <View className="items-center mb-5">
              <View className="bg-red-100 rounded-full p-3 mb-3">
                <GraduationCap size={28} color="#7C1515" />
              </View>
              <Text className="text-xl font-bold text-gray-900">Enter Your Student Number</Text>
              <Text className="text-sm text-gray-500 text-center mt-1">
                Required before uploading a Student COR
              </Text>
            </View>

            {/* Information banner */}
            <View className="flex-row bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 items-start">
              <Info size={16} color="#B45309" style={{ marginTop: 2 }} />
              <View className="flex-1 ml-2">
                <Text className="text-xs font-semibold text-amber-800 mb-1">Why do we need this?</Text>
                <Text className="text-xs text-amber-700 leading-4">
                  Your student number is matched against the one on your Certificate of Registration to confirm ownership. It can only be set once.
                </Text>
              </View>
            </View>

            {/* Input */}
            <Text className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Student Number</Text>
            <TextInput
              className={`border rounded-xl px-4 py-3 text-base text-gray-800 mb-1 ${
                studentNumberError ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50'
              }`}
              placeholder="e.g. 2022-01191"
              placeholderTextColor="#9CA3AF"
              value={studentNumberInput}
              onChangeText={(t) => {
                setStudentNumberInput(t);
                if (studentNumberError) setStudentNumberError('');
              }}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!studentNumberSaving}
            />

            {/* Error / hint */}
            {studentNumberError ? (
              <View className="flex-row items-center mb-3">
                <AlertCircle size={13} color="#DC2626" />
                <Text className="text-xs text-red-600 ml-1">{studentNumberError}</Text>
              </View>
            ) : (
              <Text className="text-xs text-gray-400 mb-3">Format: YYYY-NNNNN (e.g., 2022-01191)</Text>
            )}

            {/* Confirm */}
            <TouchableOpacity
              className={`rounded-xl py-4 items-center flex-row justify-center mb-3 ${
                studentNumberSaving ? 'bg-gray-300' : 'bg-primary-900'
              }`}
              onPress={handleConfirmStudentNumberPress}
              disabled={studentNumberSaving}
            >
              {studentNumberSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <CheckCircle2 size={16} color="#fff" />
                  <Text className="text-white font-bold ml-2">Confirm &amp; Continue</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity
              className="py-3 items-center"
              onPress={() => {
                if (!studentNumberSaving) {
                  setShowStudentNumberModal(false);
                  pendingUploadFileRef.current = null;
                }
              }}
              disabled={studentNumberSaving}
            >
              <Text className="text-gray-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    <Modal
      visible={reportModal}
      transparent={true}
      animationType="fade"
      onRequestClose={dismissErrorModal}
    >
      <View className="flex-1 bg-black/60 justify-center items-center px-6">
        <View className="bg-white rounded-2xl w-full shadow-lg overflow-hidden">

          {/* Error Banner */}
          {uploadError ? (
            <View className={`${isOwnershipMismatchFailure ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'} px-5 pt-5 pb-4 border-b`}>
              <View className="flex-row items-start">
                <View className={`${isOwnershipMismatchFailure ? 'bg-amber-100' : 'bg-red-100'} p-2 rounded-full mr-3 mt-0.5`}>
                  <AlertTriangle size={20} color={isOwnershipMismatchFailure ? '#B45309' : '#DC2626'} />
                </View>
                <View className="flex-1">
                  <Text className={`text-base font-bold mb-1 ${isOwnershipMismatchFailure ? 'text-amber-700' : 'text-red-700'}`}>{uploadErrorTitle}</Text>
                  <Text className={`text-sm leading-5 ${isOwnershipMismatchFailure ? 'text-amber-700' : 'text-red-600'}`}>{uploadError}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Report Form */}
          <View className="p-5">
            <Text className="text-lg font-bold text-gray-800 mb-1">Report a Problem</Text>
            <Text className="text-xs text-gray-400 mb-3">
              {isOwnershipMismatchFailure
                ? 'Retry is disabled for this file. Upload your own COR, or describe what happened for support review.'
                : 'Optionally describe what happened so we can investigate.'}
            </Text>

            <TextInput
              className="bg-gray-50 p-4 rounded-xl text-gray-800 border border-gray-200 min-h-[100px]"
              placeholder="e.g. Ayaw mag scan / Kulang schedule"
              placeholderTextColor="#A0A0A0"
              multiline={true}
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={MAX_REPORT_LENGTH}
              value={incidentDetails}
              onChangeText={setIncidentDetails}
            />
            <Text className="text-[10px] text-gray-300 text-right mt-1">{incidentDetails.length}/{MAX_REPORT_LENGTH}</Text>

            {/* Actions */}
            <View className="flex-row gap-x-3 mt-3">
              <TouchableOpacity
                className="flex-1 py-3 rounded-xl border border-gray-200"
                onPress={dismissErrorModal}
              >
                <Text className="text-center font-semibold text-gray-500">Dismiss</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-1 py-3 rounded-xl bg-gray-100"
                onPress={() => retryExtraction('error')}
                disabled={isUploading || !canRetryExtraction}
                style={{ opacity: !canRetryExtraction || isUploading ? 0.5 : 1 }}
              >
                <Text className="text-center font-semibold text-gray-700">
                  {failureRetryable ? 'Retry Extraction' : 'Retry Not Available'}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mt-3">
              <TouchableOpacity
                className="py-3 rounded-xl bg-[#B88080]"
                onPress={handleSubmit}
                disabled={!incidentDetails.trim()}
                style={{ opacity: incidentDetails.trim() ? 1 : 0.4 }}
              >
                <Text className="text-center font-bold text-white">Submit Report</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </View>
    </Modal>

    </View>
  );
}