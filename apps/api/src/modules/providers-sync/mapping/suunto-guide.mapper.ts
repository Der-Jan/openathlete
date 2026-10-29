import { SportType } from '@openathlete/database';
import type {
  WorkoutDto,
  WorkoutStepDto,
  WorkoutStepTargetDto,
} from '@openathlete/shared';
import {
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
  getTargetIntensity,
} from '@openathlete/shared';

import type {
  SuuntoField,
  SuuntoFieldsStep,
  SuuntoGuide,
  SuuntoStep,
  SuuntoTransition,
} from './suunto-guide.types';
import { mapSportToSuuntoActivityIds, truncateText } from './suunto-helpers';

const GUIDE_OWNER = 'OpenAthlete';
const GUIDE_URL = 'https://openathlete.org';

/** Suunto limits from the SuuntoPlus Guide format */
const MAX_STEPS = 1000;
const MAX_REPEATS = 100;
const MAX_FIELDS = 5;
const STEP_TITLE_LENGTH = 13;
const NOTIFICATION_TEXT_LENGTH = 54;

/** Athlete metrics by type (VMA, FTP_CYCLING, HR_MAX...) */
export type SuuntoMetrics = Record<string, { value: number } | number>;

/** An athlete training zone with its values, for ZONE targets */
export interface SuuntoZone {
  trainingZoneId: number;
  type: 'HEARTRATE' | 'POWER' | 'PACE';
  values: { min: number; max: number; sports: SportType[] }[];
}

export interface SuuntoGuideContext {
  metrics?: SuuntoMetrics;
  zones?: SuuntoZone[];
}

const RUNNING_SPORTS: SportType[] = [
  SportType.RUNNING,
  SportType.TRAIL_RUNNING,
  SportType.VIRTUAL_RUN,
];
const CYCLING_SPORTS: SportType[] = [
  SportType.CYCLING,
  SportType.MOUNTAIN_BIKE_RIDE,
  SportType.GRAVEL_RIDE,
  SportType.E_BIKE_RIDE,
  SportType.E_MOUNTAIN_BIKE_RIDE,
  SportType.VIRTUAL_RIDE,
  SportType.HANDCYCLE,
];

const DEFAULT_STEP_TITLES: Partial<Record<WORKOUT_STEP_TYPE, string>> = {
  [WORKOUT_STEP_TYPE.WARMUP]: 'Warm up',
  [WORKOUT_STEP_TYPE.COOLDOWN]: 'Cool down',
  [WORKOUT_STEP_TYPE.INTERVAL_ACTIVE]: 'Interval',
  [WORKOUT_STEP_TYPE.INTERVAL_REST]: 'Recovery',
  [WORKOUT_STEP_TYPE.STEADY]: 'Steady',
};

/** A target the watch can follow (field) and how to say it (label) */
interface MappedTarget {
  field: SuuntoField | null;
  label: string | null;
}

const NO_TARGET: MappedTarget = { field: null, label: null };

const round = (value: number, digits = 0) =>
  Math.round(value * 10 ** digits) / 10 ** digits;

/** Pace zones are stored in min/km; Suunto wants speeds in m/s */
function paceToSpeed(minutesPerKm: number): number {
  return 1000 / (minutesPerKm * 60);
}

function formatPace(speed: number, sport: SportType): string {
  const swim = sport === SportType.SWIMMING;
  const seconds = Math.round((swim ? 100 : 1000) / speed);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`;
}

function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${round(meters / 1000, 2)} km`
    : `${round(meters)} m`;
}

type Bounds = { min: number; max: number } | { value: number };

/** A positive single value or range, ordered */
function bounds(
  min: number | null,
  max: number | null,
  value: number | null,
): Bounds | null {
  if (min !== null && max !== null && min > 0 && max > 0) {
    return { min: Math.min(min, max), max: Math.max(min, max) };
  }
  const single = value ?? min ?? max;
  return single !== null && single > 0 ? { value: single } : null;
}

function mapBounds(target: Bounds, fn: (value: number) => number): Bounds {
  return 'value' in target
    ? { value: fn(target.value) }
    : { min: fn(target.min), max: fn(target.max) };
}

function describeBounds(
  target: Bounds,
  fn: (value: number) => string | number,
  unit: string,
): string {
  if ('value' in target) return `${fn(target.value)}${unit}`;
  const [low, high] = [fn(target.min), fn(target.max)];
  return low === high ? `${low}${unit}` : `${low}-${high}${unit}`;
}

