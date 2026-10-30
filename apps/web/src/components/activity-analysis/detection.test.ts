import { describe, expect, it } from 'vitest';

import { detectClimbs, detectIntervals } from '@openathlete/shared';

const range = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

/** A profile sampled every 10 m from altitude as a function of distance */
const profile = (lengthM: number, altitudeAt: (d: number) => number) => {
  const distance = range(lengthM / 10 + 1, (i) => i * 10);
  return { distance, altitude: distance.map(altitudeAt) };
};

describe('detectClimbs', () => {
  it('finds a climb between flat stretches, without their flat ends', () => {
    // 2 km flat, 2 km at 5%, 2 km flat
    const { distance, altitude } = profile(6000, (d) =>
      d < 2000 ? 100 : d < 4000 ? 100 + (d - 2000) * 0.05 : 200,
    );
    const [climb, ...others] = detectClimbs(altitude, distance);
    expect(others).toEqual([]);
    expect(distance[climb.start]).toBeGreaterThanOrEqual(1950);
    expect(distance[climb.start]).toBeLessThan(2150);
    expect(distance[climb.end]).toBeGreaterThan(3850);
    expect(distance[climb.end]).toBeLessThanOrEqual(4050);
    expect(climb.grade).toBeCloseTo(0.05, 2);
    // 2000 m × 5 = 10,000: category 4
    expect(climb.category).toBe(4);
  });

  it('keeps one climb through a small dip, two through a real descent', () => {
    const dip = profile(5000, (d) =>
      d < 2000
        ? d * 0.06
        : d < 2200
          ? 120 - (d - 2000) * 0.02
          : 116 + (d - 2200) * 0.06,
    );
    expect(detectClimbs(dip.altitude, dip.distance)).toHaveLength(1);

    const descent = profile(5000, (d) =>
      d < 2000
        ? d * 0.06
        : d < 3000
          ? 120 - (d - 2000) * 0.06
          : 60 + (d - 3000) * 0.06,
    );
    expect(detectClimbs(descent.altitude, descent.distance)).toHaveLength(2);
  });

  it('ignores rollers and false flats', () => {
    const rollers = profile(5000, (d) => 100 + 8 * Math.sin(d / 300));
    expect(detectClimbs(rollers.altitude, rollers.distance)).toEqual([]);
    const falseFlat = profile(5000, (d) => 100 + d * 0.015);
    expect(detectClimbs(falseFlat.altitude, falseFlat.distance)).toEqual([]);
  });

  it('grades a mountain pass hors catégorie', () => {
    // 15 km at 7%
    const pass = profile(16000, (d) =>
      d < 1000 ? 500 : 500 + (d - 1000) * 0.07,
    );
    expect(detectClimbs(pass.altitude, pass.distance)[0].category).toBe('HC');
  });
});

describe('detectIntervals', () => {
  // One sample every 5 s
  const time = (seconds: number) => range(seconds / 5 + 1, (i) => i * 5);

  it('finds the work intervals of a session', () => {
    // 10 min at 150 W, 5 × (3 min at 300 W, 2 min at 150 W), 10 min at 150 W
    const t = time(45 * 60);
    const power = t.map((s) => {
      const inSet = s - 600;
      return inSet >= 0 && inSet < 25 * 60 && inSet % 300 < 180 ? 300 : 150;
    });
    const intervals = detectIntervals(power, t);
    expect(intervals).toHaveLength(5);
    for (const [n, interval] of intervals.entries()) {
      const startsAt = 600 + n * 300;
      expect(Math.abs(t[interval.start] - startsAt)).toBeLessThanOrEqual(15);
      expect(t[interval.end] - t[interval.start]).toBeGreaterThan(150);
      expect(t[interval.end] - t[interval.start]).toBeLessThan(200);
    }
  });

  it('finds nothing in a steady effort, nor in one long change of pace', () => {
    const t = time(3600);
    const steady = t.map((_, i) => 200 + ((i * 37) % 21) - 10);
    expect(detectIntervals(steady, t)).toEqual([]);
    const negativeSplit = t.map((s) => (s < 1800 ? 180 : 260));
    expect(detectIntervals(negativeSplit, t)).toEqual([]);
  });

  it('leaves out efforts shorter than a minute', () => {
    const t = time(1800);
    const sprints = t.map((s) => (s % 300 < 20 ? 600 : 150));
    expect(detectIntervals(sprints, t)).toEqual([]);
  });
});
