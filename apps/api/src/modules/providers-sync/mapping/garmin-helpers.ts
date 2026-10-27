import { SportType } from '@openathlete/database';
import {
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
  getTargetIntensity,
} from '@openathlete/shared';
import type { NormalizedWorkoutStepTarget } from '@openathlete/shared';

/** Athlete metrics by type (VMA, FTP_CYCLING, HR_MAX...) */
export type GarminMetrics = Record<string, { value: number } | number>;

/** An athlete training zone with its values, for ZONE targets */
export interface GarminZone {
  trainingZoneId: number;
  type: 'HEARTRATE' | 'POWER' | 'PACE';
  values: { min: number; max: number; sports: SportType[] }[];
}

const RUNNING_SPORTS: SportType[] = [
  SportType.RUNNING,
  SportType.TRAIL_RUNNING,
  SportType.VIRTUAL_RUN,
];

/** Garmin Training API sports: the only ones a workout can have */
export function mapSportToGarmin(sport: SportType): string {
  switch (sport) {
    case SportType.RUNNING:
    case SportType.TRAIL_RUNNING:
    case SportType.VIRTUAL_RUN:
      return 'RUNNING';
    case SportType.CYCLING:
    case SportType.E_BIKE_RIDE:
    case SportType.E_MOUNTAIN_BIKE_RIDE:
    case SportType.GRAVEL_RIDE:
    case SportType.MOUNTAIN_BIKE_RIDE:
    case SportType.VIRTUAL_RIDE:
    case SportType.HANDCYCLE:
      return 'CYCLING';
    case SportType.SWIMMING:
      return 'LAP_SWIMMING';
    case SportType.WEIGHT_TRAINING:
    case SportType.STRENGTH:
      return 'STRENGTH_TRAINING';
    case SportType.HIGH_INTENSITY_INTERVAL_TRAINING:
    case SportType.CROSSFIT:
      return 'CARDIO_TRAINING';
    case SportType.YOGA:
      return 'YOGA';
    case SportType.PILATES:
      return 'PILATES';
    default:
      return 'GENERIC';
  }
}

export function mapStepTypeToGarminIntensity(
  stepType: string,
  sport: SportType,
): string {
  switch (stepType) {
    case WORKOUT_STEP_TYPE.WARMUP:
      return 'WARMUP';
    case WORKOUT_STEP_TYPE.COOLDOWN:
      return 'COOLDOWN';
    case WORKOUT_STEP_TYPE.INTERVAL_REST:
      return sport === SportType.SWIMMING ? 'REST' : 'RECOVERY';
    case WORKOUT_STEP_TYPE.INTERVAL_ACTIVE:
      return 'INTERVAL';
    default:
      return 'ACTIVE';
  }
}

export interface GarminDuration {
  durationType: string;
  durationValue: number | null;
  durationValueType: string | null;
  /** Shown in the step description when Garmin has no such duration */
  note: string | null;
}

const REPS_SPORTS = new Set([
  'STRENGTH_TRAINING',
  'CARDIO_TRAINING',
  'YOGA',
  'PILATES',
]);

/**
 * A step's end condition. Garmin rejects a TIME or DISTANCE step without a
 * value: such a step, like any condition Garmin lacks, ends with the lap
 * button.
 */
