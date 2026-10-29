import { ActivityStream } from '@openathlete/shared';

export type Split = {
  /** 1 for the first split */
  index: number;
  durationSec: number;
  speedMps: number;
  ascentM?: number;
  descentM?: number;
  gapMps?: number;
};

/** Whole splits of `splitMeters` along the distance stream */
export function computeSplits(
  stream: ActivityStream | undefined,
  splitMeters = 1000,
): Split[] {
  const d = stream?.distance;
  const t = stream?.time;
  const alt = stream?.altitude;
  const gap = (stream as unknown as { gap: number[] })?.gap as
    number[] | undefined;
  if (!d?.length || !t?.length) return [];

  const res: Split[] = [];
  const lastDistance = d[d.length - 1] ?? 0;
  const count = Math.floor(lastDistance / splitMeters);
  if (count <= 0) return res;

  const timeAtDistance = (targetM: number) => {
    let i = 0;
    while (i < d.length && d[i] < targetM) i++;
    if (i === 0) return t[0];
    if (i >= d.length) return t[t.length - 1];
    const d0 = d[i - 1];
    const d1 = d[i];
    const t0 = t[i - 1];
    const t1 = t[i];
    if (d1 === d0) return t1;
    const r = (targetM - d0) / (d1 - d0);
    return t0 + r * (t1 - t0);
  };

  const elevationAtDistance = (targetM: number) => {
    if (!alt?.length) return undefined as number | undefined;
    let i = 0;
    while (i < d.length && d[i] < targetM) i++;
    if (i === 0) return alt[0];
    if (i >= d.length) return alt[alt.length - 1];
    const d0 = d[i - 1];
    const d1 = d[i];
    const a0 = alt[i - 1];
    const a1 = alt[i];
    if (d1 === d0) return a1;
    const r = (targetM - d0) / (d1 - d0);
    return a0 + r * (a1 - a0);
  };

  for (let index = 1; index <= count; index++) {
    const startDist = (index - 1) * splitMeters;
    const endDist = index * splitMeters;
    const Ts = timeAtDistance(startDist);
    const Te = timeAtDistance(endDist);
    const durationSec = Te - Ts;
    const speedMps = durationSec > 0 ? splitMeters / durationSec : 0;

    // Cumulative D+ / D- within the split
    let ascentM: number | undefined = undefined;
    let descentM: number | undefined = undefined;
    if (alt?.length) {
      const alts: number[] = [];
      const aStart = elevationAtDistance(startDist);
      const aEnd = elevationAtDistance(endDist);
      if (aStart !== undefined) alts.push(aStart);
      for (let i = 0; i < d.length; i++) {
        if (d[i] > startDist && d[i] < endDist) alts.push(alt[i]!);
      }
      if (aEnd !== undefined) alts.push(aEnd);
      let up = 0;
      let down = 0;
      for (let i = 1; i < alts.length; i++) {
        const delta = alts[i] - alts[i - 1];
        if (delta > 0) up += delta;
        else if (delta < 0) down += -delta;
      }
      ascentM = up;
      descentM = down;
    }

    // Time-weighted average GAP (m/s) over [Ts, Te]
    let gapMps: number | undefined = undefined;
    if (gap?.length === t.length) {
      const total = Te - Ts;
      if (total > 0) {
        let weighted = 0;
        // find first index where t[i] > Ts
        let i = 0;
        while (i < t.length && t[i] <= Ts) i++;
        let prevIndex = Math.max(0, i - 1);
        let currentTime = Ts;
        while (currentTime < Te) {
          const nextTime = i < t.length ? Math.min(Te, t[i]) : Te;
          const dt = nextTime - currentTime;
          if (dt > 0) weighted += (gap[prevIndex] ?? 0) * dt;
          currentTime = nextTime;
          if (i < t.length && t[i] <= Te) {
            prevIndex = i;
            i++;
          } else {
            break;
          }
        }
        gapMps = weighted / total;
      }
    }

    res.push({ index, durationSec, speedMps, ascentM, descentM, gapMps });
  }
  return res;
}
