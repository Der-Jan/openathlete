import { z } from 'zod';

/**
 * A change to an activity's recording, applied over the original one and
 * undone at any time: the original stream is kept from the first change.
 */
export const activityCorrectionSchema = z
  .discriminatedUnion('type', [
    /** Replace the spikes of a sensor with the values around them */
    z.object({
      type: z.literal('despike'),
      channel: z.enum(['heartrate', 'watts']),
    }),
    /**
     * Keep only the part between two times, in seconds from the start of the
     * recording as the previous corrections left it
     */
    z.object({
      type: z.literal('crop'),
      from: z.number().min(0),
      to: z.number().positive(),
    }),
    /** Average the altitude over 100 m, against GPS and barometer noise */
    z.object({ type: z.literal('smoothAltitude') }),
  ])
  .refine(
    (correction) =>
      correction.type !== 'crop' || correction.to > correction.from,
    {
      message: 'The end must come after the start',
    },
  );
export type ActivityCorrection = z.infer<typeof activityCorrectionSchema>;

/** A correction as stored with the activity, with when it was made */
export type StoredActivityCorrection = ActivityCorrection & { at: string };