function within(target: Bounds, low: number, high: number): boolean {
  const values = 'value' in target ? [target.value] : [target.min, target.max];
  return values.every((v) => Number.isFinite(v) && v >= low && v <= high);
}

function zoneValue(zone: SuuntoZone, sport: SportType) {
  return (
    zone.values.find((value) => value.sports.includes(sport)) ??
    zone.values.find((value) => value.sports.length === 0) ??
    zone.values[0]
  );
}

function heartRateTarget(
  min: number | null,
  max: number | null,
  value: number | null,
): MappedTarget {
  const target = bounds(min, max, value);
  if (!target) return NO_TARGET;
  const rounded = mapBounds(target, Math.round);
  if (!within(rounded, 30, 250)) return NO_TARGET;
  return {
    field: { type: 'targetHeartRate', ...rounded },
    label: describeBounds(rounded, String, ' bpm'),
  };
}

function powerTarget(
  min: number | null,
  max: number | null,
  value: number | null,
): MappedTarget {
  const target = bounds(min, max, value);
  if (!target) return NO_TARGET;
  const rounded = mapBounds(target, Math.round);
  if (!within(rounded, 1, 3000)) return NO_TARGET;
  return {
    field: { type: 'targetPower', ...rounded },
    label: describeBounds(rounded, String, ' W'),
  };
}

/** Speeds in m/s: a pace for runners and swimmers, a speed otherwise */
function speedTarget(
  min: number | null,
  max: number | null,
  value: number | null,
  sport: SportType,
): MappedTarget {
  const target = bounds(min, max, value);
  if (!target || !within(target, 0.2, 30)) return NO_TARGET;
  const rounded = mapBounds(target, (speed) => round(speed, 3));
  const asPace = RUNNING_SPORTS.includes(sport) || sport === SportType.SWIMMING;
  if (!asPace) {
    return {
      field: { type: 'targetSpeed', ...rounded },
      label: describeBounds(rounded, (speed) => round(speed * 3.6, 1), ' km/h'),
    };
  }
  const unit = sport === SportType.SWIMMING ? '/100m' : '/km';
  // The faster speed is the lower pace
  const paces: Bounds =
    'value' in rounded ? rounded : { min: rounded.max, max: rounded.min };
  return {
    field: { type: 'targetPace', ...rounded },
    label: describeBounds(paces, (speed) => formatPace(speed, sport), unit),
  };
}

/** A percentage of a reference the athlete has not set */
function percentLabel(target: WorkoutStepTargetDto): MappedTarget {
  const low = target.targetMin ?? target.targetValue;
  if (low === null || low === undefined) return NO_TARGET;
  const high = target.targetMax;
  const percent = (value: number) => `${round(value * 100)}%`;
  return {
    field: null,
    label: `${percent(low)}${high !== null && high !== undefined && high !== low ? `-${percent(high)}` : ''} ${target.metricType}`,
  };
}

export function mapTargetToSuunto(
  target: WorkoutStepTargetDto | undefined,
  sport: SportType,
  context: SuuntoGuideContext = {},
): MappedTarget {
  if (!target || target.targetType === WORKOUT_TARGET_TYPE.OPEN) {
    return NO_TARGET;
  }
  const { metrics, zones = [] } = context;

  switch (target.targetType) {
    case WORKOUT_TARGET_TYPE.ZONE: {
      // targetValue is the id of one of the athlete's zones, not a value
      const zone = zones.find((z) => z.trainingZoneId === target.targetValue);
      const value = zone ? zoneValue(zone, sport) : undefined;
      if (!zone || !value) return NO_TARGET;
      if (zone.type === 'PACE') {
        if (!(value.min > 0) || !(value.max > 0)) return NO_TARGET;
        return speedTarget(
          paceToSpeed(value.max),
          paceToSpeed(value.min),
          null,
          sport,
        );
      }
      return zone.type === 'POWER'
        ? powerTarget(value.min, value.max, null)
        : heartRateTarget(value.min, value.max, null);
    }

    case WORKOUT_TARGET_TYPE.HEARTRATE:
    case WORKOUT_TARGET_TYPE.POWER:
    case WORKOUT_TARGET_TYPE.PACE: {
      // A default max HR, FTP or VMA would put a stranger's target on the
      // watch, which has no percentage targets
      if (target.metricType && metrics?.[target.metricType] === undefined) {
        return percentLabel(target);
      }
      const intensity = getTargetIntensity(target, metrics);
      if (target.targetType === WORKOUT_TARGET_TYPE.HEARTRATE) {
        return heartRateTarget(intensity.min, intensity.max, intensity.value);
      }
      if (target.targetType === WORKOUT_TARGET_TYPE.POWER) {
        return powerTarget(intensity.min, intensity.max, intensity.value);
      }
      return speedTarget(intensity.min, intensity.max, intensity.value, sport);
    }

    case WORKOUT_TARGET_TYPE.CADENCE: {
      const cadence = bounds(
        target.targetMin ?? null,
        target.targetMax ?? null,
        target.targetValue ?? null,
      );
      if (!cadence || !within(cadence, 10, 250)) return NO_TARGET;
      // Suunto counts cadence in Hz
      return {
        field: {
          type: 'targetCadence',
          ...mapBounds(cadence, (rpm) => round(rpm / 60, 3)),
        },
        label: describeBounds(cadence, Math.round, ' rpm'),
      };
    }

    case WORKOUT_TARGET_TYPE.RPE: {
      const low = target.targetMin ?? target.targetValue;
      if (low === null || low === undefined) return NO_TARGET;
      const high = target.targetMax;
      return {
        field: null,
        label:
          high !== null && high !== undefined && high !== low
            ? `RPE ${low}-${high}`
            : `RPE ${low}`,
      };
    }

    default:
      return NO_TARGET;
  }
}

