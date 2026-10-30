import { StatisticsGranularity } from '@openathlete/shared';

import { addDaysToDateKey } from 'src/common/utils/time-zone';

/** Monday of a date key */
function weekStart(day: string): string {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDaysToDateKey(day, -weekday);
}

function nextMonth(day: string): string {
  const date = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Every bucket from `from` to `to`, date keys on the athlete's calendar, empty
 * ones included so a chart's axis has no holes. A bucket is partial when the
 * period cuts it or when it is not over yet.
 */
export function statisticsBuckets(
  from: string,
  to: string,
  granularity: StatisticsGranularity,
  today: string,
): { period: string; partial: boolean }[] {
  const bucketStart = (day: string) =>
    granularity === 'week'
      ? weekStart(day)
      : granularity === 'month'
        ? `${day.slice(0, 7)}-01`
        : day;
  const nextBucket = (day: string) =>
    granularity === 'week'
      ? addDaysToDateKey(day, 7)
      : granularity === 'month'
        ? nextMonth(day)
        : addDaysToDateKey(day, 1);
  const lastComplete = to < today ? to : today;

  const buckets: { period: string; partial: boolean }[] = [];
  for (
    let period = bucketStart(from);
    period <= to;
    period = nextBucket(period)
  ) {
    const lastDay = addDaysToDateKey(nextBucket(period), -1);
    buckets.push({
      period,
      partial: period < from || lastDay > lastComplete,
    });
  }
  return buckets;
}
