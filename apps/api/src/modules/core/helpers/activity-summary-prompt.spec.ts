import { SPORT_TYPE } from '@openathlete/shared';

import {
  ActivitySummaryInput,
  analyseStream,
  buildActivitySummaryPrompt,
  summariseWeather,
} from './activity-summary-prompt';

const range = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

describe('analyseStream', () => {
  it('reads the drift past the warm-up, the climbs and the intervals', () => {
    // An hour, a sample every 10 s: 10 min easy, then 5 × (4 min at
    // 4 m/s, 2 min at 2.5 m/s) on a 5% climb, heart rate rising
    const time = range(361, (i) => i * 10);
    const fast = (t: number) => t >= 600 && (t - 600) % 360 < 240 && t < 2400;
    let d = 0;
    const distance = time.map((_, i) => {
      if (i > 0) d += (fast(time[i - 1]) ? 4 : 2.5) * 10;
      return d;
    });
    const stream = {
      time,
      distance,
      altitude: distance.map((x) => 100 + x * 0.05),
      heartrate: time.map((t) => (t < 600 ? 120 : 140 + t / 360)),
    };

    const analysis = analyseStream(stream);
    expect(analysis.decoupling).toMatchObject({
      output: 'pace',
      warmupSkippedMin: 10,
    });
    expect(analysis.decoupling!.percent).toBeGreaterThan(0);
    expect(analysis.climbs).toHaveLength(1);
    expect(analysis.climbs[0].grade).toBeCloseTo(0.05, 2);
    expect(analysis.intervals).toMatchObject({ count: 5, output: 'speed' });
    expect(analysis.intervals!.work).toBeGreaterThan(analysis.intervals!.rest);
  });

  it('has nothing to say without streams', () => {
    expect(analyseStream(null)).toEqual({ climbs: [] });
  });
});

describe('summariseWeather', () => {
  it('averages along the route and adds up the rain', () => {
    expect(
      summariseWeather([
        {
          distM: 0,
          timeSec: 0,
          lat: 0,
          lon: 0,
          temperatureC: 20,
          apparentTemperatureC: 22,
          precipitationMm: 0.5,
        },
        {
          distM: 500,
          timeSec: 100,
          lat: 0,
          lon: 0,
          temperatureC: 24,
          apparentTemperatureC: 27,
          precipitationMm: 1,
        },
      ]),
    ).toMatchObject({
      temperatureC: 22,
      apparentMaxC: 27,
      precipitationMm: 1.5,
    });
    expect(summariseWeather([])).toBeNull();
  });
});

describe('buildActivitySummaryPrompt', () => {
  const input: ActivitySummaryInput = {
    language: 'French',
    name: 'Tempo',
    sport: SPORT_TYPE.RUNNING,
    startDate: new Date('2026-10-20T07:00:00Z'),
    distanceM: 12000,
    movingTimeSec: 3000,
    elapsedTimeSec: 3200,
    elevationGainM: 80,
    averageSpeed: 4,
    averageGapSpeed: 4.1,
    averageHeartrate: 162,
    maxHeartrate: 181,
    rpe: 0.7,
    feedback: [{ question: 'Legs?', answer: 'Heavy' }],
    plan: {
      name: 'Tempo 3 × 10 min',
      goalDurationSec: 3600,
      workout: '3 × 10 min at threshold',
    },
    normalization: {
      normalizedSpeed: 4.2,
      factors: [
        { factor: 'TEMPERATURE', seconds: 54 },
        { factor: 'SLOPE', seconds: 2 },
      ],
    },
    weather: { temperatureC: 27, humidityPct: 60 },
    stream: {
      climbs: [],
      decoupling: {
        percent: 7.2,
        output: 'pace',
        warmupSkippedMin: 10,
        analysedMin: 40,
      },
    },
    recent: { count: 6, averageSpeed: 3.8, averageHeartrate: 150 },
    athleteContext: 'Threshold heart rate 170 bpm',
  };

  it('writes out every fact the view shows, in the sport units', () => {
    const prompt = buildActivitySummaryPrompt(input);
    expect(prompt).toContain('Average pace: 4:10 min/km');
    expect(prompt).toContain('RPE given by the athlete: 7.0/10');
    expect(prompt).toContain('Stopped: 3:20');
    expect(prompt).toContain('done 83%');
    expect(prompt).toContain('Aerobic decoupling');
    expect(prompt).toContain('7.2%');
    expect(prompt).toContain('temperature 54 s');
    // Costs too small to matter stay out
    expect(prompt).not.toContain('slope 2 s');
    expect(prompt).toContain('27 °C');
    expect(prompt).toContain('6 activities in the 42 days before');
    expect(prompt).toContain('Legs? → Heavy');
    expect(prompt).toContain('Write in French');
  });

  it('says what it does not know rather than leaving it blank', () => {
    const prompt = buildActivitySummaryPrompt({
      ...input,
      plan: undefined,
      normalization: undefined,
      weather: null,
      stream: { climbs: [] },
      recent: undefined,
      feedback: [],
    });
    expect(prompt).toContain('No planned session linked.');
    expect(prompt).toContain('Nothing notable, or no detailed recording.');
    expect(prompt).not.toContain("ATHLETE'S OWN WORDS");
  });
});