function positive(value: number | null | undefined): number | null {
  return value !== null &&
    value !== undefined &&
    Number.isFinite(value) &&
    value > 0
    ? value
    : null;
}

/**
 * When the step ends. The lap button always moves on, so a runner can cut a
 * step short; without a time or distance it is the only way out, since a
 * step without transitions never ends.
 */
function mapTransitions(step: WorkoutStepDto): SuuntoTransition[] {
  const value = positive(step.durationValue);
  if (value !== null && step.durationType === WORKOUT_DURATION_TYPE.TIME) {
    return [
      {
        condition: {
          type: 'or',
          conditions: [{ type: 'stepDuration', value }, { type: 'manualLap' }],
        },
      },
    ];
  }
  if (value !== null && step.durationType === WORKOUT_DURATION_TYPE.DISTANCE) {
    return [
      {
        condition: {
          type: 'or',
          conditions: [{ type: 'stepDistance', value }, { type: 'manualLap' }],
        },
      },
    ];
  }
  return [{ condition: { type: 'manualLap' } }];
}

/** The step's length in words, for the conditions the watch cannot check */
function describeDuration(step: WorkoutStepDto): string | null {
  const value = positive(step.durationValue);
  if (value === null) return null;
  switch (step.durationType) {
    case WORKOUT_DURATION_TYPE.TIME:
      return formatClock(value);
    case WORKOUT_DURATION_TYPE.DISTANCE:
      return formatDistance(value);
    case WORKOUT_DURATION_TYPE.CALORIES:
      return `${Math.round(value)} kcal`;
    case WORKOUT_DURATION_TYPE.HR_ABOVE:
      return `Until HR > ${Math.round(value)}`;
    case WORKOUT_DURATION_TYPE.HR_BELOW:
      return `Until HR < ${Math.round(value)}`;
    case WORKOUT_DURATION_TYPE.REPS:
      return `${Math.round(value)} reps`;
    default:
      return null;
  }
}

/**
 * What the watch shows during the step, most important first. Lap windows
 * cover the step, since each step starts a lap. Text fields are left out:
 * past 40 characters, one hides every other field.
 */
