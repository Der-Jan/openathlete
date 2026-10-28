import { ConfigService } from '@nestjs/config';

import { ApiEnvSchemaType } from '@openathlete/shared';

export type McpUrls = {
  /** Public base URL of the API, also the OAuth issuer */
  issuer: string;
  /** The MCP endpoint, the resource tokens are issued for */
  resource: string;
  /** Protected Resource Metadata of the MCP endpoint (RFC 9728) */
  resourceMetadata: string;
  /** The activity import API, the resource of apps that send files */
  importResource: string;
  /** Protected Resource Metadata of the activity import API */
  importResourceMetadata: string;
  /** Consent page of the web app */
  consentPage: string;
};

/**
 * Public addresses of the MCP server and its authorization server. The API
 * is reached under APP_URL/api in the Docker Compose setup, and on its own
 * domain on the hosted instance (API_PUBLIC_URL).
 */
export function mcpUrls(
  config: ConfigService<ApiEnvSchemaType, true>,
): McpUrls {
  const appUrl = (config.get('APP_URL') ?? config.get('FRONTEND_URL')).replace(
    /\/+$/,
    '',
  );
  const issuer = (config.get('API_PUBLIC_URL') ?? `${appUrl}/api`).replace(
    /\/+$/,
    '',
  );
  return {
    issuer,
    resource: `${issuer}/mcp`,
    resourceMetadata: `${issuer}/.well-known/oauth-protected-resource/mcp`,
    importResource: `${issuer}/activity-import`,
    importResourceMetadata: `${issuer}/.well-known/oauth-protected-resource/activity-import`,
    consentPage: `${appUrl}/oauth/authorize`,
  };
}
