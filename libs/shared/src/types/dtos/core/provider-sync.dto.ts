import { z } from 'zod';

/** Acknowledges queue acceptance, not completion of the activity imports. */
export const providerSyncResponseSchema = z.object({
  success: z.literal(true),
  queued: z.literal(true),
});

export type ProviderSyncResponse = z.infer<typeof providerSyncResponseSchema>;
