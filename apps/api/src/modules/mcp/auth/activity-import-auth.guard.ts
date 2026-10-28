import type { Request, Response } from 'express';

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

import { ApiEnvSchemaType } from '@openathlete/shared';

import { mcpUrls } from '../mcp-urls';
import { McpAuthService } from './mcp-auth.service';
import { TOKEN_PREFIX } from './tokens';

const IMPORT_SCOPE = 'activities:import';

/**
 * The activity import API accepts the web app's session, or an OAuth access
 * token issued for this API with the activities:import scope: apps such as
 * Endurain send files on the user's behalf. A token issued for MCP is
 * refused here, as this one is on MCP.
 */
@Injectable()
export class ActivityImportAuthGuard implements CanActivate {
  private readonly session = new (AuthGuard('jwt'))();
  private readonly challenge: string;

  constructor(
    private readonly tokens: McpAuthService,
    config: ConfigService<ApiEnvSchemaType, true>,
  ) {
    // Where an app finds how to get a token (RFC 9728 5.1)
    this.challenge = `Bearer resource_metadata="${mcpUrls(config).importResourceMetadata}", scope="${IMPORT_SCOPE}"`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: unknown }>();
    const response = http.getResponse<Response>();
    const header = request.headers.authorization;

    if (header?.startsWith(`Bearer ${TOKEN_PREFIX.access}`)) {
      const principal = await this.tokens.authenticate(
        header.slice(7).trim(),
        'ACTIVITY_IMPORT',
      );
      if (principal?.scopes.includes(IMPORT_SCOPE)) {
        request.user = principal.user;
        return true;
      }
      response.setHeader(
        'WWW-Authenticate',
        `${this.challenge}, error="invalid_token"`,
      );
      throw new UnauthorizedException(
        'The access token is invalid, expired, revoked or not for this API',
      );
    }

    try {
      return (await this.session.canActivate(context)) as boolean;
    } catch (error) {
      response.setHeader('WWW-Authenticate', this.challenge);
      throw error;
    }
  }
}
