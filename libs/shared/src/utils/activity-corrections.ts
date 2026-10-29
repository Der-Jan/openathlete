import type { ActivityCorrection } from '../types/dtos/core/activity-correction.dto';
import type { ActivityStream } from '../types/misc/core/activity-stream';
import { smoothAltitude } from './activity-detection';

type Channel = 'heartrate' | 'watts';

// Heart rate outside of this is a sensor fault, whoever the athlete
const HEARTRATE_RANGE: [number, number] = [30, 230];
// A beat-to-beat jump this far from the samples around is the strap
const HEARTRATE_JUMP = 30;
// Watts no human holds over a sample, or a lone sample far above its
// neighbours: a sprint lasts several samples and survives
const POWER_CEILING = 2500;
const POWER_FACTOR = 4;
const POWER_JUMP = 500;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The samples of a sensor that can't be real. A missing heart rate (0)
 * isn't a spike: it stays missing rather than being made up.
 */
export function findSpikes(values: number[], channel: Channel): number[] {
  const spikes: number[] = [];
  const half = channel === 'heartrate' ? 10 : 3;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (channel === 'heartrate' && !(value > 0)) continue;
    const around = values
      .slice(Math.max(0, i - half), i)
      .concat(values.slice(i + 1, i + 1 + half))
      .filter((v) => channel !== 'heartrate' || v > 0);
    const local = median(around);
    if (channel === 'heartrate') {
      if (
        value < HEARTRATE_RANGE[0] ||
        value > HEARTRATE_RANGE[1] ||
        (around.length > 0 && Math.abs(value - local) > HEARTRATE_JUMP)
      )
        spikes.push(i);
    } else if (
      value > POWER_CEILING ||
      (value > local * POWER_FACTOR && value - local > POWER_JUMP)
    ) {
      spikes.push(i);
    }
  }
  return spikes;
}

/** The values with the spikes replaced along the line between neighbours */
function despike(values: number[], channel: Channel): number[] {
  const spikes = new Set(findSpikes(values, channel));
  if (!spikes.size) return values;
  const result = values.slice();
  for (const i of spikes) {
    let before = i - 1;
    while (before >= 0 && spikes.has(before)) before--;
    let after = i + 1;
    while (after < values.length && spikes.has(after)) after++;
    const left = before >= 0 ? values[before] : undefined;
    const right = after < values.length ? values[after] : undefined;
    if (left === undefined && right === undefined) result[i] = 0;
    else if (left === undefined) result[i] = right!;
    else if (right === undefined) result[i] = left;
    else
      result[i] = Math.round(
        left + ((right - left) * (i - before)) / (after - before),
      );
  }
  return result;
}

/** The samples between two times, the stream starting again from zero */
function crop(
  stream: ActivityStream,
  from: number,
  to: number,
): { stream: ActivityStream; offsetSec: number } {
  const time = stream.time ?? [];
  const start = time.findIndex((t) => t - time[0] >= from);
  let end = time.length - 1;
  while (end > 0 && time[end] - time[0] > to) end--;
  if (start < 0 || end <= start) return { stream, offsetSec: 0 };

  const cropped: ActivityStream = {};
  for (const [key, values] of Object.entries(stream) as [
    keyof ActivityStream,
    unknown[] | undefined,
  ][]) {
    if (!Array.isArray(values)) continue;
    // Channels of another length (a GPS track dropped elsewhere) are left out
    if (values.length !== time.length) continue;
    (cropped as Record<string, unknown[]>)[key] = values.slice(start, end + 1);
  }
  const offsetSec = time[start] - time[0];
  cropped.time = cropped.time!.map((t) => t - time[start]);
  if (cropped.distance?.length) {
    const first = cropped.distance[0];
    cropped.distance = cropped.distance.map((d) => d - first);
  }
  return { stream: cropped, offsetSec };
}

/**
 * The stream once the corrections are applied in order, and how much later
 * than the original it starts (for crops).
 */
export function applyCorrections(
  original: ActivityStream,
  corrections: ActivityCorrection[],
): { stream: ActivityStream; offsetSec: number } {
  let stream = original;
  let offsetSec = 0;
  for (const correction of corrections) {
    if (correction.type === 'despike') {
      const values = stream[correction.channel];
      if (values?.length)
        stream = {
          ...stream,
          [correction.channel]: despike(values, correction.channel),
        };
    } else if (correction.type === 'crop') {
      const result = crop(stream, correction.from, correction.to);
      stream = result.stream;
      offsetSec += result.offsetSec;
    } else if (
      correction.type === 'smoothAltitude' &&
      stream.altitude?.length &&
      stream.distance?.length === stream.altitude.length
    ) {
      stream = {
        ...stream,
        altitude: smoothAltitude(stream.altitude, stream.distance).map(
          (a) => Math.round(a * 10) / 10,
        ),
      };
    }
  }
  return { stream, offsetSec };
}

