import {
  ActivitySegment,
  ActivityStream,
  SPORT_TYPE,
  TRAINING_ZONE_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
  Workout,
  WorkoutStep,
  WorkoutStepTarget,
  getTargetIntensity,
} from '@openathlete/shared';
import { Climb, detectClimbs, detectIntervals } from '@openathlete/shared';

import { RangeStats, computeRangeStats, indexRange } from './stream-range';
import { buildChartRows } from './tracks';

/** Where a lap table's rows come from */
export type LapSource = 'plan' | 'device' | 'intervals' | 'climbs' | 'splits';

/** A step of the workout, repeats unrolled */
export interface PlannedStep {
  step: WorkoutStep;
  /** 1-based repetition and count, inside a repeat block */
  repetition?: { index: number; count: number };
}

/** A target resolved to absolute bounds, in the unit of the stats */
export interface ResolvedTarget {
  metric: 'speed' | 'heartrate' | 'power' | 'cadence';
  min: number;
  max: number;
}

/**
 * How a step met its target: inside the bounds, within 5% of them, or
 * further off.
 */
export type StepCompliance = 'in' | 'near' | 'off';

export interface LapRow {
  key: string;
  /** Seconds from the start of the activity */
  startTime: number;
  endTime: number;
  stats: RangeStats;
  planned?: PlannedStep;
  target?: ResolvedTarget;
  actual?: number;
  compliance?: StepCompliance;
  /** A work interval, as opposed to warm-up, recovery or cool-down */
  active: boolean;
  climb?: Climb;
}

/** A zone a ZONE target points to, its bounds in the unit of its type */
export interface ZoneBounds {
  id: number;
  type: TRAINING_ZONE_TYPE;
  min: number;
  max: number;
}

const NEAR_SHARE = 0.05;

/** The workout's steps in the order they are done, repeats unrolled */
export function flattenWorkout(workout: Pick<Workout, 'steps'>): PlannedStep[] {
  const byOrder = (a: WorkoutStep, b: WorkoutStep) =>
    a.orderIndex - b.orderIndex;
  return [...workout.steps].sort(byOrder).flatMap((step): PlannedStep[] => {
    if (step.stepType !== WORKOUT_STEP_TYPE.REPEAT) return [{ step }];
    const block = step.repeatBlock;
    if (!block?.childSteps.length) return [];
    const children = [...block.childSteps].sort(byOrder);
    const count = Math.max(1, block.repetitions);
    return Array.from({ length: count }, (_, i) =>
      children.map((child) => ({
        step: child,
        repetition: { index: i + 1, count },
      })),
    ).flat();
  });
}

// Pace zones are stored in decimal minutes per kilometre
const paceToSpeed = (minutesPerKm: number) =>
  minutesPerKm > 0 ? 1000 / (minutesPerKm * 60) : 0;

const ordered = (a: number, b: number): [number, number] =>
  a <= b ? [a, b] : [b, a];

/**
 * The bounds a step aims for, absolute and in the stats' units (m/s, bpm,
 * W, per minute), or undefined when it has none worth grading.
 */
export function resolveTarget(
  target: Pick<
    WorkoutStepTarget,
    'targetType' | 'targetValue' | 'targetMin' | 'targetMax' | 'metricType'
  >,
  metrics: Record<string, number>,
  zones: ZoneBounds[],
): ResolvedTarget | undefined {
  if (target.targetType === WORKOUT_TARGET_TYPE.ZONE) {
    const zone = zones.find((z) => z.id === target.targetValue);
    if (!zone) return undefined;
    if (zone.type === TRAINING_ZONE_TYPE.PACE) {
      const [min, max] = ordered(paceToSpeed(zone.min), paceToSpeed(zone.max));
      return { metric: 'speed', min, max };
    }
    return {
      metric: zone.type === TRAINING_ZONE_TYPE.POWER ? 'power' : 'heartrate',
      min: zone.min,
      max: zone.max,
    };
  }

  const metric = (
    {
      [WORKOUT_TARGET_TYPE.PACE]: 'speed',
      [WORKOUT_TARGET_TYPE.HEARTRATE]: 'heartrate',
      [WORKOUT_TARGET_TYPE.POWER]: 'power',
      [WORKOUT_TARGET_TYPE.CADENCE]: 'cadence',
    } as Partial<Record<string, ResolvedTarget['metric']>>
  )[target.targetType];
  if (!metric) return undefined;

  // Pace, heart rate, power or cadence from here, which the shared enum has
  const { value, min, max } = getTargetIntensity(
    target as Parameters<typeof getTargetIntensity>[0],
    metrics,
  );
  if (min !== null && max !== null) {
    const [lo, hi] = ordered(min, max);
    return { metric, min: lo, max: hi };
  }
  if (value !== null) return { metric, min: value, max: value };
  return undefined;
}

