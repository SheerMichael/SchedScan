import { Course } from '../services/courseService';
import { isSupportedDayCode, WEEKDAY_NAMES, dayCodeToWeekdayNumbers } from './dayCode';

export interface DayAssignmentConflict {
  conflictingCourse: Course;
  conflictingIndex: number;
  overlappingDayNames: string[];
}

export interface DayAssignmentValidationResult {
  isValid: boolean;
  validationError?: string;
  conflicts: DayAssignmentConflict[];
}

const parseTimeToMinutes = (timeValue: string): number | null => {
  const normalized = String(timeValue || '').trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return null;
  }

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
    return null;
  }

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  }

  if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return (hours * 60) + minutes;
};

const getOverlappingDayNames = (left: number[], right: number[]): string[] => {
  const overlap = left.filter((dayNumber) => right.includes(dayNumber));
  const names = overlap.map((dayNumber) => WEEKDAY_NAMES[dayNumber]).filter(Boolean);
  return Array.from(new Set(names));
};

export const validateDayAssignment = (
  courses: Course[],
  targetCourseIndex: number,
  selectedDay: string,
): DayAssignmentValidationResult => {
  if (!Array.isArray(courses) || courses.length === 0) {
    return {
      isValid: false,
      validationError: 'No schedule data available. Please refresh and try again.',
      conflicts: [],
    };
  }

  if (!Number.isInteger(targetCourseIndex) || targetCourseIndex < 0 || targetCourseIndex >= courses.length) {
    return {
      isValid: false,
      validationError: 'Selected course could not be identified. Please close this dialog and try again.',
      conflicts: [],
    };
  }

  if (!isSupportedDayCode(selectedDay)) {
    return {
      isValid: false,
      validationError: 'Please select a valid day option before assigning.',
      conflicts: [],
    };
  }

  const targetCourse = courses[targetCourseIndex];
  const selectedDayNumbers = dayCodeToWeekdayNumbers(selectedDay);

  if (selectedDayNumbers.length === 0) {
    return {
      isValid: false,
      validationError: 'Selected day is not supported.',
      conflicts: [],
    };
  }

  const targetStart = parseTimeToMinutes(targetCourse.start_time);
  const targetEnd = parseTimeToMinutes(targetCourse.end_time);

  if (targetStart === null || targetEnd === null) {
    return {
      isValid: false,
      validationError: 'This course has an invalid time format and cannot be assigned safely.',
      conflicts: [],
    };
  }

  if (targetStart >= targetEnd) {
    return {
      isValid: false,
      validationError: 'Course start time must be earlier than end time.',
      conflicts: [],
    };
  }

  const conflicts: DayAssignmentConflict[] = [];

  for (let index = 0; index < courses.length; index += 1) {
    if (index === targetCourseIndex) {
      continue;
    }

    const candidate = courses[index];
    const candidateDayNumbers = dayCodeToWeekdayNumbers(candidate.day || '');

    if (candidateDayNumbers.length === 0) {
      continue;
    }

    const overlappingDayNames = getOverlappingDayNames(selectedDayNumbers, candidateDayNumbers);
    if (overlappingDayNames.length === 0) {
      continue;
    }

    const candidateStart = parseTimeToMinutes(candidate.start_time);
    const candidateEnd = parseTimeToMinutes(candidate.end_time);

    if (candidateStart === null || candidateEnd === null || candidateStart >= candidateEnd) {
      continue;
    }

    const overlapsInTime = targetStart < candidateEnd && candidateStart < targetEnd;
    if (!overlapsInTime) {
      continue;
    }

    conflicts.push({
      conflictingCourse: candidate,
      conflictingIndex: index,
      overlappingDayNames,
    });
  }

  return {
    isValid: true,
    conflicts,
  };
};

export const formatDayAssignmentConflictMessage = (
  conflicts: DayAssignmentConflict[],
): string => {
  if (conflicts.length === 0) {
    return 'No conflicts detected.';
  }

  const lines = conflicts.slice(0, 4).map((conflict) => {
    const course = conflict.conflictingCourse;
    const when = `${course.start_time} - ${course.end_time}`;
    const where = course.location ? ` at ${course.location}` : '';
    const dayText = conflict.overlappingDayNames.join(' & ');
    return `- ${course.subject_code} (${when}) on ${dayText}${where}`;
  });

  if (conflicts.length > 4) {
    lines.push(`- and ${conflicts.length - 4} more conflict(s)`);
  }

  return [
    'This assignment overlaps with existing classes:',
    '',
    ...lines,
    '',
    'Choose a different day or adjust class times first.',
  ].join('\n');
};
