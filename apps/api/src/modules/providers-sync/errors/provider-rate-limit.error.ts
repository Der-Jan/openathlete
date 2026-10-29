/**
 * The provider refused a request for quota (HTTP 429). Callers stop sending
 * this account's requests until the next run instead of retrying at once.
 */
export class ProviderRateLimitError extends Error {
  constructor(
    provider: string,
    /** How long to wait, from the provider's Retry-After when it sends one */
    readonly retryAfterMs = 60_000,
  ) {
    super(`${provider} rate limit reached; will retry later`);
    this.name = 'ProviderRateLimitError';
  }
}
