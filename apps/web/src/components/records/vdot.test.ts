import { describe, expect, it } from 'vitest';

import { RECORD_TYPE, formatSpeed } from '@openathlete/shared';

import { bestVdotEffort, trainingPaces, vdotFromPerformance } from './vdot';

const pace = (speed: number) => formatSpeed(speed, 'min/km');
const record = (distance: number | null, value: number) => ({
  type: RECORD_TYPE.SPEED,
  distance,
  value,
});

describe('vdotFromPerformance', () => {
  // Values from Daniels' published VDOT tables
  it.each([
    [5000, 19 * 60 + 57, 50],
    [10000, 41 * 60 + 21, 50],
    [5000, 16 * 60 + 57, 60],
  ])('reads %d m in %d s as about VDOT %d', (metres, seconds, expected) => {
    expect(vdotFromPerformance(metres, seconds)).toBeCloseTo(expected, 0);
  });
});

describe('trainingPaces', () => {
  it("matches Daniels' table at VDOT 50", () => {
    const paces = trainingPaces(50);
    expect(pace(paces.threshold)).toBe('4:15');
    expect(pace(paces.interval)).toBe('3:55');
    expect(pace(paces.repetition)).toBe('3:41');
    expect(pace(paces.marathon)).toBe('4:31');
  });

  it('orders the paces from easy to repetition', () => {
    const paces = trainingPaces(45);
    const speeds = [
      paces.easy.slowest,
      paces.easy.fastest,
      paces.marathon,
      paces.threshold,
      paces.interval,
      paces.repetition,
    ];
    expect(speeds).toEqual([...speeds].sort((a, b) => a - b));
  });
});

describe('bestVdotEffort', () => {
  it('keeps the strongest effort, whatever its distance', () => {
    const best = bestVdotEffort([record(5000, 1300), record(10000, 2481)]);
    expect(best?.distance).toBe(10000);
  });

  it('leaves out what the formulas do not cover', () => {
    expect(
      bestVdotEffort([
        record(400, 60),
        record(50000, 15000),
        record(null, 200),
        { ...record(5000, 1200), type: RECORD_TYPE.HEARTRATE },
      ]),
    ).toBeNull();
  });
});
