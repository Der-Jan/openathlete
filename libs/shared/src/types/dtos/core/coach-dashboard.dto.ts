import z from 'zod';

export const coachAlertSchema = z.discriminatedUnion('type', [
  /** Pain reported in feedback and not resolved */
  z.object({
    type: z.literal('pain'),
    location: z.string(),
    painScore: z.number(),
  }),
  /** No activity for a while; days is null when there was never any */
  z.object({ type: z.literal('inactive'), days: z.number().nullable() }),
]);

export type CoachAlertDto = z.infer<typeof coachAlertSchema>;

export const coachDashboardAthleteRowSchema = z.object({
  athleteId: z.number(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().email().nullable(),
  start: z.string(),
  end: z.string(),
  plannedSessions: z.number(),
  completedSessions: z.number(),
  plannedTime: z.number(),
  completedTime: z.number(),
  completedDistance: z.number(),
  /** Latest activity ever, not only in the period */
  lastActivityAt: z.string().nullable(),
  compliancePercent: z.number(),
  /** Fitness (CTL), fatigue (ATL) and form (TSB) today, from TRIMP */
  form: z
    .object({
      ctl: z.number(),
      atl: z.number(),
      tsb: z.number(),
    })
    .nullable(),
  /** What the coach should look at, the most urgent first */
  alerts: z.array(coachAlertSchema),
  /** Messages from the athlete the coach has not read */
  unreadMessages: z.number(),
});

export const coachDashboardResponseSchema = z.object({
  period: z.object({ start: z.string(), end: z.string() }),
  athletes: z.array(coachDashboardAthleteRowSchema),
});

export type CoachDashboardAthleteRowDto = z.infer<
  typeof coachDashboardAthleteRowSchema
>;

export type CoachDashboardResponseDto = z.infer<
  typeof coachDashboardResponseSchema
>;
