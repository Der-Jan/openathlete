import { describe, expect, it, vi } from 'vitest';

import { RECORD_TYPE, SPORT_TYPE } from '@openathlete/shared';

import {
  RECORD_METRICS,
  curveData,
  formatRecordDistance,
  formatRecordDuration,
} from './record-metrics';

vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}));

const metric = (type: RECORD_TYPE) =>
  RECORD_METRICS.find((candidate) => candidate.type === type)!;

describe('records curves', () => {
  it('leaves a gap where a period has no record instead of plotting zero', () => {
    const data = curveData(
      metric(RECORD_TYPE.SPEED),
      [
        {
          key: 'allTime',
          records: [
            {
              type: RECORD_TYPE.SPEED,
              distance: 1000,
              duration: null,
              value: 250,
            },
            {
              type: RECORD_TYPE.SPEED,
              distance: 5000,
              duration: null,
              value: 1500,
            },
            // Another kind of record never lands on the pace curve
            {
              type: RECORD_TYPE.POWER,
              distance: null,
              duration: 60,
              value: 300,
            },
          ],
        },
        {
          key: 'thisYear',
          records: [
            {
              type: RECORD_TYPE.SPEED,
              distance: 1000,
              duration: null,
              value: 260,
            },
          ],
        },
      ],
      SPORT_TYPE.RUNNING,
    );
    expect(data).toEqual([
      { position: 1000, allTime: 4, thisYear: 1000 / 260 },
      { position: 5000, allTime: 5000 / 1500, thisYear: null },
    ]);
  });

  it('places power and heart rate along duration', () => {
    const data = curveData(
      metric(RECORD_TYPE.POWER),
      [
        {
          key: 'allTime',
          records: [
            {
              type: RECORD_TYPE.POWER,
              distance: null,
              duration: 300,
              value: 310,
            },
            {
              type: RECORD_TYPE.POWER,
              distance: null,
              duration: 5,
              value: 900,
            },
          ],
        },
      ],
      SPORT_TYPE.CYCLING,
    );
    expect(data.map((point) => point.position)).toEqual([5, 300]);
  });

  it('writes pace for running and speed for cycling', () => {
    const speed = metric(RECORD_TYPE.SPEED);
    expect(speed.format(4, SPORT_TYPE.RUNNING)).toBe('4:10');
    expect(speed.unit(SPORT_TYPE.RUNNING)).toBe('min/km');
    expect(speed.format(10, SPORT_TYPE.CYCLING)).toBe('36.00');
    expect(speed.title(SPORT_TYPE.CYCLING)).toBe('speed');
  });

  it('writes swim paces per 100 m and rowing paces per 500 m', () => {
    const speed = metric(RECORD_TYPE.SPEED);
    expect(speed.format(1, SPORT_TYPE.SWIMMING)).toBe('1:40');
    expect(speed.unit(SPORT_TYPE.SWIMMING)).toBe('min/100 m');
    expect(speed.title(SPORT_TYPE.SWIMMING)).toBe('pace');
    expect(speed.format(500 / 120, SPORT_TYPE.ROWING)).toBe('2:00');
    expect(speed.title(SPORT_TYPE.ROWING)).toBe('pace');
  });

  it('labels the axes', () => {
    expect(formatRecordDistance(400)).toBe('400 m');
    expect(formatRecordDistance(1500)).toBe('1.5 km');
    expect(formatRecordDistance(21097.5)).toBe('21.1 km');
    expect(formatRecordDistance(10000)).toBe('10 km');
    expect(formatRecordDuration(5)).toBe('5 s');
    expect(formatRecordDuration(1200)).toBe('20 min');
    expect(formatRecordDuration(7200)).toBe('2 h');
  });
});