const actualFor = (
  stats: RangeStats,
  metric: ResolvedTarget['metric'],
  cadenceFactor: number,
) => {
  switch (metric) {
    case 'speed':
      return stats.averageSpeed;
    case 'heartrate':
      return stats.averageHeartrate;
    case 'power':
      return stats.averagePower;
    case 'cadence':
      return stats.averageCadence === undefined
        ? undefined
        : stats.averageCadence * cadenceFactor;
  }
};

export function gradeStep(
  actual: number,
  { min, max }: ResolvedTarget,
): StepCompliance {
  if (actual >= min && actual <= max) return 'in';
  const bound = actual < min ? min : max;
  return Math.abs(actual - bound) <= bound * NEAR_SHARE ? 'near' : 'off';
}

const isActive = (step: WorkoutStep) =>
  step.stepType === WORKOUT_STEP_TYPE.INTERVAL_ACTIVE ||
  step.stepType === WORKOUT_STEP_TYPE.STEADY;

function statsFor(
  stream: ActivityStream | undefined,
  startTime: number,
  endTime: number,
  segment?: ActivitySegment,
): RangeStats | null {
  const time = stream?.time;
  const range = time?.length ? indexRange(time, [startTime, endTime]) : null;
  const fromStream = range && stream ? computeRangeStats(stream, range) : null;
  if (fromStream) return fromStream;
  // No samples to read: the device's own figures for the lap
  if (!segment) return null;
  return {
    durationSec: segment.movingTime ?? endTime - startTime,
    distanceM: segment.distance ?? undefined,
    averageSpeed: segment.averageSpeed ?? undefined,
    averageGapSpeed: segment.averageGapSpeed ?? undefined,
    averageHeartrate: segment.averageHeartrate ?? undefined,
    maxHeartrate: segment.maxHeartrate ?? undefined,
    averagePower: segment.averageWatts ?? undefined,
    maxPower: segment.maxWatts ?? undefined,
    averageCadence: segment.averageCadence ?? undefined,
    elevationGainM: segment.elevationGain ?? undefined,
  };
}

/** The time the distance stream reaches `meters`, or undefined if never */
function timeAtDistance(stream: ActivityStream, meters: number) {
  const { distance, time } = stream;
  if (!distance?.length || !time?.length) return undefined;
  const range = indexRange(distance, [meters, Infinity]);
  return range ? time[range[0]] : undefined;
}

/**
 * Where each planned step happened: on the device's laps when there is one
 * per step, else laid over the activity from the steps' own durations and
 * distances. Undefined when neither works, such as open steps without laps.
 */
export function placePlannedSteps(
  steps: PlannedStep[],
  laps: ActivitySegment[],
  stream: ActivityStream | undefined,
): { startTime: number; endTime: number; lap?: ActivitySegment }[] | undefined {
  if (!steps.length) return undefined;
  if (laps.length === steps.length) {
    return laps.map((lap) => ({
      startTime: lap.startTimeSeconds,
      endTime: lap.endTimeSeconds,
      lap,
    }));
  }

  const time = stream?.time;
  if (!stream || !time?.length) return undefined;
  const end = time[time.length - 1];
  const placed: { startTime: number; endTime: number }[] = [];
  let cursor = time[0];
  let distanceCursor = stream.distance?.[0] ?? 0;
  for (const { step } of steps) {
    const value = step.durationValue ?? 0;
    let stepEnd: number | undefined;
    if (step.durationType === WORKOUT_DURATION_TYPE.TIME && value > 0) {
      stepEnd = cursor + value;
    } else if (
      step.durationType === WORKOUT_DURATION_TYPE.DISTANCE &&
      value > 0
    ) {
      stepEnd = timeAtDistance(stream, distanceCursor + value);
    } else {
      return undefined;
    }
    // The activity stopped before the plan did
    if (stepEnd === undefined || cursor >= end) break;
    stepEnd = Math.min(stepEnd, end);
    placed.push({ startTime: cursor, endTime: stepEnd });
    cursor = stepEnd;
    const range = stream.distance?.length
      ? indexRange(time, [stepEnd, Infinity])
      : null;
    if (range) distanceCursor = stream.distance![range[0]];
  }
  return placed.length ? placed : undefined;
}

export interface LapOptions {
  stream?: ActivityStream;
  sport: SPORT_TYPE;
  laps: ActivitySegment[];
  workout?: Pick<Workout, 'steps'>;
  /** Undefined for sports that aren't cut into splits */
  splitMeters?: number;
  metrics: Record<string, number>;
  zones: ZoneBounds[];
  cadenceFactor: number;
}

