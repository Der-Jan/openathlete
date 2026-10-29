/**
 * Aerobic decoupling, TrainingPeaks' Pa:HR or Pw:HR: how much heart rate
 * drifted up against output between the first and second half of a steady
 * effort. Output is power, or speed (grade adjusted when there is one).
 */
export interface Decoupling {
  /** Output per beat over the whole range: the efficiency factor */
  efficiencyFactor: number;
  firstHalf: { output: number; heartrate: number };
  secondHalf: { output: number; heartrate: number };
  /**
   * Share the efficiency lost from one half to the next, in percent:
   * positive when heart rate rose for the same output
   */
  percent: number;
  durationSec: number;
}

/** Below this, a drift says more about the warm-up than about endurance */
export const MIN_DECOUPLING_SECONDS = 20 * 60;

interface Sums {
  output: number;
  heartrate: number;
  weight: number;
}

const half = (sums: Sums) =>
  sums.weight > 0
    ? {
        output: sums.output / sums.weight,
        heartrate: sums.heartrate / sums.weight,
      }
    : null;

/**
 * Decoupling over the samples [start, end], each counting until the next,
 * skipping samples without heart rate or with an output `skip` rejects
 * (standing still). Null without enough of both halves to compare.
 */
export function aerobicDecoupling(
  output: (number | null | undefined)[],
  heartrate: (number | null | undefined)[],
  time: number[],
  [start, end]: [number, number],
  skip: (output: number) => boolean = () => false,
): Decoupling | null {
  if (end <= start) return null;
  const middle = (time[start] + time[end]) / 2;
  const first: Sums = { output: 0, heartrate: 0, weight: 0 };
  const second: Sums = { output: 0, heartrate: 0, weight: 0 };
  for (let i = start; i < end; i++) {
    const out = output[i];
    const hr = heartrate[i];
    const dt = time[i + 1] - time[i];
    if (
      out === null ||
      out === undefined ||
      !hr ||
      hr <= 0 ||
      !(dt > 0) ||
      skip(out)
    )
      continue;
    const sums = time[i] < middle ? first : second;
    sums.output += out * dt;
    sums.heartrate += hr * dt;
    sums.weight += dt;
  }
  const a = half(first);
  const b = half(second);
  if (!a || !b || a.output <= 0 || b.output <= 0) return null;

  const efFirst = a.output / a.heartrate;
  const efSecond = b.output / b.heartrate;
  const weight = first.weight + second.weight;
  return {
    efficiencyFactor:
      (first.output + second.output) / (first.heartrate + second.heartrate),
    firstHalf: a,
    secondHalf: b,
    percent: ((efFirst - efSecond) / efFirst) * 100,
    durationSec: weight,
  };
}

/** How a decoupling reads: steady below 5%, drifting to 10%, then marked */
export function decouplingLevel(
  percent: number,
): 'steady' | 'drift' | 'marked' {
  if (percent < 5) return 'steady';
  if (percent <= 10) return 'drift';
  return 'marked';
}
