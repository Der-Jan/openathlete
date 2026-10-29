import { m } from '@/paraglide/messages';

import { formatDistance, formatDuration } from '@openathlete/shared';

import { XAxisKind } from './stream-range';

/** A position on the charts' axis: kilometres or elapsed time */
export function formatAxisValue(value: number, kind: XAxisKind) {
  return kind === 'distance'
    ? `${formatDistance(value)} ${m.kilometers()}`
    : formatDuration(value);
}
