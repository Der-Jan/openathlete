import { describe, expect, it } from 'vitest';

import { comparedPeriod, statisticsPeriod } from './statistics-period';

const now = new Date(2026, 9, 30, 12);
const day = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');

describe('statisticsPeriod', () => {
  it('ends the rolling periods today', () => {
    const { start, end } = statisticsPeriod('days7', 0, now);
    expect(day(start)).toBe('2026-10-24');
    expect(day(end)).toBe('2026-10-30');
  });

  it('counts twelve whole weeks', () => {
    const { start, end } = statisticsPeriod('weeks12', 0, now);
    expect(day(start)).toBe('2026-8-8');
    expect(day(end)).toBe('2026-10-30');
  });

  it('steps back a whole period at a time', () => {
    const current = statisticsPeriod('weeks4', 0, now);
    const previous = statisticsPeriod('weeks4', -1, now);
    expect(day(addOneDay(previous.end))).toBe(day(current.start));
  });

  it('gives the calendar year', () => {
    const { start, end } = statisticsPeriod('year', -1, now);
    expect(day(start)).toBe('2025-1-1');
    expect(day(end)).toBe('2025-12-31');
  });
});

describe('comparedPeriod', () => {
  const period = statisticsPeriod('days7', 0, now);

  it('has no period without a comparison', () => {
    expect(comparedPeriod(period, 'none')).toBeNull();
  });

  it('takes the days just before', () => {
    const compared = comparedPeriod(period, 'previous')!;
    expect(day(compared.start)).toBe('2026-10-17');
    expect(day(compared.end)).toBe('2026-10-23');
  });

  it('takes the same dates a year ago', () => {
    const compared = comparedPeriod(period, 'lastYear')!;
    expect(day(compared.start)).toBe('2025-10-24');
    expect(day(compared.end)).toBe('2025-10-30');
  });
});

function addOneDay(date: Date) {
  return new Date(date.getTime() + 1000);
}
