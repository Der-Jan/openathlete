import { describe, expect, it } from 'vitest';

import {
  ActivitySegment,
  SPORT_TYPE,
  TRAINING_ZONE_TYPE,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
  WorkoutStep,
} from '@openathlete/shared';

import {
  LapOptions,
  availableLapSources,
  flattenWorkout,
  gradeStep,
  lapRows,
  resolveTarget,
  stepsOnTarget,
} from './laps';

const range = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

let nextId = 1;
function step(
  stepType: WORKOUT_STEP_TYPE,
  seconds: number,
  overrides: Partial<WorkoutStep> = {},
): WorkoutStep {
  return {
    workoutStepId: nextId++,
    orderIndex: nextId,
    stepType,
    durationType: WORKOUT_DURATION_TYPE.TIME,
    durationValue: seconds,
    targets: [],
    ...overrides,
  } as WorkoutStep;
}

const target = (
  targetType: WORKOUT_TARGET_TYPE,
  values: { targetMin?: number; targetMax?: number; targetValue?: number },
) =>
  ({
    targetType,
    targetMin: null,
    targetMax: null,
    targetValue: null,
    metricType: null,
    ...values,
  }) as WorkoutStep['targets'][number];

// 10 min warm-up, 3 × (2 min hard, 1 min easy), at 3 m/s with heart rate
// 140, except 170 during the work intervals; one sample every 10 s
const workout = {
  steps: [
    step(WORKOUT_STEP_TYPE.WARMUP, 600),
    step(WORKOUT_STEP_TYPE.REPEAT, 0, {
      durationType: WORKOUT_DURATION_TYPE.OPEN,
      repeatBlock: {
        repetitions: 3,
        childSteps: [
          step(WORKOUT_STEP_TYPE.INTERVAL_ACTIVE, 120, {
            orderIndex: 0,
            targets: [
              target(WORKOUT_TARGET_TYPE.HEARTRATE, {
                targetMin: 165,
                targetMax: 175,
              }),
            ],
          }),
          step(WORKOUT_STEP_TYPE.INTERVAL_REST, 60, { orderIndex: 1 }),
        ],
      } as unknown as WorkoutStep['repeatBlock'],
    }),
  ],
};
const isHard = (t: number) => t >= 600 && (t - 600) % 180 < 120;
const stream = {
  time: range(151, (i) => i * 10),
  distance: range(151, (i) => i * 30),
  heartrate: range(151, (i) => (isHard(i * 10) ? 170 : 140)),
};

const options = (overrides: Partial<LapOptions> = {}): LapOptions => ({
  stream,
  sport: SPORT_TYPE.RUNNING,
  laps: [],
  workout,
  splitMeters: 1000,
  metrics: {},
  zones: [],
  cadenceFactor: 1,
  ...overrides,
});

describe('flattenWorkout', () => {
  it('unrolls repeat blocks in order', () => {
    const steps = flattenWorkout(workout);
    expect(steps.map((s) => s.step.stepType)).toEqual([
      'WARMUP',
      'INTERVAL_ACTIVE',
      'INTERVAL_REST',
      'INTERVAL_ACTIVE',
      'INTERVAL_REST',
      'INTERVAL_ACTIVE',
      'INTERVAL_REST',
    ]);
    expect(steps[3].repetition).toEqual({ index: 2, count: 3 });
  });
});

describe('resolveTarget', () => {
  it('reads absolute bounds in either order', () => {
    expect(
      resolveTarget(
        target(WORKOUT_TARGET_TYPE.PACE, { targetMin: 4, targetMax: 3.5 }),
        {},
        [],
      ),
    ).toEqual({ metric: 'speed', min: 3.5, max: 4 });
  });

  it('turns a share of the athlete threshold into watts', () => {
    expect(
      resolveTarget(
        target(WORKOUT_TARGET_TYPE.POWER, {
          targetMin: 0.95,
          targetMax: 1.05,
        }),
        { FTP_CYCLING: 200 },
        [],
      ),
    ).toEqual({ metric: 'power', min: 190, max: 210 });
  });

  it('reads a zone, pace zones being minutes per kilometre', () => {
    const zones = [
      { id: 7, type: TRAINING_ZONE_TYPE.HEARTRATE, min: 150, max: 160 },
      { id: 8, type: TRAINING_ZONE_TYPE.PACE, min: 5, max: 4 },
    ];
    expect(
      resolveTarget(
        target(WORKOUT_TARGET_TYPE.ZONE, { targetValue: 7 }),
        {},
        zones,
      ),
    ).toEqual({ metric: 'heartrate', min: 150, max: 160 });
    const pace = resolveTarget(
      target(WORKOUT_TARGET_TYPE.ZONE, { targetValue: 8 }),
      {},
      zones,
    )!;
    expect(pace.metric).toBe('speed');
    expect(pace.min).toBeCloseTo(1000 / 300);
    expect(pace.max).toBeCloseTo(1000 / 240);
  });

  it('has nothing to grade on open or unknown targets', () => {
    expect(resolveTarget(target(WORKOUT_TARGET_TYPE.OPEN, {}), {}, [])).toBe(
      undefined,
    );
    expect(
      resolveTarget(
        target(WORKOUT_TARGET_TYPE.ZONE, { targetValue: 99 }),
        {},
        [],
      ),
    ).toBeUndefined();
  });
});

