import { ActivitySegmentType } from '@openathlete/database';
import { ActivityStream } from '@openathlete/shared';

import { ActivityParseResult } from './activity-parser.interface';
import { calculateSegmentMetrics, toSegmentColumns } from './activity-segment';
import { compressActivityStream } from './activity-stream';

export function buildFitActivityDetails(parsed: ActivityParseResult) {
  const { stream } = parsed;
  if (
    stream.time &&
    (!stream.time.every(Number.isFinite) ||
      stream.time.some(
        (value, index, values) =>
          value < 0 || (index > 0 && value < values[index - 1]),
      ))
  )
    throw new Error('Invalid FIT timeline');
  // The existing parser omits missing samples. Never align a shortened sensor
  // series against the complete time axis; omit that channel instead.
  let incomplete = false;
  for (const key of Object.keys(stream) as (keyof ActivityStream)[]) {
    if (key !== 'time' && stream[key]?.length !== stream.time?.length) {
      delete stream[key];
      incomplete = true;
    }
  }
  const segments = (parsed.segments ?? [])
    .filter((lap) => lap.endTimeSeconds > lap.startTimeSeconds)
    .map((lap, index) => {
      const metrics = calculateSegmentMetrics(
        stream,
        lap.startTimeSeconds,
        lap.endTimeSeconds,
      );
      return {
        segmentType: ActivitySegmentType.LAP,
        name: lap.name ?? 'Lap ' + (index + 1),
        orderIndex: index,
        startTimeSeconds: Math.round(lap.startTimeSeconds),
        endTimeSeconds: Math.round(lap.endTimeSeconds),
        ...toSegmentColumns(metrics),
      };
    });
  return { stream: compressActivityStream(stream), segments, incomplete };
}
