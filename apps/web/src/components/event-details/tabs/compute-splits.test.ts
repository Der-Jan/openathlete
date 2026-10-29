import { describe, expect, it } from 'vitest';

import { computeSplits } from './compute-splits';

// A steady effort: 1 m/s for `seconds` seconds, sampled every second
const steady = (seconds: number) => ({
  time: Array.from({ length: seconds + 1 }, (_, i) => i),
  distance: Array.from({ length: seconds + 1 }, (_, i) => i),
});

describe('computeSplits', () => {
  it('splits by kilometre by default', () => {
    const splits = computeSplits(steady(2500));
    expect(splits.map((s) => s.index)).toEqual([1, 2]);
    expect(splits[0]).toMatchObject({ durationSec: 1000, speedMps: 1 });
  });

  it('splits a swim every 100 m', () => {
    const splits = computeSplits(steady(450), 100);
    expect(splits).toHaveLength(4);
    expect(splits[3]).toMatchObject({ index: 4, durationSec: 100 });
  });

  it('splits a row every 500 m', () => {
    expect(computeSplits(steady(1600), 500)).toHaveLength(3);
  });

  it('has no split shorter than its length', () => {
    expect(computeSplits(steady(90), 100)).toEqual([]);
    expect(computeSplits(undefined, 100)).toEqual([]);
  });
});
