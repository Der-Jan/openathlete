import { z } from 'zod';

/**
 * The one-time code the API hands the web app after an OpenID Connect
 * sign-in, exchanged for the session tokens.
 */
export const oidcExchangeDtoSchema = z.object({
  code: z.string().uuid(),
});

export type OidcExchangeDto = z.infer<typeof oidcExchangeDtoSchema>;

/** Why an OpenID Connect sign-in ended without a session */
export const OIDC_ERRORS = [
  'signup_closed',
  'signup_invite_only',
  'email_unverified',
  'failed',
] as const;
export type OidcError = (typeof OIDC_ERRORS)[number];
