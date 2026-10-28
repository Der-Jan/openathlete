import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/services/prisma.service';
import { ActivityImportAuthGuard } from './activity-import-auth.guard';
import { McpAuthService } from './mcp-auth.service';

/**
 * Checks the tokens of the OAuth server for the APIs that accept them: the
 * MCP module and the activity import API of the core module. Only depends
 * on the database, so both can import it.
 */
@Module({
  providers: [PrismaService, McpAuthService, ActivityImportAuthGuard],
  exports: [McpAuthService, ActivityImportAuthGuard],
})
export class OAuthTokensModule {}
