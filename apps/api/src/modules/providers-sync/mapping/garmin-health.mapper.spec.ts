import { MetricType } from '@openathlete/database';

import {
  aggregateGarminPartials,
  garminPulseOxPartials,
  garminRespirationPartials,
  mapGarminDailies,
  mapGarminSleeps,
} from './garmin-health.mapper';

const valueOf = (
  metrics: { type: MetricType; value: number }[],
  type: MetricType,
) => metrics.find((metric) => metric.type === type)?.value;

describe('mapGarminDailies', () => {
  it('averages the day from its heart rate samples, not the 7-day average', () => {
    const metrics = mapGarminDailies([
      {
        summaryId: 'd1',
        calendarDate: '2026-10-27',
        averageHeartRateInBeatsPerMinute: 64,
        timeOffsetHeartRateSamples: { '15': 70, '30': 80, '45': 90 },
        restingHeartRateInBeatsPerMinute: 48,
      },
    ]);

    expect(valueOf(metrics, MetricType.HR_AVG_DAILY)).toBe(80);
    expect(valueOf(metrics, MetricType.HR_REST)).toBe(48);
    expect(metrics[0].date.toISOString()).toBe('2026-10-27T00:00:00.000Z');
  });

  it('skips the negative stress levels Garmin uses for missing data', () => {
    const metrics = mapGarminDailies([
      {
        summaryId: 'd1',
        calendarDate: '2026-10-27',
        averageStressLevel: -1,
        maxStressLevel: 87,
      },
    ]);

    expect(valueOf(metrics, MetricType.STRESS_AVERAGE)).toBeUndefined();
    expect(valueOf(metrics, MetricType.STRESS_MAX)).toBe(87);
  });

  it('only sums the calories Garmin sent', () => {
    expect(
      valueOf(
        mapGarminDailies([{ summaryId: 'd1', calendarDate: '2026-10-27' }]),
        MetricType.DAILY_CALORIES,
      ),
    ).toBeUndefined();
  });
});

describe('mapGarminSleeps', () => {
  it('converts sleep durations to hours on the calendar date', () => {
    const metrics = mapGarminSleeps([
      {
        summaryId: 's1',
        calendarDate: '2026-10-27',
        durationInSeconds: 27000,
        overallSleepScore: { value: 81 },
      },
    ]);

    expect(valueOf(metrics, MetricType.SLEEP_DURATION)).toBe(7.5);
    expect(valueOf(metrics, MetricType.SLEEP_SCORE)).toBe(81);
  });
});

describe('daily partials', () => {
  it('averages the whole day, with an updated epoch replacing its first version', () => {
    const first = garminRespirationPartials([
      {
        summaryId: 'r1',
        startTimeInSeconds: 1_793_000_000,
        startTimeOffsetInSeconds: 3600,
        timeOffsetEpochToBreaths: { '0': 10, '60': 10 },
      },
    ]);
    const update = garminRespirationPartials([
      {
        summaryId: 'r1b',
        startTimeInSeconds: 1_793_000_000,
        startTimeOffsetInSeconds: 3600,
        timeOffsetEpochToBreaths: { '0': 14, '60': 14, '120': 14 },
      },
      {
        summaryId: 'r2',
        startTimeInSeconds: 1_793_000_900,
        startTimeOffsetInSeconds: 3600,
        timeOffsetEpochToBreaths: { '0': 20 },
      },
    ]);

    // Stored by key, as in Redis: the update overwrites the first epoch
    const byKey = new Map([...first, ...update].map((p) => [p.key, p]));
    const metric = aggregateGarminPartials(
      MetricType.RESPIRATION_RATE_AVG,
      first[0].day,
      [...byKey.values()],
    );

    expect(byKey.size).toBe(2);
    expect(metric?.value).toBe(15.5);
  });

  it('keeps the lowest pulse ox reading of the day', () => {
    const partials = garminPulseOxPartials([
      {
        summaryId: 'p1',
        calendarDate: '2026-10-27',
        startTimeInSeconds: 1_793_000_000,
        timeOffsetSpo2Values: { '0': 97, '60': 91 },
      },
      {
        summaryId: 'p1-spo2OnDemand',
        calendarDate: '2026-10-27',
        startTimeInSeconds: 1_793_050_000,
        timeOffsetSpo2Values: { '0': 95 },
        onDemand: true,
      },
    ]);
    const min = partials.filter((p) => p.type === MetricType.PULSE_OX_MIN);
    const avg = partials.filter((p) => p.type === MetricType.PULSE_OX_AVG);

    expect(
      aggregateGarminPartials(MetricType.PULSE_OX_MIN, '2026-10-27', min)
        ?.value,
    ).toBe(91);
    expect(
      aggregateGarminPartials(MetricType.PULSE_OX_AVG, '2026-10-27', avg)
        ?.value,
    ).toBe(94.33);
  });
});
