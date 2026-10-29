import { describe, expect, it } from 'vitest';

import { paceZoneAsSpeed, timeInZones } from './zones';

const zones = [
  { id: 1, min: 0, max: 131 },
  { id: 2, min: 132, max: 150 },
  { id: 3, min: 151, max: 220 },
];

describe('timeInZones', () => {
  it('weights each sample by the time until the next', () => {
    // 10 s at 120, 30 s at 140, 60 s at 160
    const result = timeInZones(
      [120, 140, 160, 160],
      [0, 10, 40, 100],
      zones,
      [0, 3],
    );
    expect(result.map((r) => r.seconds)).toEqual([10, 30, 60]);
    expect(result.map((r) => r.share)).toEqual([0.1, 0.3, 0.6]);
  });

  it('loses nothing between zones nor below the first', () => {
    const result = timeInZones(
      [131.5, 100, 10, 0],
      [0, 1, 2, 3],
      zones.slice(1),
      [0, 3],
    );
    // 131.5 falls between zone 1 and 2, 100 and 10 below zone 2: all in it
    expect(result[0].seconds).toBe(3);
  });

  it('counts only the selected samples, skipping rejected values', () => {
    const result = timeInZones(
      [140, 0, 160, 160],
      [0, 10, 20, 30],
      zones,
      [1, 3],
      (value) => value === 0,
    );
    expect(result.map((r) => r.seconds)).toEqual([0, 0, 10]);
    expect(result[2].share).toBe(1);
  });

  it('keeps the zones in their own order', () => {
    const result = timeInZones([140], [0, 1], [...zones].reverse(), [0, 1]);
    expect(result.map((r) => r.zone.id)).toEqual([3, 2, 1]);
  });
});

describe('paceZoneAsSpeed', () => {
  it('turns minutes per kilometre into m/s, fast pace on top', () => {
    const zone = paceZoneAsSpeed({ id: 1, min: 5, max: 4 });
    expect(zone.min).toBeCloseTo(1000 / 300);
    expect(zone.max).toBeCloseTo(1000 / 240);
  });
});
