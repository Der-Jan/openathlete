import { describe, expect, it } from 'vitest';

import { calendarWeeks, cumulativeRows } from './regularity-data';

const day = (date: string, movingTime = 3600) => ({
  date,
  movingTime,
  distance: 10000,
  elevationGain: 0,
  count: 1,
});

describe('calendarWeeks', () => {
  it('lays a year out in Monday-first weeks', () => {
    // 1 January 2026 is a Thursday
    const { weeks } = calendarWeeks([], 2026);
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]?.date).toBe('2026-01-01');
    expect(weeks.flat().filter(Boolean)).toHaveLength(365);
  });

  it('ranks days against the athlete, and counts active weeks', () => {
    const { weeks, activeWeeks } = calendarWeeks(
      [
        day('2026-01-05', 600),
        day('2026-01-06', 1200),
        day('2026-01-20', 2400),
        day('2026-02-03', 9000),
        day('2025-02-03', 99999),
      ],
      2026,
    );
    const levels = weeks
      .flat()
      .filter((cell) => cell?.level)
      .map((cell) => cell!.level);
    expect(levels).toEqual([1, 2, 3, 4]);
    expect(activeWeeks).toBe(3);
  });
});

describe('cumulativeRows', () => {
  const days = [day('2025-01-10'), day('2026-01-01'), day('2026-01-10')];
  const rows = cumulativeRows(days, 2026, (d) => d.distance, '2026-01-10');

  it('adds up each year, and stops the current one today', () => {
    const today = rows.find((row) => row.day === 9)!;
    expect(today.current).toBe(20000);
    expect(today.previous).toBe(10000);
    expect(rows.at(-1)?.current).toBeUndefined();
  });

  it('carries on at the average daily rate', () => {
    const today = rows.find((row) => row.day === 9)!;
    expect(today.projection).toBe(20000);
    expect(rows.at(-1)?.projection).toBeCloseTo(20000 + 2000 * (364 - 9), 5);
  });

  it('has no projection for a finished year', () => {
    const past = cumulativeRows(days, 2025, (d) => d.distance, '2026-01-10');
    expect(past.some((row) => row.projection !== undefined)).toBe(false);
    expect(past.at(-1)?.current).toBe(10000);
  });
});
