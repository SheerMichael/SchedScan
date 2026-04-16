export type TaskUrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export type DueDatePresetKey =
  | 'today_17'
  | 'tomorrow_9'
  | 'in_3_days_17'
  | 'end_of_week_17';

export interface DueDatePreset {
  key: DueDatePresetKey;
  label: string;
  date: Date;
}

const setTime = (base: Date, hour: number, minute = 0): Date => {
  const value = new Date(base);
  value.setHours(hour, minute, 0, 0);
  return value;
};

const getTodayAt = (now: Date, hour: number, minute = 0): Date => {
  const candidate = setTime(now, hour, minute);
  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
};

const getTomorrowAt = (now: Date, hour: number, minute = 0): Date => {
  const candidate = new Date(now);
  candidate.setDate(candidate.getDate() + 1);
  return setTime(candidate, hour, minute);
};

const getInDaysAt = (now: Date, dayOffset: number, hour: number, minute = 0): Date => {
  const candidate = new Date(now);
  candidate.setDate(candidate.getDate() + dayOffset);
  return setTime(candidate, hour, minute);
};

const getEndOfWeekAt = (now: Date, hour: number, minute = 0): Date => {
  const currentDay = now.getDay();
  const friday = 5;
  let daysUntilFriday = friday - currentDay;

  if (daysUntilFriday < 0) {
    daysUntilFriday += 7;
  }

  const candidate = getInDaysAt(now, daysUntilFriday, hour, minute);
  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 7);
  }

  return candidate;
};

export const getDueDatePresets = (now = new Date()): DueDatePreset[] => {
  const current = new Date(now);
  return [
    {
      key: 'today_17',
      label: 'Today 5 PM',
      date: getTodayAt(current, 17, 0),
    },
    {
      key: 'tomorrow_9',
      label: 'Tomorrow 9 AM',
      date: getTomorrowAt(current, 9, 0),
    },
    {
      key: 'in_3_days_17',
      label: 'In 3 Days',
      date: getInDaysAt(current, 3, 17, 0),
    },
    {
      key: 'end_of_week_17',
      label: 'End of Week',
      date: getEndOfWeekAt(current, 17, 0),
    },
  ];
};

export const requiresDueDate = (urgency: TaskUrgencyLevel): boolean => {
  return urgency === 'high' || urgency === 'critical';
};

export const toDueDateISOString = (date: Date): string => {
  return date.toISOString();
};

export const getSuggestedDueDateForUrgency = (
  urgency: TaskUrgencyLevel,
  now = new Date()
): string | null => {
  if (!requiresDueDate(urgency)) {
    return null;
  }

  return toDueDateISOString(getTomorrowAt(now, 9, 0));
};

export const parseCustomDueDateTime = (
  dateInput: string,
  timeInput: string,
  now = new Date()
): { isoDate: string | null; error: string | null } => {
  const trimmedDate = dateInput.trim();
  const trimmedTime = timeInput.trim();

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedDate);
  if (!dateMatch) {
    return {
      isoDate: null,
      error: 'Use date format YYYY-MM-DD.',
    };
  }

  const timeMatch = /^(\d{2}):(\d{2})$/.exec(trimmedTime);
  if (!timeMatch) {
    return {
      isoDate: null,
      error: 'Use time format HH:mm (24-hour).',
    };
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return {
      isoDate: null,
      error: 'Date values are out of range.',
    };
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return {
      isoDate: null,
      error: 'Time values are out of range.',
    };
  }

  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return {
      isoDate: null,
      error: 'Invalid calendar date.',
    };
  }

  if (parsed.getTime() <= now.getTime()) {
    return {
      isoDate: null,
      error: 'Due date must be in the future.',
    };
  }

  return {
    isoDate: toDueDateISOString(parsed),
    error: null,
  };
};

export const formatDueDatePreview = (isoDate: string | null | undefined): string => {
  if (!isoDate) {
    return 'No due date';
  }

  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return 'No due date';
  }

  return parsed.toLocaleString();
};

export const getUrgencyHint = (
  urgency: TaskUrgencyLevel,
  isoDate: string | null | undefined,
  now = new Date()
): string => {
  const dueRequired = requiresDueDate(urgency);
  if (!isoDate) {
    if (dueRequired) {
      return 'High and critical tasks require a due date.';
    }
    if (urgency === 'medium') {
      return 'Tip: add a due date so reminders can be scheduled.';
    }
    return 'Backlog-style task with no deadline.';
  }

  const dueDate = new Date(isoDate);
  if (Number.isNaN(dueDate.getTime())) {
    return 'Invalid due date.';
  }

  const deltaMinutes = Math.floor((dueDate.getTime() - now.getTime()) / 60000);

  if (deltaMinutes <= 60) {
    return 'This task will be treated as critical because it is due within 1 hour.';
  }

  if (deltaMinutes <= 24 * 60) {
    return 'This task will escalate to at least high within 24 hours of due time.';
  }

  if (urgency === 'low' || urgency === 'medium') {
    return 'Deadline set. Effective urgency will increase as due time approaches.';
  }

  return 'High-priority task with a clear deadline.';
};
