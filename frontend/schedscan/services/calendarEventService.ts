import api from './api';

export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  date: string;            // "YYYY-MM-DD"
  end_date?: string | null;
  start_time: string | null; // "HH:MM:SS" or null (all-day)
  end_time: string | null;
  location: string;
  event_type: 'one_time' | 'recurring';
  visibility: 'all' | 'student' | 'faculty';
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

const getEventKeysForYear = (event: CalendarEvent, displayYear: number): string[] => {
  const keys: string[] = [];
  const addKey = (key: string) => {
    if (!keys.includes(key)) keys.push(key);
  };

  const [, startMonth, startDay] = parseDateParts(event.date);
  const endSource = event.end_date ?? event.date;
  const [, endMonth, endDay] = parseDateParts(endSource);

  if (event.event_type === 'recurring') {
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

  const [startYear] = parseDateParts(event.date);
  const startDate = new Date(startYear, startMonth - 1, startDay);
  const [endYear, parsedEndMonth, parsedEndDay] = parseDateParts(endSource);
  const endDate = new Date(endYear, parsedEndMonth - 1, parsedEndDay);

  addRangeKeysWithinYear(startDate, endDate, displayYear, addKey);
  return keys;
};

/**
 * Fetch calendar events from the public API.
 * Events are automatically filtered by the user's role on the backend.
 *
 * @param year  – calendar year (defaults to server current year)
 * @param month – 1-12 (optional, omit to get full year)
 */
export const getCalendarEvents = async (
  year?: number,
  month?: number,
): Promise<CalendarEvent[]> => {
  try {
    const params: Record<string, string> = {};
    if (year !== undefined) params.year = String(year);
    if (month !== undefined) params.month = String(month);

    const response = await api.get('/calendar-events/', { params });
    return response.data as CalendarEvent[];
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return [];
  }
};

/**
 * Build a lookup map keyed by "YYYY-MM-DD" for quick calendar rendering.
 * For recurring events the key uses the requested year so they appear
 * on the calendar even though the stored date may have a different year.
 */
export const buildCalendarEventMap = (
  events: CalendarEvent[],
  displayYear: number,
): Record<string, CalendarEvent[]> => {
  const map: Record<string, CalendarEvent[]> = {};

  for (const e of events) {
    const keys = getEventKeysForYear(e, displayYear);
    for (const key of keys) {
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
  }

  return map;
};

export const formatCalendarEventDateRange = (event: CalendarEvent): string => {
  const endDate = event.end_date ?? event.date;
  if (event.date === endDate) return event.date;
  return `${event.date} - ${endDate}`;
};

/**
 * Format a time string "HH:MM:SS" → "8:00 AM" for display.
 */
export const formatEventTime = (timeStr: string | null): string => {
  if (!timeStr) return 'All Day';
  const [hStr, mStr] = timeStr.split(':');
  const hour = parseInt(hStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${mStr} ${ampm}`;
};

const calendarEventService = { getCalendarEvents, buildCalendarEventMap, formatEventTime, formatCalendarEventDateRange };
export default calendarEventService;
