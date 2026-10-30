import { z } from 'zod';

/**
 * What the AI read in an activity, stored with it. It explains rather than
 * repeats: each point names a cause or a comparison with its figures.
 */
export const activityAiSummarySchema = z.object({
  /** One sentence: how the session went and the main reason why */
  headline: z.string().min(1).max(240),
  /** Up to three findings, each with the figures behind it */
  points: z.array(z.string().min(1).max(280)).max(3),
  /** What to do about it next, or null when nothing calls for a change */
  suggestion: z.string().max(280).nullable(),
});
export type ActivityAiSummary = z.infer<typeof activityAiSummarySchema>;
