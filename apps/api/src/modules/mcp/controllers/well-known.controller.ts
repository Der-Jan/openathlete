import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { OAuthService } from '../auth/oauth.service';

/**
 * Discovery documents. Clients look them up at the root of the API, or with
 * the path of the issuer or resource appended (RFC 8414, RFC 9728): under
 * Docker Compose the web app forwards /.well-known/oauth-* here, so both
 * forms answer.
 */
@ApiExcludeController()
@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly oauth: OAuthService) {}

  @Get(['oauth-protected-resource', 'oauth-protected-resource/*path'])
  @Header('Cache-Control', 'public, max-age=3600')
  protectedResource(@Param('path') path?: string | string[]) {
    // The resource's path follows: activity-import, or api/activity-import
    // when the API sits under the web app's /api
    const segments = Array.isArray(path) ? path : (path?.split('/') ?? []);
    return segments.at(-1) === 'activity-import'
      ? this.oauth.importResourceMetadata()
      : this.oauth.resourceMetadata();
  }

  @Get(['oauth-authorization-server', 'oauth-authorization-server/*path'])
  @Header('Cache-Control', 'public, max-age=3600')
  authorizationServer() {
    return this.oauth.metadata();
  }
}
