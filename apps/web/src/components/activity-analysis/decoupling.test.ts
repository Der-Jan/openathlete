import { describe, expect, it } from 'vitest';

import { aerobicDecoupling, decouplingLevel } from './decoupling';

const range = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

// An hour at 200 W, one sample a minute
const time = range(61, (i) => i * 60);
const power = range(61, () => 200);

describe('aerobicDecoupling', () => {
  it('is nil for a steady heart rate at a steady output', () => {
    const result = aerobicDecoupling(
      power,
      range(61, () => 140),
      time,
      [0, 60],
    )!;
    expect(result.percent).toBe(0);
    expect(result.efficiencyFactor).toBeCloseTo(200 / 140);
    expect(result.durationSec).toBe(3600);
  });

  it('measures the drift of heart rate in the second half', () => {
    // 140 bpm for the first half hour, 150 for the second
    const result = aerobicDecoupling(
      power,
      range(61, (i) => (i < 30 ? 140 : 150)),
      time,
      [0, 60],
    )!;
    expect(result.firstHalf).toEqual({ output: 200, heartrate: 140 });
    expect(result.secondHalf).toEqual({ output: 200, heartrate: 150 });
    // (200/140 - 200/150) / (200/140) = 1 - 140/150
    expect(result.percent).toBeCloseTo((1 - 140 / 150) * 100);
    expect(decouplingLevel(result.percent)).toBe('drift');
  });

  it('leaves out the warm-up when the range starts after it', () => {
    // A 10-minute warm-up at 120 bpm would make the drift look large
    const heartrate = range(61, (i) => (i < 10 ? 120 : 145));
    expect(
      aerobicDecoupling(power, heartrate, time, [0, 60])!.percent,
    ).toBeGreaterThan(5);
    expect(aerobicDecoupling(power, heartrate, time, [10, 60])!.percent).toBe(
      0,
    );
  });

  it('skips stops and samples without heart rate', () => {
    const speed = range(61, (i) => (i >= 40 && i < 45 ? 0 : 3));
    const heartrate = range(61, (i) => (i === 50 ? 0 : 150));
    const result = aerobicDecoupling(
      speed,
      heartrate,
      time,
      [0, 60],
      (v) => v < 0.5,
    )!;
    expect(result.percent).toBe(0);
    expect(result.durationSec).toBe(3600 - 6 * 60);
  });

  it('cannot compare without both halves', () => {
    expect(
      aerobicDecoupling(
        power,
        range(61, () => null),
        time,
        [0, 60],
      ),
    ).toBeNull();
    expect(aerobicDecoupling(power, power, time, [5, 5])).toBeNull();
  });
});

describe('decouplingLevel', () => {
  it('reads below 5% as steady and over 10% as marked', () => {
    expect(decouplingLevel(-2)).toBe('steady');
    expect(decouplingLevel(4.9)).toBe('steady');
    expect(decouplingLevel(10)).toBe('drift');
    expect(decouplingLevel(12)).toBe('marked');
  });
});
