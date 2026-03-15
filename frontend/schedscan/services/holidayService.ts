import api from './api';

export interface Holiday {
  id: number;
  name: string;
  date: string;          // "YYYY-MM-DD"
  end_date?: string | null;
  holiday_type: 'one_time' | 'recurring';
}

const parseDateParts = (dateStr: string): [number, number, number] => {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  return [parseInt(yearStr, 10), parseInt(monthStr, 10), parseInt(dayStr, 10)];
};

const toDateKey = (year: number, month: number, day: number): string => {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const addRangeKeysWithinYear = (
  startDate: Date,
  endDate: Date,
  displayYear: number,
  pushKey: (key: string) => void,
) => {
  const cursor = new Date(startDate.getTime());
  while (cursor <= endDate) {
    const year = cursor.getFullYear();
    if (year === displayYear) {
      pushKey(toDateKey(year, cursor.getMonth() + 1, cursor.getDate()));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
};

const getHolidayKeysForYear = (holiday: Holiday, displayYear: number): string[] => {
  const keys: string[] = [];

  const addKey = (key: string) => {
    if (!keys.includes(key)) keys.push(key);
  };

  const [, startMonth, startDay] = parseDateParts(holiday.date);
  const endSource = holiday.end_date ?? holiday.date;
  const [, endMonth, endDay] = parseDateParts(endSource);

  if (holiday.holiday_type === 'recurring') {
    const anchorYears = [displayYear - 1, displayYear];

    for (const anchorYear of anchorYears) {
      const startDate = new Date(anchorYear, startMonth - 1, startDay);
      const endDate = new Date(anchorYear, endMonth - 1, endDay);

      if (endDate < startDate) {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      addRangeKeysWithinYear(startDate, endDate, displayYear, addKey);
    }

    return keys;
  }

  const [startYear] = parseDateParts(holiday.date);
  const startDate = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(
    ...(() => {
      const [ey, em, ed] = parseDateParts(endSource);
      return [ey, em - 1, ed] as [number, number, number];
    })(),
  );

  addRangeKeysWithinYear(startDate, endDate, displayYear, addKey);
  return keys;
};

/**
 * Fetch holidays from the public API.
 * @param year  – calendar year (defaults to server current year)
 * @param month – 1-12 (optional, omit to get full year)
 */
export const getHolidays = async (
  year?: number,
  month?: number,
): Promise<Holiday[]> => {
  try {
    const params: Record<string, string> = {};
    if (year !== undefined) params.year = String(year);
    if (month !== undefined) params.month = String(month);

    const response = await api.get('/holidays/', { params });
    return response.data as Holiday[];
  } catch (error) {
    console.error('Error fetching holidays:', error);
    return [];
  }
};

/**
 * Build a lookup map keyed by "YYYY-MM-DD" for quick calendar rendering.
 * For recurring holidays the key uses the requested year so they appear
 * on the calendar even though the stored date may have a different year.
 */
export const buildHolidayMap = (
  holidays: Holiday[],
  displayYear: number,
): Record<string, Holiday[]> => {
  const map: Record<string, Holiday[]> = {};

  for (const h of holidays) {
    const keys = getHolidayKeysForYear(h, displayYear);
    for (const key of keys) {
      if (!map[key]) map[key] = [];
      map[key].push(h);
    }
  }

  return map;
};

export const formatHolidayDateRange = (holiday: Holiday): string => {
  const endDate = holiday.end_date ?? holiday.date;
  if (holiday.date === endDate) return holiday.date;
  return `${holiday.date} - ${endDate}`;
};

const holidayService = { getHolidays, buildHolidayMap, formatHolidayDateRange };
export default holidayService;
