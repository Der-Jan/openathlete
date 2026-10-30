import { statisticsBuckets } from './statistics-buckets';

describe('statisticsBuckets', () => {
  it('keeps the months without activity on the axis', () => {
    const buckets = statisticsBuckets(
      '2026-01-01',
      '2026-12-31',
      'month',
      '2027-02-01',
    );
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toEqual({ period: '2026-01-01', partial: false });
    expect(buckets[11]).toEqual({ period: '2026-12-01', partial: false });
  });

  it('marks the running month and the months to come as partial', () => {
    const buckets = statisticsBuckets(
      '2026-01-01',
      '2026-12-31',
      'month',
      '2026-10-30',
    );
    expect(buckets.map(({ partial }) => partial)).toEqual([
      ...Array<boolean>(9).fill(false),
      true,
      true,
      true,
    ]);
  });

  it('counts the last day of a month as complete once it is over', () => {
    const [october] = statisticsBuckets(
      '2026-10-01',
      '2026-10-31',
      'month',
      '2026-10-31',
    );
    expect(october.partial).toBe(false);
  });

  it('starts weeks on Monday and marks a week the period cuts', () => {
    // Wednesday 7 to Sunday 18 January 2026
    expect(
      statisticsBuckets('2026-01-07', '2026-01-18', 'week', '2026-06-01'),
    ).toEqual([
      { period: '2026-01-05', partial: true },
      { period: '2026-01-12', partial: false },
    ]);
  });

  it('gives one bucket a day', () => {
    expect(
      statisticsBuckets('2026-03-28', '2026-03-30', 'day', '2026-03-29'),
    ).toEqual([
      { period: '2026-03-28', partial: false },
      { period: '2026-03-29', partial: false },
      { period: '2026-03-30', partial: true },
    ]);
  });
});
