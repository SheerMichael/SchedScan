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

const normalizeDayCode = (dayCode: string): string => dayCode.toUpperCase().trim();

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