export function mapDurationToGarmin(
  durationType: string,
  durationValue: number | null | undefined,
  sport: SportType,
  intensity: string,
): GarminDuration {
  const value =
    durationValue !== null &&
    durationValue !== undefined &&
    Number.isFinite(durationValue) &&
    durationValue > 0
      ? durationValue
      : null;
  const open = (note: string | null = null): GarminDuration => ({
    durationType: 'OPEN',
    durationValue: null,
    durationValueType: null,
    note,
  });
  if (value === null) return open();

  const garminSport = mapSportToGarmin(sport);
  switch (durationType) {
    case WORKOUT_DURATION_TYPE.TIME:
      return {
        // Swim rests are fixed rests: the watch counts them down at the wall
        durationType:
          garminSport === 'LAP_SWIMMING' && intensity === 'REST'
            ? 'FIXED_REST'
            : 'TIME',
        durationValue: Math.round(value),
        durationValueType: null,
        note: null,
      };
    case WORKOUT_DURATION_TYPE.DISTANCE:
      return {
        durationType: 'DISTANCE',
        durationValue: Math.round(value),
        durationValueType: 'METER',
        note: null,
      };
    case WORKOUT_DURATION_TYPE.CALORIES:
      return {
        durationType: 'CALORIES',
        durationValue: Math.round(value),
        durationValueType: null,
        note: null,
      };
    case WORKOUT_DURATION_TYPE.HR_BELOW:
      return {
        durationType: 'HR_LESS_THAN',
        durationValue: Math.round(value),
        durationValueType: null,
        note: null,
      };
    case WORKOUT_DURATION_TYPE.HR_ABOVE:
      return {
        durationType: 'HR_GREATER_THAN',
        durationValue: Math.round(value),
        durationValueType: null,
        note: null,
      };
    case WORKOUT_DURATION_TYPE.REPS:
      return REPS_SPORTS.has(garminSport)
        ? {
            durationType: 'REPS',
            durationValue: Math.round(value),
            durationValueType: null,
            note: null,
          }
        : open(`${Math.round(value)} reps`);
    default:
      return open();
  }
}

export interface GarminTarget {
  targetType: string | null;
  targetValueLow: number | null;
  targetValueHigh: number | null;
  targetValueType: string | null;
  secondaryTargetType: string | null;
  secondaryTargetValueLow: number | null;
  secondaryTargetValueHigh: number | null;
  weightValue: number | null;
  /** Shown in the step description when Garmin cannot hold the target */
  note: string | null;
}

const NO_TARGET: GarminTarget = {
  targetType: null,
  targetValueLow: null,
  targetValueHigh: null,
  targetValueType: null,
  secondaryTargetType: null,
  secondaryTargetValueLow: null,
  secondaryTargetValueHigh: null,
  weightValue: null,
  note: null,
};

/**
 * Garmin reads targetValue as a zone number of the watch (HR 1-5, power
 * 1-7): a single value is sent as a narrow custom range around it.
 */
function range(
  min: number | null,
  max: number | null,
  value: number | null,
  margin: (value: number) => number,
): [number, number] | null {
  if (min !== null && max !== null && min > 0 && max > 0) {
    return [Math.min(min, max), Math.max(min, max)];
  }
  const single = value ?? min ?? max;
  if (single === null || !(single > 0)) return null;
  return [single - margin(single), single + margin(single)];
}

const round = (value: number, digits = 0) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

/** Pace zones are stored in min/km; Garmin wants speeds in m/s */
function paceToSpeed(minutesPerKm: number): number {
  return 1000 / (minutesPerKm * 60);
}

function zoneValue(zone: GarminZone, sport: SportType) {
  return (
    zone.values.find((value) => value.sports.includes(sport)) ??
    zone.values.find((value) => value.sports.length === 0) ??
    zone.values[0]
  );
}

function absoluteTarget(
  garminType: string,
  bounds: [number, number],
  sport: SportType,
): GarminTarget {
  const isSwim = mapSportToGarmin(sport) === 'LAP_SWIMMING';
  const digits = garminType === 'PACE' || garminType === 'SPEED' ? 3 : 0;
  const [low, high] = bounds.map((value) => round(value, digits));
  if (isSwim) {
    // Swim workouts take no primary target; pace is a secondary one
    return garminType === 'PACE' || garminType === 'SPEED'
      ? {
          ...NO_TARGET,
          secondaryTargetType: 'PACE_ZONE',
          secondaryTargetValueLow: low,
          secondaryTargetValueHigh: high,
        }
      : NO_TARGET;
  }
  return {
    ...NO_TARGET,
    targetType: garminType,
    targetValueLow: low,
    targetValueHigh: high,
  };
}

function speedTargetType(sport: SportType): string {
  return RUNNING_SPORTS.includes(sport) ||
    mapSportToGarmin(sport) === 'LAP_SWIMMING'
    ? 'PACE'
    : 'SPEED';
}

