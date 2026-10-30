import { describe, expect, it } from 'vitest';

import { RECORD_TYPE } from '@openathlete/shared';

import { effortsBeatingPeriod } from './best-efforts';

const pace = (distance: number, seconds: number) => ({
  type: RECORD_TYPE.SPEED,
  distance,
  duration: null,
  value: seconds,
});
const power = (duration: number, watts: number) => ({
  type: RECORD_TYPE.POWER,
  distance: null,
  duration,
  value: watts,
});

describe('effortsBeatingPeriod', () => {
  it('keeps faster times and higher powers, ties included', () => {
    const beaten = effortsBeatingPeriod(
      [pace(1000, 230), pace(5000, 1300), power(300, 280), power(1200, 250)],
      [pace(1000, 240), pace(5000, 1250), power(300, 280), power(1200, 260)],
    );
    expect(beaten).toEqual([pace(1000, 230), power(300, 280)]);
  });

  it('counts a distance the period never reached as beaten', () => {
    expect(
      effortsBeatingPeriod([pace(10000, 2700)], [pace(5000, 1300)]),
    ).toEqual([pace(10000, 2700)]);
  });

  it('never calls a heart rate or elevation record a best effort', () => {
    expect(
      effortsBeatingPeriod(
        [
          {
            type: RECORD_TYPE.HEARTRATE,
            distance: null,
            duration: 60,
            value: 190,
          },
          {
            type: RECORD_TYPE.ELEVATION_GAIN,
            distance: 1000,
            duration: null,
            value: 90,
          },
        ],
        [],
      ),
    ).toEqual([]);
  });
});
