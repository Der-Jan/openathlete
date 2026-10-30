import { useCallback, useState } from 'react';

import { SPORT_TYPE } from '@openathlete/shared';

import { TrackKey } from './tracks';

// Temperature duplicates the weather tab: off until asked for
const DEFAULT_HIDDEN: TrackKey[] = ['temperature'];

const storageKey = (sport: SPORT_TYPE) => `activity-hidden-tracks:${sport}`;

function read(sport: SPORT_TYPE): TrackKey[] {
  try {
    const stored = localStorage.getItem(storageKey(sport));
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    return Array.isArray(parsed) ? (parsed as TrackKey[]) : DEFAULT_HIDDEN;
  } catch {
    return DEFAULT_HIDDEN;
  }
}

/**
 * The tracks the athlete hid, remembered per sport on this device: what a
 * cyclist wants to see differs from a runner's. Storing what is hidden
 * rather than shown lets new tracks appear by default.
 */
export function useHiddenTracks(sport: SPORT_TYPE) {
  const [hidden, setHidden] = useState<TrackKey[]>(() => read(sport));

  const toggle = useCallback(
    (track: TrackKey) =>
      setHidden((current) => {
        const next = current.includes(track)
          ? current.filter((key) => key !== track)
          : [...current, track];
        try {
          localStorage.setItem(storageKey(sport), JSON.stringify(next));
        } catch {
          // Private browsing: the choice lasts for this view only
        }
        return next;
      }),
    [sport],
  );

  return { hidden, toggle };
}
