/** A zone's bounds in the unit of the values it sorts */
export interface ZoneRange {
  id: number;
  min: number;
  max: number;
}

export interface ZoneTime<Z extends ZoneRange> {
  zone: Z;
  seconds: number;
  share: number;
}

/**
 * Seconds spent in each zone over the samples [start, end], each sample
 * counting until the next. Zones are read as steps: a value belongs to the
 * highest zone whose lower bound it reaches, so the gaps people leave
 * between zones (131 then 132 bpm) lose nothing, and values below the
 * first zone count in it. Values `skip` rejects, such as a heart rate of
 * 0 or standing still, count nowhere.
 */
export function timeInZones<Z extends ZoneRange>(
  values: (number | null | undefined)[],
  time: number[],
  zones: Z[],
  [start, end]: [number, number],
  skip: (value: number) => boolean = () => false,
): ZoneTime<Z>[] {
  const sorted = [...zones].sort((a, b) => a.min - b.min);
  const seconds = new Map<number, number>(sorted.map((z) => [z.id, 0]));
  let total = 0;
  for (let i = start; i < end; i++) {
    const value = values[i];
    const dt = time[i + 1] - time[i];
    if (value === null || value === undefined || !(dt > 0) || skip(value))
      continue;
    let zone = sorted[0];
    for (const candidate of sorted)
      if (value >= candidate.min) zone = candidate;
    if (!zone) continue;
    seconds.set(zone.id, (seconds.get(zone.id) ?? 0) + dt);
    total += dt;
  }
  return zones.map((zone) => {
    const spent = seconds.get(zone.id) ?? 0;
    return { zone, seconds: spent, share: total > 0 ? spent / total : 0 };
  });
}

// Pace zones are stored in decimal minutes per kilometre
const paceToSpeed = (minutesPerKm: number) =>
  minutesPerKm > 0 ? 1000 / (minutesPerKm * 60) : 0;

/** A pace zone's bounds as speeds, the faster pace being the higher speed */
export function paceZoneAsSpeed<Z extends ZoneRange>(zone: Z): Z {
  const [a, b] = [paceToSpeed(zone.min), paceToSpeed(zone.max)];
  return { ...zone, min: Math.min(a, b), max: Math.max(a, b) };
}
