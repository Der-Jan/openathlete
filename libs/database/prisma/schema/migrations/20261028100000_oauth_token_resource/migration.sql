-- OAuth tokens are bound to the API they were issued for (RFC 8707): the
-- MCP endpoint or the activity import API. Existing tokens are MCP ones; a
-- constant default adds the column without rewriting the table.
-- CreateEnum
CREATE TYPE "oauth_resource" AS ENUM ('MCP', 'ACTIVITY_IMPORT');

-- AlterTable
ALTER TABLE "mcp_token" ADD COLUMN     "resource" "oauth_resource" NOT NULL DEFAULT 'MCP';

