import {
  ActivityStream,
  Climb,
  EventWeatherSampleDto,
  SPORT_TYPE,
  aerobicDecoupling,
  detectClimbs,
  detectIntervals,
  formatDuration,
  formatSpeed,
  formatSpeedUnit,
  getSportConfig,
} from '@openathlete/shared';

// Slower than a slow walk is standing still
const MOVING_SPEED = 0.5;
// Long enough for a warm-up to matter in the drift: leave its 10 minutes out
const WARMUP_SKIP_FROM_SECONDS = 40 * 60;
const WARMUP_SECONDS = 10 * 60;

/** Speed from each sample to the next, from the distance stream */
function forwardSpeed(stream: ActivityStream): (number | null)[] | undefined {
  const { time, distance } = stream;
  if (!time?.length || !distance?.length) return undefined;
  if (!distance.some((d) => d !== distance[0])) return undefined;
  const speed = time.map((t, i): number | null => {
    const dt = time[i + 1] - t;
    return dt > 0 ? Math.max(0, (distance[i + 1] - distance[i]) / dt) : null;
  });
  if (speed.length > 1) speed[speed.length - 1] = speed[speed.length - 2];
  return speed;
}

export interface StreamAnalysis {
  decoupling?: {
    percent: number;
    output: 'power' | 'pace';
    warmupSkippedMin: number;
    analysedMin: number;
  };
  climbs: Climb[];
  intervals?: {
    count: number;
    averageSec: number;
    /** Average output during the intervals and between them */
    work: number;
    rest: number;
    output: 'power' | 'speed';
  };
}

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

/** What the activity view computes from the streams, for the prompt */
export function analyseStream(stream: ActivityStream | null): StreamAnalysis {
  const time = stream?.time;
  if (!stream || !time?.length) return { climbs: [] };
  const analysis: StreamAnalysis = { climbs: [] };

  const power = stream.watts?.some((w) => w > 0) ? stream.watts : undefined;
  const speed = forwardSpeed(stream);
  const pace = stream.gap?.length ? stream.gap : speed;
  const output = power ?? pace;

  if (output && stream.heartrate?.length) {
    const end = time.length - 1;
    const total = time[end] - time[0];
    const skip = total >= WARMUP_SKIP_FROM_SECONDS ? WARMUP_SECONDS : 0;
    let start = 0;
    while (start < end && time[start] - time[0] < skip) start++;
    const result = aerobicDecoupling(
      output,
      stream.heartrate,
      time,
      [start, end],
      (value) => !power && value < MOVING_SPEED,
    );
    if (result)
      analysis.decoupling = {
        percent: result.percent,
        output: power ? 'power' : 'pace',
        warmupSkippedMin: skip / 60,
        analysedMin: result.durationSec / 60,
      };
  }

  if (stream.altitude?.length && stream.distance?.length)
    analysis.climbs = detectClimbs(stream.altitude, stream.distance);

  const effort = power ?? speed;
  if (effort) {
    const found = detectIntervals(effort, time);
    if (found.length) {
      const inside = new Set<number>();
      for (const { start, end } of found)
        for (let i = start; i <= end; i++) inside.add(i);
      const work: number[] = [];
      const rest: number[] = [];
      effort.forEach((value, i) => {
        if (value === null) return;
        (inside.has(i) ? work : rest).push(value);
      });
      analysis.intervals = {
        count: found.length,
        averageSec: mean(
          found.map(({ start, end }) => time[end] - time[start]),
        ),
        work: mean(work),
        rest: mean(rest.filter((v) => (power ? true : v >= MOVING_SPEED))),
        output: power ? 'power' : 'speed',
      };
    }
  }
  return analysis;
}

export interface WeatherSummary {
  temperatureC?: number;
  apparentMaxC?: number;
  humidityPct?: number;
  windKmh?: number;
  precipitationMm?: number;
}

const defined = (values: (number | undefined)[]) =>
  values.filter((v): v is number => typeof v === 'number');

