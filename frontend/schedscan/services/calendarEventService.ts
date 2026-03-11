import api from './api';

export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  date: string;            // "YYYY-MM-DD"
  start_time: string | null; // "HH:MM:SS" or null (all-day)
  end_time: string | null;
  location: string;
  event_type: 'one_time' | 'recurring';
  visibility: 'all' | 'student' | 'faculty';
}

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
    let key: string;
    if (e.event_type === 'recurring') {
      const [, mm, dd] = e.date.split('-');
      key = `${displayYear}-${mm}-${dd}`;
    } else {
      key = e.date;
    }

    if (!map[key]) map[key] = [];
    map[key].push(e);
  }

  return map;
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

const calendarEventService = { getCalendarEvents, buildCalendarEventMap, formatEventTime };
export default calendarEventService;
