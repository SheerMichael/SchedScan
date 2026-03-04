/**
 * Semester utility functions for mapping academic semesters to calendar months.
 *
 * Default ranges follow the standard Philippine academic calendar:
 *   1st Semester : August – December
 *   2nd Semester : January – May
 *   Summer/Midyear : June – July
 */

/** Month indices (0-indexed) for each recognized semester code */
const SEMESTER_MONTH_RANGES: Record<string, number[]> = {
    '1ST': [7, 8, 9, 10, 11],       // Aug – Dec
    '2ND': [0, 1, 2, 3, 4],         // Jan – May
    'SUMMER': [5, 6],                   // Jun – Jul
    'MIDYEAR': [5, 6],                   // Jun – Jul (alias)
};

/** All 12 months, used as fallback when semester is unknown */
const ALL_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/**
 * Returns the array of 0-indexed month numbers that belong to a given semester.
 * Falls back to all 12 months if the semester is empty or unrecognized.
 */
export function getSemesterMonths(semester?: string): number[] {
    if (!semester) return ALL_MONTHS;
    const key = semester.toUpperCase().trim();
    return SEMESTER_MONTH_RANGES[key] ?? ALL_MONTHS;
}

/**
 * Returns a human-readable label for the semester, e.g. "1st Semester 2025-2026".
 * Falls back to "All Months" when semester data is missing.
 */
export function getSemesterLabel(semester?: string, schoolYear?: string): string {
    if (!semester) return 'All Months';

    const key = semester.toUpperCase().trim();
    let label: string;

    switch (key) {
        case '1ST':
            label = '1st Semester';
            break;
        case '2ND':
            label = '2nd Semester';
            break;
        case 'SUMMER':
        case 'MIDYEAR':
            label = 'Summer / Midyear';
            break;
        default:
            label = semester; // Show raw value if unrecognized
    }

    if (schoolYear) {
        label += ` ${schoolYear}`;
    }

    return label;
}

/**
 * Given a semester, determines the best initial month to show.
 * If today falls within the semester range, returns today's month.
 * Otherwise, returns the first month of the semester.
 */
export function getInitialMonth(semester?: string): number {
    const now = new Date();
    const currentMonth = now.getMonth();
    const months = getSemesterMonths(semester);

    if (months.includes(currentMonth)) {
        return currentMonth;
    }

    // Current month is outside this semester — default to the first month
    return months[0];
}

/**
 * Auto-detect the current semester and school year based on today's date.
 * Uses WMSU academic calendar:
 *   Aug–Dec  → 1ST semester, school year = currentYear–nextYear
 *   Jan–May  → 2ND semester, school year = prevYear–currentYear
 *   Jun–Jul  → SUMMER,       school year = prevYear–currentYear
 */
export function detectSemesterFromDate(date: Date = new Date()): { semester: string; schoolYear: string } {
    const month = date.getMonth(); // 0-indexed
    const year = date.getFullYear();

    if (month >= 7) {
        // Aug (7) – Dec (11) → 1st Semester
        return { semester: '1ST', schoolYear: `${year}-${year + 1}` };
    } else if (month <= 4) {
        // Jan (0) – May (4) → 2nd Semester
        return { semester: '2ND', schoolYear: `${year - 1}-${year}` };
    } else {
        // Jun (5) – Jul (6) → Summer
        return { semester: 'SUMMER', schoolYear: `${year - 1}-${year}` };
    }
}