export function summariseWeather(
  samples: EventWeatherSampleDto[] | null | undefined,
): WeatherSummary | null {
  if (!samples?.length) return null;
  const apparent = defined(samples.map((s) => s.apparentTemperatureC));
  const precipitation = defined(samples.map((s) => s.precipitationMm));
  const summary: WeatherSummary = {
    temperatureC: mean(defined(samples.map((s) => s.temperatureC))),
    apparentMaxC: apparent.length ? Math.max(...apparent) : undefined,
    humidityPct: mean(defined(samples.map((s) => s.humidityPct))),
    windKmh: mean(defined(samples.map((s) => s.windSpeed10mKmh))),
    precipitationMm: precipitation.length
      ? precipitation.reduce((sum, v) => sum + v, 0)
      : undefined,
  };
  return summary;
}

export interface ActivitySummaryInput {
  language: string;
  name: string;
  sport: SPORT_TYPE;
  startDate: Date;
  distanceM: number;
  movingTimeSec: number;
  elapsedTimeSec: number;
  elevationGainM: number;
  averageSpeed: number;
  averageGapSpeed?: number | null;
  averageHeartrate?: number | null;
  maxHeartrate?: number | null;
  averageWatts?: number | null;
  normalizedWatts?: number | null;
  rpe?: number | null;
  /** The athlete's answers to the post-activity questions */
  feedback: { question: string; answer: string }[];
  plan?: {
    name: string;
    goalDurationSec?: number | null;
    goalDistanceM?: number | null;
    workout: string;
  };
  normalization?: {
    normalizedSpeed?: number | null;
    /** Seconds each condition cost (positive) or saved (negative) */
    factors: { factor: string; seconds: number }[];
  };
  weather: WeatherSummary | null;
  stream: StreamAnalysis;
  /** The same sport over the previous weeks, for comparison */
  recent?: {
    count: number;
    averageSpeed?: number;
    averageHeartrate?: number;
  };
  athleteContext: string;
}

const round = (value: number, digits = 0) => value.toFixed(digits);

/**
 * The facts the summary agent reasons from: everything the activity view
 * shows, written out, so it explains them rather than inventing any.
 */
