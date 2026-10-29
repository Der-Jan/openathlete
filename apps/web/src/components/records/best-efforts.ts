import { RECORD_TYPE } from '@openathlete/shared';

import { ChartRecord } from './record-metrics';

// Heart rate and elevation records measure the effort, not a performance
const LOWER_IS_BETTER: Partial<Record<RECORD_TYPE, boolean>> = {
  [RECORD_TYPE.SPEED]: true,
  [RECORD_TYPE.POWER]: false,
};

const position = (record: ChartRecord) =>
  `${record.type}:${record.distance ?? ''}:${record.duration ?? ''}`;

/**
 * The activity's pace and power efforts that match or beat the best of a
 * period before it: a pace record is the time a distance took, so lower is
 * better; a power record is watts held for a duration. A distance or
 * duration the period never reached counts as beaten.
 */
export function effortsBeatingPeriod(
  activity: ChartRecord[],
  period: ChartRecord[],
): ChartRecord[] {
  const best = new Map(period.map((record) => [position(record), record]));
  return activity.filter((record) => {
    const lowerIsBetter = LOWER_IS_BETTER[record.type];
    if (lowerIsBetter === undefined) return false;
    const previous = best.get(position(record));
    if (!previous) return true;
    return lowerIsBetter
      ? record.value <= previous.value
      : record.value >= previous.value;
  });
}