/** The sources a lap table can offer for this activity, best first */
export function availableLapSources(options: LapOptions): LapSource[] {
  const sources: LapSource[] = [];
  if (planRows(options).length) sources.push('plan');
  if (options.laps.length > 1) sources.push('device');
  if (intervalRows(options).length) sources.push('intervals');
  if (climbRows(options).length) sources.push('climbs');
  if (splitRows(options).length > 1) sources.push('splits');
  return sources;
}

function planRows({
  stream,
  laps,
  workout,
  metrics,
  zones,
  cadenceFactor,
}: LapOptions): LapRow[] {
  if (!workout) return [];
  const steps = flattenWorkout(workout);
  const placed = placePlannedSteps(steps, laps, stream);
  if (!placed) return [];
  return placed.flatMap((place, i): LapRow[] => {
    const planned = steps[i];
    const stats = statsFor(stream, place.startTime, place.endTime, place.lap);
    if (!stats) return [];
    const target = planned.step.targets
      .map((t) => resolveTarget(t, metrics, zones))
      .find((t) => t !== undefined);
    const actual = target && actualFor(stats, target.metric, cadenceFactor);
    return [
      {
        key: `plan-${i}`,
        startTime: place.startTime,
        endTime: place.endTime,
        stats,
        planned,
        target,
        actual,
        compliance:
          target && actual !== undefined
            ? gradeStep(actual, target)
            : undefined,
        active: isActive(planned.step),
      },
    ];
  });
}

function deviceRows({ stream, laps }: LapOptions): LapRow[] {
  return laps.flatMap((lap): LapRow[] => {
    const stats = statsFor(
      stream,
      lap.startTimeSeconds,
      lap.endTimeSeconds,
      lap,
    );
    return stats
      ? [
          {
            key: `lap-${lap.activitySegmentId}`,
            startTime: lap.startTimeSeconds,
            endTime: lap.endTimeSeconds,
            stats,
            active: true,
          },
        ]
      : [];
  });
}

function splitRows({ stream, splitMeters }: LapOptions): LapRow[] {
  const { distance, time } = stream ?? {};
  if (!splitMeters || !stream || !distance?.length || !time?.length) return [];
  const rows: LapRow[] = [];
  let start = 0;
  for (let n = 1; ; n++) {
    const boundary = distance[0] + n * splitMeters;
    const range = indexRange(distance, [boundary, Infinity]);
    if (!range) break;
    const end = range[0];
    const stats = computeRangeStats(stream, [start, end]);
    if (stats)
      rows.push({
        key: `split-${n}`,
        startTime: time[start],
        endTime: time[end],
        stats,
        active: true,
      });
    start = end;
  }
  return rows;
}

/** The hard stretches of an activity done as intervals, power first */
function intervalRows({ stream, sport }: LapOptions): LapRow[] {
  const time = stream?.time;
  if (!stream || !time?.length) return [];
  const { rows, tracks } = buildChartRows(stream, sport, 'time', {
    smooth: false,
  });
  const track = tracks.includes('power')
    ? 'power'
    : tracks.includes('speed')
      ? 'speed'
      : undefined;
  if (!track) return [];
  return detectIntervals(
    rows.map((row) => row[track] ?? null),
    time,
  ).flatMap((interval, n): LapRow[] => {
    const stats = computeRangeStats(stream, [interval.start, interval.end]);
    return stats
      ? [
          {
            key: `interval-${n}`,
            startTime: time[interval.start],
            endTime: time[interval.end],
            stats,
            active: true,
          },
        ]
      : [];
  });
}

export function climbsOf(stream: ActivityStream | undefined): Climb[] {
  const { altitude, distance } = stream ?? {};
  if (!altitude?.length || !distance?.length) return [];
  return detectClimbs(altitude, distance);
}

function climbRows({ stream }: LapOptions): LapRow[] {
  const time = stream?.time;
  if (!stream || !time?.length) return [];
  return climbsOf(stream).flatMap((climb, n): LapRow[] => {
    const stats = computeRangeStats(stream, [climb.start, climb.end]);
    return stats
      ? [
          {
            key: `climb-${n}`,
            startTime: time[climb.start],
            endTime: time[climb.end],
            stats,
            active: true,
            climb,
          },
        ]
      : [];
  });
}

export function lapRows(source: LapSource, options: LapOptions): LapRow[] {
  if (source === 'plan') return planRows(options);
  if (source === 'device') return deviceRows(options);
  if (source === 'intervals') return intervalRows(options);
  if (source === 'climbs') return climbRows(options);
  return splitRows(options);
}

/** How many graded work steps met their target, for the plan's summary */
export function stepsOnTarget(rows: LapRow[]) {
  const graded = rows.filter((row) => row.active && row.compliance);
  return {
    onTarget: graded.filter((row) => row.compliance === 'in').length,
    graded: graded.length,
  };
}