export function buildActivitySummaryPrompt(
  input: ActivitySummaryInput,
): string {
  const config = getSportConfig(input.sport);
  const speed = (value: number) =>
    `${formatSpeed(value, config.speedUnit)} ${formatSpeedUnit(config.speedUnit)}`;
  const lines: string[] = [];
  const add = (...items: (string | number | false | null | undefined)[]) =>
    lines.push(
      ...items.filter(
        (item): item is string => typeof item === 'string' && !!item,
      ),
    );

  add(
    '=== ATHLETE ===',
    input.athleteContext,
    '',
    '=== ACTIVITY ===',
    `Name: ${input.name}`,
    `Sport: ${input.sport}`,
    `Date: ${input.startDate.toISOString().slice(0, 10)}`,
    input.distanceM > 0 && `Distance: ${round(input.distanceM / 1000, 2)} km`,
    `Moving time: ${formatDuration(input.movingTimeSec)}`,
    input.elapsedTimeSec - input.movingTimeSec >= 60 &&
      `Stopped: ${formatDuration(input.elapsedTimeSec - input.movingTimeSec)}`,
    config.showSpeed &&
      input.averageSpeed > 0 &&
      `Average ${config.speedLabel}: ${speed(input.averageSpeed)}`,
    input.averageGapSpeed &&
      `Grade adjusted pace: ${speed(input.averageGapSpeed)}`,
    input.elevationGainM > 0 &&
      `Elevation gain: ${round(input.elevationGainM)} m`,
    input.averageHeartrate &&
      `Heart rate: ${round(input.averageHeartrate)} bpm average, ${round(input.maxHeartrate ?? 0)} max`,
    input.averageWatts &&
      `Power: ${round(input.averageWatts)} W average${input.normalizedWatts ? `, ${round(input.normalizedWatts)} W normalized` : ''}`,
    input.rpe !== null &&
      input.rpe !== undefined &&
      `RPE given by the athlete: ${round(input.rpe * 10, 1)}/10`,
  );

  add('', '=== PLAN ===');
  if (input.plan) {
    add(
      `Planned session: ${input.plan.name}`,
      input.plan.goalDurationSec &&
        `Planned duration: ${formatDuration(input.plan.goalDurationSec)} (done ${round((input.movingTimeSec / input.plan.goalDurationSec) * 100)}%)`,
      input.plan.goalDistanceM &&
        `Planned distance: ${round(input.plan.goalDistanceM / 1000, 2)} km (done ${round((input.distanceM / input.plan.goalDistanceM) * 100)}%)`,
      'Planned workout:',
      input.plan.workout,
    );
  } else add('No planned session linked.');

  add('', '=== WHAT THE STREAMS SHOW ===');
  const { decoupling, climbs, intervals } = input.stream;
  if (decoupling)
    add(
      `Aerobic decoupling (${decoupling.output} against heart rate, second half against first, over ${round(decoupling.analysedMin)} min${decoupling.warmupSkippedMin ? `, first ${decoupling.warmupSkippedMin} min of warm-up left out` : ''}): ${round(decoupling.percent, 1)}% (under 5% steady, over 10% marked)`,
    );
  if (climbs.length)
    add(
      `Climbs: ${climbs
        .slice()
        .sort((a, b) => b.gainM - a.gainM)
        .slice(0, 3)
        .map(
          (climb) =>
            `${round(climb.lengthM / 1000, 1)} km at ${round(climb.grade * 100, 1)}% (+${round(climb.gainM)} m${climb.category ? `, category ${climb.category}` : ''})`,
        )
        .join('; ')}`,
    );
  if (intervals)
    add(
      `Intervals found: ${intervals.count} of ${formatDuration(intervals.averageSec)} on average, at ${
        intervals.output === 'power'
          ? `${round(intervals.work)} W against ${round(intervals.rest)} W between them`
          : `${speed(intervals.work)} against ${speed(intervals.rest)} between them`
      }`,
    );
  if (!decoupling && !climbs.length && !intervals)
    add('Nothing notable, or no detailed recording.');

  add('', '=== CONDITIONS ===');
  const costs = (input.normalization?.factors ?? []).filter(
    (factor) => Math.abs(factor.seconds) >= 5,
  );
  if (costs.length)
    add(
      `Time the conditions cost (positive) or saved (negative), against flat ground in mild weather: ${costs
        .map(
          (factor) =>
            `${factor.factor.toLowerCase()} ${round(factor.seconds)} s`,
        )
        .join(', ')}`,
      input.normalization?.normalizedSpeed &&
        `Pace those conditions are worth: ${speed(input.normalization.normalizedSpeed)}`,
    );
  const weather = input.weather;
  if (weather)
    add(
      [
        weather.temperatureC !== undefined &&
          `${round(weather.temperatureC)} °C`,
        weather.apparentMaxC !== undefined &&
          `feeling up to ${round(weather.apparentMaxC)} °C`,
        weather.humidityPct !== undefined &&
          `${round(weather.humidityPct)}% humidity`,
        weather.windKmh !== undefined && `wind ${round(weather.windKmh)} km/h`,
        weather.precipitationMm &&
          `${round(weather.precipitationMm, 1)} mm of rain`,
      ]
        .filter(Boolean)
        .join(', '),
    );
  if (!costs.length && !weather) add('Unknown.');

  add('', '=== THE PREVIOUS WEEKS, SAME SPORT ===');
  if (input.recent?.count)
    add(
      `${input.recent.count} activities in the 42 days before: ${[
        input.recent.averageSpeed &&
          `average ${config.speedLabel} ${speed(input.recent.averageSpeed)}`,
        input.recent.averageHeartrate &&
          `average heart rate ${round(input.recent.averageHeartrate)} bpm`,
      ]
        .filter(Boolean)
        .join(', ')}`,
    );
  else add('None.');

  if (input.feedback.length) {
    add('', "=== THE ATHLETE'S OWN WORDS ===");
    for (const { question, answer } of input.feedback)
      add(`- ${question} → ${answer}`);
  }

  add(
    '',
    '=== LANGUAGE ===',
    `Write in ${input.language}, addressing the athlete informally.`,
  );
  return lines.join('\n');
}