export function mapTargetToGarmin(
  target: NormalizedWorkoutStepTarget | undefined,
  sport: SportType,
  metrics?: GarminMetrics,
  zones: GarminZone[] = [],
): GarminTarget {
  if (!target || target.targetType === WORKOUT_TARGET_TYPE.OPEN) {
    return NO_TARGET;
  }

  switch (target.targetType) {
    case WORKOUT_TARGET_TYPE.ZONE: {
      const zone = zones.find((z) => z.trainingZoneId === target.targetValue);
      const value = zone ? zoneValue(zone, sport) : undefined;
      if (!zone || !value) return NO_TARGET;
      if (zone.type === 'PACE') {
        if (!(value.min > 0) || !(value.max > 0)) return NO_TARGET;
        return absoluteTarget(
          speedTargetType(sport),
          [paceToSpeed(value.max), paceToSpeed(value.min)],
          sport,
        );
      }
      return absoluteTarget(
        zone.type === 'POWER' ? 'POWER' : 'HEART_RATE',
        [value.min, value.max],
        sport,
      );
    }

    case WORKOUT_TARGET_TYPE.HEARTRATE:
    case WORKOUT_TARGET_TYPE.POWER: {
      const garminType =
        target.targetType === WORKOUT_TARGET_TYPE.POWER
          ? 'POWER'
          : 'HEART_RATE';
      const metric = target.metricType
        ? metrics?.[target.metricType]
        : undefined;
      if (target.metricType && metric === undefined) {
        // Without the athlete's reference value, let the watch apply the
        // percentage to its own max HR or FTP
        const bounds = range(
          target.targetMin ?? null,
          target.targetMax ?? null,
          target.targetValue ?? null,
          () => 0.025,
        );
        if (!bounds || mapSportToGarmin(sport) === 'LAP_SWIMMING') {
          return NO_TARGET;
        }
        return {
          ...NO_TARGET,
          targetType: garminType,
          targetValueLow: round(bounds[0] * 100),
          targetValueHigh: round(bounds[1] * 100),
          targetValueType: 'PERCENT',
        };
      }
      const intensity = getTargetIntensity(target, metrics);
      const bounds = range(
        intensity.min,
        intensity.max,
        intensity.value,
        garminType === 'POWER' ? (watts) => watts * 0.05 : () => 5,
      );
      return bounds ? absoluteTarget(garminType, bounds, sport) : NO_TARGET;
    }

    case WORKOUT_TARGET_TYPE.PACE: {
      if (target.metricType && metrics?.[target.metricType] === undefined) {
        // A default VMA would put a stranger's pace on the watch
        const low = target.targetMin ?? target.targetValue;
        if (low === null || low === undefined) return NO_TARGET;
        const high = target.targetMax;
        const percent = (value: number) => `${round(value * 100)}%`;
        return {
          ...NO_TARGET,
          note: `${percent(low)}${high !== null && high !== undefined && high !== low ? `-${percent(high)}` : ''} ${target.metricType}`,
        };
      }
      // Speeds in m/s, or a fraction of VMA converted by getTargetIntensity
      const intensity = getTargetIntensity(target, metrics);
      const bounds = range(
        intensity.min,
        intensity.max,
        intensity.value,
        (speed) => speed * 0.03,
      );
      return bounds
        ? absoluteTarget(speedTargetType(sport), bounds, sport)
        : NO_TARGET;
    }

    case WORKOUT_TARGET_TYPE.CADENCE: {
      const bounds = range(
        target.targetMin ?? null,
        target.targetMax ?? null,
        target.targetValue ?? null,
        () => 5,
      );
      return bounds ? absoluteTarget('CADENCE', bounds, sport) : NO_TARGET;
    }

    case WORKOUT_TARGET_TYPE.WEIGHT: {
      const weight =
        target.targetValue ?? target.targetMax ?? target.targetMin ?? null;
      return weight !== null && weight > 0
        ? { ...NO_TARGET, weightValue: weight }
        : NO_TARGET;
    }

    case WORKOUT_TARGET_TYPE.RPE: {
      const low = target.targetMin ?? target.targetValue;
      const high = target.targetMax;
      if (low === null || low === undefined) return NO_TARGET;
      return {
        ...NO_TARGET,
        note:
          high !== null && high !== undefined && high !== low
            ? `RPE ${low}-${high}`
            : `RPE ${low}`,
      };
    }

    default:
      return NO_TARGET;
  }
}