describe('gradeStep', () => {
  const bounds = { metric: 'heartrate' as const, min: 160, max: 170 };
  it('is in, near (within 5%) or off', () => {
    expect(gradeStep(165, bounds)).toBe('in');
    expect(gradeStep(175, bounds)).toBe('near');
    expect(gradeStep(155, bounds)).toBe('near');
    expect(gradeStep(185, bounds)).toBe('off');
  });
});

describe('lapRows', () => {
  it('lays the plan over the activity from its durations', () => {
    const rows = lapRows('plan', options());
    expect(rows).toHaveLength(7);
    expect(rows[1]).toMatchObject({
      startTime: 600,
      endTime: 720,
      active: true,
      compliance: 'in',
    });
    expect(rows[1].actual).toBeCloseTo(170);
    expect(rows[2].active).toBe(false);
    expect(stepsOnTarget(rows)).toEqual({ onTarget: 3, graded: 3 });
  });

  it('follows the device laps when there is one per step', () => {
    const laps = [0, 600, 720, 780, 900, 960, 1080, 1140].flatMap(
      (start, i, all) =>
        i < all.length - 1
          ? [
              {
                activitySegmentId: i,
                segmentType: 'LAP',
                startTimeSeconds: start,
                // The athlete pressed the button a little late
                endTimeSeconds: all[i + 1] + (i === 1 ? 20 : 0),
              } as ActivitySegment,
            ]
          : [],
    );
    const rows = lapRows('plan', options({ laps }));
    expect(rows[1].endTime).toBe(740);
  });

  it('cuts the plan where the activity stopped', () => {
    const short = {
      time: stream.time.slice(0, 80),
      distance: stream.distance.slice(0, 80),
      heartrate: stream.heartrate.slice(0, 80),
    };
    const rows = lapRows('plan', options({ stream: short }));
    // The fourth step was cut short at 790 s, the last sample
    expect(rows.map((row) => row.endTime)).toEqual([600, 720, 780, 790]);
  });

  it('cannot place open steps without laps', () => {
    const open = {
      steps: [
        step(WORKOUT_STEP_TYPE.FREE, 0, {
          durationType: WORKOUT_DURATION_TYPE.LAP_BUTTON,
        }),
      ],
    };
    expect(lapRows('plan', options({ workout: open }))).toEqual([]);
  });

  it('cuts splits along the distance', () => {
    const rows = lapRows('splits', options());
    // 4.5 km: four whole kilometres
    expect(rows).toHaveLength(4);
    expect(rows[0].stats.distanceM).toBe(1020);
    expect(rows[1]).toMatchObject({ startTime: 340 });
  });

  it('offers the plan first, then laps and splits', () => {
    expect(availableLapSources(options())).toEqual(['plan', 'splits']);
    expect(availableLapSources(options({ workout: undefined }))).toEqual([
      'splits',
    ]);
  });
});

describe('detected lap sources', () => {
  it('lists the climbs, graded', () => {
    // 1 km flat then 2 km at 6%, a sample every 10 s at 2.5 m/s
    const n = 1201;
    const climbing = {
      time: range(n, (i) => i * 10),
      distance: range(n, (i) => i * 2.5),
      altitude: range(n, (i) =>
        i * 2.5 < 1000 ? 50 : 50 + (i * 2.5 - 1000) * 0.06,
      ),
    };
    const opts = options({ stream: climbing, workout: undefined });
    expect(availableLapSources(opts)).toContain('climbs');
    const [climb] = lapRows('climbs', opts);
    expect(climb.climb!.grade).toBeCloseTo(0.06, 2);
    expect(climb.stats.elevationGainM).toBeGreaterThan(100);
  });

  it('lists the hard stretches of an interval session', () => {
    // 5 × (2 min at 4 m/s, 2 min at 2.5 m/s), a sample every 5 s
    const time = range(241, (i) => i * 5);
    let distance = 0;
    const session = {
      time,
      distance: time.map((t, i) => {
        if (i > 0) distance += (t % 240 < 120 ? 4 : 2.5) * 5;
        return distance;
      }),
    };
    const opts = options({ stream: session, workout: undefined });
    expect(availableLapSources(opts)).toContain('intervals');
    expect(lapRows('intervals', opts)).toHaveLength(5);
  });
});
