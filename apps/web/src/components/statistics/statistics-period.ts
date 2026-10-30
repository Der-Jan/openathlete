import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  subYears,
} from 'date-fns';

import { endOfDay, getYearPeriod, startOfDay } from '@openathlete/shared';

export const STATISTICS_PERIODS = [
  'days7',
  'weeks4',
  'weeks12',
  'months6',
  'year',
  'months12',
  'all',
  'custom',
] as const;
export type StatisticsPeriodType = (typeof STATISTICS_PERIODS)[number];

export const STATISTICS_COMPARISONS = ['none', 'previous', 'lastYear'] as const;
export type StatisticsComparison = (typeof STATISTICS_COMPARISONS)[number];

export interface Period {
  start: Date;
  end: Date;
}

/** Rolling periods end today, so Monday does not open on an empty week */
function rolling(
  end: Date,
  start: (end: Date) => Date,
  offset: number,
  step: (date: Date, steps: number) => Date,
): Period {
  const last = endOfDay(step(end, offset));
  return { start: startOfDay(addDays(start(last), 1)), end: last };
}

/**
 * The period `offset` steps back from today (0 is the current one). `all`
 * starts at the first activity, and `custom` is what the user picked.
 */
export function statisticsPeriod(
  type: Exclude<StatisticsPeriodType, 'all' | 'custom'>,
  offset = 0,
  now = new Date(),
): Period {
  switch (type) {
    case 'days7':
      return rolling(
        now,
        (end) => addDays(end, -7),
        offset,
        (date, steps) => addDays(date, 7 * steps),
      );
    case 'weeks4':
      return rolling(
        now,
        (end) => addWeeks(end, -4),
        offset,
        (date, steps) => addWeeks(date, 4 * steps),
      );
    case 'weeks12':
      return rolling(
        now,
        (end) => addWeeks(end, -12),
        offset,
        (date, steps) => addWeeks(date, 12 * steps),
      );
    case 'months6':
      return rolling(
        now,
        (end) => addMonths(end, -6),
        offset,
        (date, steps) => addMonths(date, 6 * steps),
      );
    case 'months12':
      return rolling(now, (end) => addYears(end, -1), offset, addYears);
    case 'year':
      return getYearPeriod(addYears(now, offset));
  }
}

/** The period to compare with, null without a comparison. */
export function comparedPeriod(
  { start, end }: Period,
  comparison: StatisticsComparison,
): Period | null {
  if (comparison === 'none') return null;
  if (comparison === 'lastYear') {
    return { start: subYears(start, 1), end: subYears(end, 1) };
  }
  const days = differenceInCalendarDays(end, start) + 1;
  return { start: addDays(start, -days), end: addDays(end, -days) };
}
