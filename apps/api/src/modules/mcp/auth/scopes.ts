import { OAuthResource } from '@openathlete/database';
import {
  IMPORT_SCOPES,
  MCP_SCOPES,
  OAUTH_SCOPES,
  OAuthScope,
} from '@openathlete/shared';

/** The scopes each resource accepts: a token is never good for both */
export const RESOURCE_SCOPES: Record<OAuthResource, readonly OAuthScope[]> = {
  MCP: MCP_SCOPES,
  ACTIVITY_IMPORT: IMPORT_SCOPES,
};

/**
 * Scopes of a request for a resource: the ones it names, or all of that
 * resource's when it names none. Agents rarely ask for less than everything,
 * and the consent page shows what they get. Null when it names none of the
 * resource's scopes, or a scope of another resource.
 */
export function parseScopes(
  scope: string | undefined,
  resource: OAuthResource = 'MCP',
): OAuthScope[] | null {
  const allowed = RESOURCE_SCOPES[resource];
  if (!scope?.trim()) return [...allowed];
  const asked = scope.trim().split(/\s+/);
  if (
    asked.some(
      (value) =>
        (OAUTH_SCOPES as readonly string[]).includes(value) &&
        !(allowed as readonly string[]).includes(value),
    )
  ) {
    return null;
  }
  const known = allowed.filter((value) => asked.includes(value));
  return known.length ? known : null;
}

/** The scopes of a grant that apply to a resource */
export function scopesFor(
  scopes: readonly string[],
  resource: OAuthResource,
): OAuthScope[] {
  return RESOURCE_SCOPES[resource].filter((scope) => scopes.includes(scope));
}
