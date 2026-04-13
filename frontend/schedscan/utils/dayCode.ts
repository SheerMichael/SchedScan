export type DayPickerOption = {
  code: string;
  label: string;
};

export const DAY_PICKER_SINGLE_OPTIONS: DayPickerOption[] = [
  { code: 'M', label: 'Monday' },
  { code: 'T', label: 'Tuesday' },
  { code: 'W', label: 'Wednesday' },
  { code: 'TH', label: 'Thursday' },
  { code: 'F', label: 'Friday' },
  { code: 'S', label: 'Saturday' },
];

export const DAY_PICKER_MULTI_OPTIONS: DayPickerOption[] = [
  { code: 'MW', label: 'Mon & Wed' },
  { code: 'MWF', label: 'Mon, Wed & Fri' },
  { code: 'TTH', label: 'Tue & Thu' },
  { code: 'TF', label: 'Tue & Fri' },
  { code: 'MTH', label: 'Mon & Thu' },
  { code: 'MTWTHF', label: 'Mon to Fri' },
];

const SINGLE_DAY_MAP: Record<string, number> = {
  M: 1,
  T: 2,
  W: 3,
  TH: 4,
  F: 5,
  S: 6,
  R: 4,
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 0,
};

const MULTI_DAY_MAP: Record<string, number[]> = {
  MW: [1, 3],
  MWF: [1, 3, 5],
  TTH: [2, 4],
  TR: [2, 4],
  TF: [2, 5],
  MTH: [1, 4],
  MWTH: [1, 3, 4],
  MTWTH: [1, 2, 3, 4],
  MTWTHF: [1, 2, 3, 4, 5],
  MTWTF: [1, 2, 3, 4, 5],
  MTWHF: [1, 2, 3, 4, 5],
};

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const DISPLAY_LABELS: Record<string, string> = {
  M: 'Monday',
  T: 'Tuesday',
  W: 'Wednesday',
  TH: 'Thursday',
  F: 'Friday',
  S: 'Saturday',
  MW: 'Mon & Wed',
  MWF: 'Mon, Wed & Fri',
  TTH: 'Tue & Thu',
  TF: 'Tue & Fri',
  MTH: 'Mon & Thu',
  MTWTHF: 'Mon to Fri',
};

const normalizeDayCode = (dayCode: string): string => dayCode.toUpperCase().trim();

const joinLabels = (labels: string[]): string => {
  if (labels.length === 0) return 'Unassigned';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`;
};

export const dayCodeToWeekdayNumbers = (dayCode: string): number[] => {
  if (!dayCode || dayCode.trim() === '') {
    return [];
  }

  const normalized = normalizeDayCode(dayCode);

  if (MULTI_DAY_MAP[normalized]) {
    return MULTI_DAY_MAP[normalized];
  }

  if (SINGLE_DAY_MAP[normalized] !== undefined) {
    return [SINGLE_DAY_MAP[normalized]];
  }

  // Fallback parser for compact OCR-like tokens (e.g. MTWTHF, MWF, TTH).
  const compact = normalized.replace(/[^A-Z]/g, '');
  const found = new Set<number>();
  let i = 0;

  while (i < compact.length) {
    if (compact.startsWith('SUN', i)) {
      found.add(0);
      i += 3;
      continue;
    }
    if (compact.startsWith('TH', i)) {
      found.add(4);
      i += 2;
      continue;
    }

    const token = compact[i];
    if (token === 'M') found.add(1);
    if (token === 'T') found.add(2);
    if (token === 'W') found.add(3);
    if (token === 'R') found.add(4);
    if (token === 'F') found.add(5);
    if (token === 'S') found.add(6);

    i += 1;
  }

  return [0, 1, 2, 3, 4, 5, 6].filter((day) => found.has(day));
};

export const getReadableDayLabel = (dayCode: string): string => {
  if (!dayCode || dayCode.trim() === '') {
    return 'Unassigned';
  }

  const normalized = normalizeDayCode(dayCode);
  if (DISPLAY_LABELS[normalized]) {
    return DISPLAY_LABELS[normalized];
  }

  const parsedDays = dayCodeToWeekdayNumbers(normalized).map((dayNumber) => WEEKDAY_NAMES[dayNumber]);
  return joinLabels(parsedDays);
};

export const isSupportedDayCode = (dayCode: string): boolean => {
  if (!dayCode || dayCode.trim() === '') {
    return false;
  }
  return dayCodeToWeekdayNumbers(dayCode).length > 0;
};
