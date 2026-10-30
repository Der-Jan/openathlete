import { SPORT_TYPE } from '@openathlete/shared';

import { speedFields } from './presenters';

describe('speedFields', () => {
  it('gives runners a pace per km', () => {
    expect(speedFields(SPORT_TYPE.RUNNING, 1000 / 270)).toEqual({
      avgPace: '4:30/km',
    });
  });

  it('gives swimmers a pace per 100 m and rowers per 500 m', () => {
    expect(speedFields(SPORT_TYPE.SWIMMING, 1)).toEqual({
      avgPace: '1:40/100m',
    });
    expect(speedFields(SPORT_TYPE.ROWING, 500 / 115)).toEqual({
      avgPace: '1:55/500m',
    });
  });

  it('gives cyclists a speed and skips missing values', () => {
    expect(speedFields(SPORT_TYPE.CYCLING, 10)).toEqual({ avgSpeedKmh: 36 });
    expect(speedFields(SPORT_TYPE.RUNNING, 0)).toEqual({});
  });
});
