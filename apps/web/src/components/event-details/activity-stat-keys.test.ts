import { describe, expect, it } from 'vitest';

import { SPORT_TYPE } from '@openathlete/shared';

import {
  ActivityStatsInput,
  getActivityStatKeys,
  getElapsedSeconds,
} from './activity-stat-keys';

const start = new Date('2026-10-29T07:00:00Z');

function activity(
  overrides: Partial<ActivityStatsInput> = {},
): ActivityStatsInput {
  return {
    sport: SPORT_TYPE.RUNNING,
    startDate: start,
    endDate: new Date(start.getTime() + 3600_000),
    movingTime: 3600,
    maxSpeed: 0,
    averageGapSpeed: null,
    averageHeartrate: null,
    maxHeartrate: null,
    averageWatts: null,
    weightedAverageWatts: null,
    maxWatts: null,
    averageCadence: null,
    equipmentId: null,
    ...overrides,
  };
}

describe('getActivityStatKeys', () => {
  it('shows a ride with a power meter in full', () => {
    expect(
      getActivityStatKeys(
        activity({
          sport: SPORT_TYPE.CYCLING,
          maxSpeed: 15,
          averageHeartrate: 140,
          maxHeartrate: 172,
          averageWatts: 210,
          weightedAverageWatts: 232,
          maxWatts: 780,
          averageCadence: 88,
          equipmentId: 3,
        }),
      ),
    ).toEqual([
      'distance',
      'averageSpeed',
      'maxSpeed',
      'movingTime',
      'elevationGain',
      'averageHeartrate',
      'maxHeartrate',
      'averagePower',
      'normalizedPower',
      'maxPower',
      'averageCadence',
      'equipment',
    ]);
  });

  it('leaves out what the device did not record', () => {
    expect(
      getActivityStatKeys(activity({ sport: SPORT_TYPE.CYCLING })),
    ).toEqual(['distance', 'averageSpeed', 'movingTime', 'elevationGain']);
  });

  it('shows running power from a foot pod, but not running cadence', () => {
    // Providers disagree on running cadence (steps or strides per minute)
    const keys = getActivityStatKeys(
      activity({ averageWatts: 250, averageCadence: 86, averageGapSpeed: 3.2 }),
    );
    expect(keys).toContain('averagePower');
    expect(keys).toContain('gap');
    expect(keys).not.toContain('averageCadence');
  });

  it('shows rowing power and stroke rate', () => {
    const keys = getActivityStatKeys(
      activity({
        sport: SPORT_TYPE.ROWING,
        averageWatts: 180,
        averageCadence: 24,
      }),
    );
    expect(keys).toContain('averagePower');
    expect(keys).toContain('averageCadence');
  });

  it('keeps strength to time and heart rate', () => {
    expect(
      getActivityStatKeys(
        activity({
          sport: SPORT_TYPE.STRENGTH,
          averageHeartrate: 110,
          maxHeartrate: 150,
          averageWatts: 90,
        }),
      ),
    ).toEqual(['movingTime', 'averageHeartrate', 'maxHeartrate']);
  });

  it('adds the elapsed time when the activity was paused', () => {
    const paused = activity({ movingTime: 3300 });
    expect(getActivityStatKeys(paused)).toContain('elapsedTime');
    expect(getActivityStatKeys(activity({ movingTime: 3570 }))).not.toContain(
      'elapsedTime',
    );
  });
});

describe('getElapsedSeconds', () => {
  it('reads dates serialised as strings', () => {
    expect(
      getElapsedSeconds({
        startDate: '2026-10-29T07:00:00.000Z' as unknown as Date,
        endDate: '2026-10-29T08:01:30.000Z' as unknown as Date,
      }),
    ).toBe(3690);
  });
});
