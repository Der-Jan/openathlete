import { Prisma } from '@openathlete/database';
import {
  ActivityStream,
  CompressedActivityStream,
  StoredActivityCorrection,
  applyCorrections,
} from '@openathlete/shared';

import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import {
  compressActivityStream,
  uncompressActivityStream,
} from './activity-stream';

export const storedCorrections = (
  value: Prisma.JsonValue | null | undefined,
): StoredActivityCorrection[] =>
  Array.isArray(value) ? (value as unknown as StoredActivityCorrection[]) : [];

/**
 * What to write when a provider sends a new recording of an activity: the
 * new recording, or, for a corrected activity, the new recording as its
 * original with the athlete's corrections applied over it again.
 */
export async function streamUpdate(
  prisma: Pick<PrismaService, 'eventActivity'>,
  eventActivityId: number,
  compressed: CompressedActivityStream,
): Promise<Prisma.EventActivityUpdateInput> {
  const activity = await prisma.eventActivity.findUnique({
    where: { eventActivityId },
    select: { corrections: true },
  });
  const corrections = storedCorrections(activity?.corrections);
  if (!corrections.length) return { stream: compressed as object };
  const { stream } = applyCorrections(
    uncompressActivityStream(compressed) as ActivityStream,
    corrections,
  );
  return {
    originalStream: compressed as object,
    stream: compressActivityStream(stream) as object,
  };
}
