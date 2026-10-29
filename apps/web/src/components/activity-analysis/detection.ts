/** A climb found along the altitude stream, between two samples */
export interface Climb {
  start: number;
  end: number;
  gainM: number;
  lengthM: number;
  /** Average grade, 0.06 for 6% */
  grade: number;
  /** Strava's categories, from 4 (easiest) to 1, then hors catégorie */
  category: 4 | 3 | 2 | 1 | 'HC' | null;
}

// A climb needs this much gain and grade to be worth listing
const MIN_CLIMB_GAIN_M = 20;
const MIN_CLIMB_GRADE = 0.03;
const MIN_CLIMB_LENGTH_M = 300;
// Altitude is averaged over this distance, against GPS and barometer noise
const SMOOTHING_M = 100;

/** Strava's score, length in metres times grade in percent */
function categoryOf(lengthM: number, grade: number): Climb['category'] {
  const score = lengthM * grade * 100;
  if (score >= 80_000) return 'HC';
  if (score >= 64_000) return 1;
  if (score >= 32_000) return 2;
  if (score >= 16_000) return 3;
  if (score >= 8_000) return 4;
  return null;
}

/** Altitude averaged over a window of distance around each sample */
function smoothAltitude(altitude: number[], distance: number[]): number[] {
  const half = SMOOTHING_M / 2;
  const result: number[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < altitude.length; i++) {
    while (hi < altitude.length && distance[hi] <= distance[i] + half) {
      sum += altitude[hi];
      hi++;
    }
    while (distance[lo] < distance[i] - half) {
      sum -= altitude[lo];
      lo++;
    }
    result.push(sum / (hi - lo));
  }
  return result;
}

/**
 * The climbs of an activity. A climb runs from a low point to the next high
 * point, through dips smaller than a tenth of its gain (10 m at least),
 * then loses its flat ends: it starts where the road starts rising.
 */
export function detectClimbs(altitude: number[], distance: number[]): Climb[] {
  const n = Math.min(altitude.length, distance.length);
  if (n < 2) return [];
  const smooth = smoothAltitude(altitude.slice(0, n), distance.slice(0, n));
  const climbs: Climb[] = [];

  const evaluate = (low: number, high: number) => {
    const total = smooth[high] - smooth[low];
    if (total < MIN_CLIMB_GAIN_M) return;
    const flat = Math.max(2, total * 0.03);
    let start = low;
    for (let i = low; i <= high; i++)
      if (smooth[i] <= smooth[low] + flat) start = i;
    let end = high;
    for (let i = high; i >= start; i--)
      if (smooth[i] >= smooth[high] - flat) end = i;
    const gainM = smooth[end] - smooth[start];
    const lengthM = distance[end] - distance[start];
    if (lengthM < MIN_CLIMB_LENGTH_M || gainM < MIN_CLIMB_GAIN_M) return;
    const grade = gainM / lengthM;
    if (grade < MIN_CLIMB_GRADE) return;
    climbs.push({
      start,
      end,
      gainM,
      lengthM,
      grade,
      category: categoryOf(lengthM, grade),
    });
  };

  let low = 0;
  let high = 0;
  for (let i = 1; i < n; i++) {
    if (high === low && smooth[i] <= smooth[low]) {
      // Still going down to the foot of the next climb
      low = i;
      high = i;
    } else if (smooth[i] >= smooth[high]) {
      high = i;
    } else if (
      smooth[high] - smooth[i] >
      Math.max(10, (smooth[high] - smooth[low]) * 0.1)
    ) {
      evaluate(low, high);
      low = i;
      high = i;
    }
  }
  evaluate(low, high);
  return climbs;
}

/** A hard stretch found in a power or speed stream */
export interface DetectedInterval {
  start: number;
  end: number;
}

// Shorter efforts are noise on a ride, the complaint about intervals.icu
const MIN_INTERVAL_SECONDS = 60;
const MERGE_GAP_SECONDS = 15;
const ROLLING_SECONDS = 30;
// Work must stand out from the rest, or the activity was steady
const MIN_CONTRAST = 1.15;

/**
 * Time-weighted mean over ROLLING_SECONDS centred on each sample: centred,
 * so a stretch is found where it happened rather than half a window late
 */
function rolling(values: (number | null)[], time: number[]): number[] {
  const half = ROLLING_SECONDS / 2;
  const result: number[] = [];
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < values.length; i++) {
    while (time[lo] < time[i] - half) lo++;
    while (hi + 1 < values.length && time[hi + 1] <= time[i] + half) hi++;
    let sum = 0;
    let weight = 0;
    for (let j = lo; j < hi; j++) {
      const dt = time[j + 1] - time[j];
      sum += (values[j] ?? 0) * dt;
      weight += dt;
    }
    result.push(weight > 0 ? sum / weight : (values[i] ?? 0));
  }
  return result;
}

/**
 * The threshold splitting values in two groups as far apart as possible
 * (Otsu), with the means of both groups
 */
function split(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  let best = { threshold: sorted[0], low: 0, high: 0, score: -1 };
  let lowSum = 0;
  for (let i = 1; i < sorted.length; i++) {
    lowSum += sorted[i - 1];
    if (sorted[i] === sorted[i - 1]) continue;
    const lowMean = lowSum / i;
    const highMean = (total - lowSum) / (sorted.length - i);
    const score = i * (sorted.length - i) * (highMean - lowMean) ** 2;
    if (score > best.score)
      best = { threshold: sorted[i], low: lowMean, high: highMean, score };
  }
  return best;
}

/**
 * Work intervals of an activity done as intervals: stretches of a minute
 * or more where the 30-second output stays in the higher of its two
 * levels, gaps under 15 seconds merged. None for a steady activity.
 */
export function detectIntervals(
  output: (number | null)[],
  time: number[],
): DetectedInterval[] {
  if (output.length < 3 || time.length < output.length) return [];
  const smooth = rolling(output, time);
  const moving = smooth.filter((v) => v > 0);
  if (moving.length < 3) return [];
  const { threshold, low, high } = split(moving);
  if (!(low > 0) || high < low * MIN_CONTRAST) return [];

  const stretches: DetectedInterval[] = [];
  let start: number | null = null;
  for (let i = 0; i <= smooth.length; i++) {
    const hard = i < smooth.length && smooth[i] >= threshold;
    if (hard && start === null) start = i;
    if (!hard && start !== null) {
      const end = i - 1;
      const previous = stretches[stretches.length - 1];
      if (previous && time[start] - time[previous.end] <= MERGE_GAP_SECONDS)
        previous.end = end;
      else stretches.push({ start, end });
      start = null;
    }
  }
  const kept = stretches.filter(
    (s) => time[s.end] - time[s.start] >= MIN_INTERVAL_SECONDS,
  );
  // A single long stretch is a change of pace, not a session of intervals
  return kept.length >= 2 ? kept : [];
}
