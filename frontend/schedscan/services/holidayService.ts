import api from './api';

export interface Holiday {
  id: number;
  name: string;
  date: string;          // "YYYY-MM-DD"
  holiday_type: 'one_time' | 'recurring';
}

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
    let key: string;
    if (h.holiday_type === 'recurring') {
      // Use the display year so recurring holidays show up every year
      const [, mm, dd] = h.date.split('-');
      key = `${displayYear}-${mm}-${dd}`;
    } else {
      key = h.date;
    }

    if (!map[key]) map[key] = [];
    map[key].push(h);
  }

  return map;
};

const holidayService = { getHolidays, buildHolidayMap };
export default holidayService;
