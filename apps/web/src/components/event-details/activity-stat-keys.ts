import { ActivityEvent, getSportConfig } from '@openathlete/shared';

export type ActivityStatKey =
  | 'distance'
  | 'averageSpeed'
  | 'maxSpeed'
  | 'gap'
  | 'movingTime'
  | 'elapsedTime'
  | 'elevationGain'
  | 'averageHeartrate'
  | 'maxHeartrate'
  | 'averagePower'
  | 'normalizedPower'
  | 'maxPower'
  | 'averageCadence'
  | 'equipment';

export type ActivityStatsInput = Pick<
  ActivityEvent,
  | 'sport'
  | 'startDate'
  | 'endDate'
  | 'movingTime'
  | 'maxSpeed'
  | 'averageGapSpeed'
  | 'averageHeartrate'
  | 'maxHeartrate'
  | 'averageWatts'
  | 'weightedAverageWatts'
  | 'maxWatts'
  | 'averageCadence'
  | 'equipmentId'
>;

// Below this, the gap between elapsed and moving time is rounding noise
const MIN_PAUSE_SECONDS = 60;

export function getElapsedSeconds(
  activity: Pick<ActivityEvent, 'startDate' | 'endDate'>,
): number {
  const ms =
    new Date(activity.endDate).getTime() -
    new Date(activity.startDate).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
}

const isPositive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && value > 0;

/**
 * The summary tiles of an activity, in display order: what its sport cares
 * about, among the values its device actually recorded.
 */
export function getActivityStatKeys(
  activity: ActivityStatsInput,
): ActivityStatKey[] {
  const config = getSportConfig(activity.sport);
  const keys: ActivityStatKey[] = [];

  if (config.showDistance) keys.push('distance');
  if (config.showSpeed) keys.push('averageSpeed');
  if (config.showMaxSpeed && isPositive(activity.maxSpeed))
    keys.push('maxSpeed');
  if (config.showGap && typeof activity.averageGapSpeed === 'number')
    keys.push('gap');
  keys.push('movingTime');
  if (getElapsedSeconds(activity) - activity.movingTime >= MIN_PAUSE_SECONDS)
    keys.push('elapsedTime');
  if (config.showElevation) keys.push('elevationGain');
  if (config.showHeartrate && isPositive(activity.averageHeartrate))
    keys.push('averageHeartrate');
  if (config.showHeartrate && isPositive(activity.maxHeartrate))
    keys.push('maxHeartrate');
  if (config.showPower && isPositive(activity.averageWatts))
    keys.push('averagePower');
  if (config.showPower && isPositive(activity.weightedAverageWatts))
    keys.push('normalizedPower');
  if (config.showPower && isPositive(activity.maxWatts)) keys.push('maxPower');
  if (config.showCadence && isPositive(activity.averageCadence))
    keys.push('averageCadence');
  if (activity.equipmentId) keys.push('equipment');

  return keys;
}