/** The figures of a whole activity, as its summary stores them */
export interface StreamSummary {
  elapsedSec: number;
  movingTimeSec: number;
  distanceM?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  elevationGainM?: number;
  averageHeartrate?: number;
  maxHeartrate?: number;
  averageWatts?: number;
  maxWatts?: number;
  normalizedWatts?: number;
  averageCadence?: number;
}

// Slower than a slow walk is standing still
const MOVING_SPEED = 0.5;
// Altitude changes below a metre are noise
const ELEVATION_NOISE_M = 1;
// Normalized power averages power over 30 seconds first
const NP_WINDOW_SEC = 30;
// Top speed over 5 seconds, not a single GPS jump
const MAX_SPEED_WINDOW_SEC = 5;

function weightedMean(
  values: number[] | undefined,
  time: number[],
  keep: (value: number) => boolean,
) {
  if (!values?.length) return undefined;
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < time.length - 1; i++) {
    const dt = time[i + 1] - time[i];
    if (dt > 0 && keep(values[i])) {
      sum += values[i] * dt;
      weight += dt;
    }
  }
  return weight > 0 ? sum / weight : undefined;
}

/** Mean of `values` over the `seconds` before each sample */
function trailing(values: number[], time: number[], seconds: number) {
  const result: number[] = [];
  let lo = 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    while (time[i] - time[lo] > seconds) sum -= values[lo++];
    result.push(sum / (i - lo + 1));
  }
  return result;
}

/** The activity's totals and averages, recomputed from its stream */
export function summarizeStream(stream: ActivityStream): StreamSummary | null {
  const time = stream.time;
  if (!time || time.length < 2) return null;
  const n = time.length;
  const summary: StreamSummary = {
    elapsedSec: time[n - 1] - time[0],
    movingTimeSec: time[n - 1] - time[0],
  };

  const distance = stream.distance;
  if (distance?.length === n && distance[n - 1] > distance[0]) {
    summary.distanceM = distance[n - 1] - distance[0];
    let moving = 0;
    const speeds: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const dt = time[i + 1] - time[i];
      const speed = dt > 0 ? (distance[i + 1] - distance[i]) / dt : 0;
      speeds.push(speed);
      if (dt > 0 && speed >= MOVING_SPEED) moving += dt;
    }
    speeds.push(speeds[speeds.length - 1] ?? 0);
    summary.movingTimeSec = moving;
    summary.averageSpeed = moving > 0 ? summary.distanceM / moving : 0;
    summary.maxSpeed = Math.max(
      ...trailing(speeds, time, MAX_SPEED_WINDOW_SEC),
    );
  }

  const altitude = stream.altitude;
  if (altitude?.length === n) {
    let gain = 0;
    let reference = altitude[0];
    for (const value of altitude) {
      const delta = value - reference;
      if (Math.abs(delta) < ELEVATION_NOISE_M) continue;
      if (delta > 0) gain += delta;
      reference = value;
    }
    summary.elevationGainM = gain;
  }

  const heartrate = stream.heartrate;
  if (heartrate?.length === n && heartrate.some((v) => v > 0)) {
    summary.averageHeartrate = weightedMean(heartrate, time, (v) => v > 0);
    summary.maxHeartrate = Math.max(...heartrate);
  }

  const watts = stream.watts;
  if (watts?.length === n && watts.some((v) => v > 0)) {
    summary.averageWatts = weightedMean(watts, time, () => true);
    summary.maxWatts = Math.max(...watts);
    const rolled = trailing(watts, time, NP_WINDOW_SEC);
    summary.normalizedWatts =
      (weightedMean(
        rolled.map((v) => v ** 4),
        time,
        () => true,
      ) ?? 0) ** 0.25;
  }

  const cadence = stream.cadence;
  if (cadence?.length === n && cadence.some((v) => v > 0))
    summary.averageCadence = weightedMean(cadence, time, (v) => v > 0);

  return summary;
}

/** Which summary figures a list of corrections changes */
export function correctedFigures(
  corrections: ActivityCorrection[],
): Set<keyof StreamSummary> {
  const figures = new Set<keyof StreamSummary>();
  for (const correction of corrections) {
    if (correction.type === 'crop') {
      // A shorter recording changes every figure
      return new Set([
        'elapsedSec',
        'movingTimeSec',
        'distanceM',
        'averageSpeed',
        'maxSpeed',
        'elevationGainM',
        'averageHeartrate',
        'maxHeartrate',
        'averageWatts',
        'maxWatts',
        'normalizedWatts',
        'averageCadence',
      ]);
    }
    if (correction.type === 'smoothAltitude') figures.add('elevationGainM');
    if (correction.type === 'despike' && correction.channel === 'heartrate') {
      figures.add('averageHeartrate');
      figures.add('maxHeartrate');
    }
    if (correction.type === 'despike' && correction.channel === 'watts') {
      figures.add('averageWatts');
      figures.add('maxWatts');
      figures.add('normalizedWatts');
    }
  }
  return figures;
}