function mapFields(
  step: WorkoutStepDto,
  sport: SportType,
  target: SuuntoField | null,
): SuuntoField[] {
  const fields: SuuntoField[] = [];
  if (target) fields.push(target);

  const value = positive(step.durationValue);
  const timed =
    value !== null && step.durationType === WORKOUT_DURATION_TYPE.TIME;
  const measured =
    value !== null && step.durationType === WORKOUT_DURATION_TYPE.DISTANCE;
  if (timed) {
    fields.push({ type: 'stepDurationCountdown', value: value, title: 'Left' });
  } else if (measured) {
    fields.push({ type: 'stepDistanceCountdown', value: value, title: 'Left' });
  }

  const has = (type: SuuntoField['type']) => target?.type === type;
  const lapAverage = { window: 'manualLap', aggregate: 'average' } as const;

  if (RUNNING_SPORTS.includes(sport) || sport === SportType.SWIMMING) {
    if (!has('targetPace')) {
      fields.push({ type: 'pace', ...lapAverage, title: 'Lap pace' });
    }
    if (sport === SportType.SWIMMING) {
      fields.push({ type: 'strokeRate', ...lapAverage, title: 'Rate' });
    } else if (!has('targetHeartRate')) {
      fields.push({ type: 'heartRate', title: 'HR' });
    }
  } else if (CYCLING_SPORTS.includes(sport)) {
    if (!has('targetPower')) {
      fields.push({ type: 'power', ...lapAverage, title: 'Lap pwr' });
    }
    if (!has('targetHeartRate')) {
      fields.push({ type: 'heartRate', title: 'HR' });
    }
    if (!has('targetCadence')) {
      fields.push({ type: 'cadence', ...lapAverage, title: 'Cadence' });
    }
  } else if (!has('targetHeartRate')) {
    fields.push({ type: 'heartRate', title: 'HR' });
  }

  // The other half of the step: how far for a timed one, how long otherwise
  fields.push(
    timed
      ? { type: 'distance', window: 'step', title: 'Dist' }
      : { type: 'duration', window: 'step', title: 'Time' },
  );

  return fields.slice(0, MAX_FIELDS);
}

function mapFieldsStep(
  step: WorkoutStepDto,
  sport: SportType,
  context: SuuntoGuideContext,
  first: boolean,
): SuuntoFieldsStep {
  const { field, label } = mapTargetToSuunto(step.targets?.[0], sport, context);
  const title =
    truncateText(step.name, STEP_TITLE_LENGTH) ||
    DEFAULT_STEP_TITLES[step.stepType as WORKOUT_STEP_TYPE] ||
    'Step';

  // Shown for 20 seconds as the step starts: what to do, then any notes
  const text = truncateText(
    [describeDuration(step), label, step.notes].filter(Boolean).join(' · '),
    NOTIFICATION_TEXT_LENGTH,
  );

  return {
    type: 'fields',
    title,
    // Each step is a lap, so the lap averages and the activity's laps match
    // the steps. The first one starts with the workout.
    ...(!first && { createManualLap: true }),
    fields: mapFields(step, sport, field),
    transitions: mapTransitions(step),
    notification: text ? { title, text } : { title },
  };
}

const byOrder = (a: WorkoutStepDto, b: WorkoutStepDto) =>
  (a.orderIndex ?? 0) - (b.orderIndex ?? 0);

/**
 * Map a workout to a SuuntoPlus guide. Repeat blocks stay repeat steps,
 * which hold fields steps only.
 */
export function mapWorkoutDtoToSuuntoGuide(
  workout: WorkoutDto,
  sport: SportType,
  title: string | null,
  description: string | null,
  date: string, // YYYY-MM-DD
  workoutId: number,
  context: SuuntoGuideContext = {},
): SuuntoGuide {
  const name = truncateText(title, 60) || 'Workout';
  const richText = truncateText(description, 100000);

  const steps: SuuntoStep[] = [];
  let count = 0;
  const next = (step: WorkoutStepDto) => {
    count += 1;
    return mapFieldsStep(step, sport, context, count === 1);
  };

  for (const step of [...(workout.steps || [])].sort(byOrder)) {
    if (step.stepType === WORKOUT_STEP_TYPE.REPEAT) {
      const children = [...(step.repeatBlock?.childSteps || [])]
        .filter((child) => child.stepType !== WORKOUT_STEP_TYPE.REPEAT)
        .sort(byOrder);
      // Suunto rejects an empty repeat
      if (children.length === 0) continue;
      const times = Math.min(
        MAX_REPEATS,
        Math.max(1, Math.round(step.repeatBlock?.repetitions || 1)),
      );
      steps.push({ type: 'repeat', times, steps: children.map(next) });
    } else {
      steps.push(next(step));
    }
  }

  if (count > MAX_STEPS) {
    throw new Error(
      `Workout has ${count} steps; Suunto accepts ${MAX_STEPS} at most`,
    );
  }

  const activities = mapSportToSuuntoActivityIds(sport);

  return {
    type: 'sequence',
    name,
    description: truncateText(description, 256) || name,
    ...(richText && { richText }),
    shortDescription: truncateText(title, 23) || 'Workout',
    owner: GUIDE_OWNER,
    url: GUIDE_URL,
    ...(activities.length > 0 && { activities }),
    usage: 'workout',
    localDate: date,
    externalId: workoutId.toString(),
    steps,
  };
}
