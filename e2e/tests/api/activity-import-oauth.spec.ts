import { type APIRequestContext, expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type TestUser, apiHeaders, createAthlete } from '../../support/api';
import { API_URL, WEB_URL } from '../../support/env';

// As self-hosted: apps reach the API through the web app's /api
const IMPORT_URL = `${WEB_URL}/api/activity-import`;
const MCP_URL = `${WEB_URL}/api/mcp`;
const REDIRECT = 'https://endurain.example/oauth/callback';
const GPX = readFileSync(
  path.join(import.meta.dirname, '../../fixtures/synthetic-run.gpx'),
);

/** Registration, consent and code exchange, as an app such as Endurain does */
async function connect(
  request: APIRequestContext,
  user: TestUser,
  resource: string,
  scope: string,
) {
  const server = await (
    await request.get(`${WEB_URL}/.well-known/oauth-authorization-server/api`)
  ).json();
  const registration = await request.post(server.registration_endpoint, {
    headers: apiHeaders(),
    data: { client_name: 'Endurain', redirect_uris: [REDIRECT] },
  });
  expect(registration.status()).toBe(201);
  const client = await registration.json();

  const verifier = randomBytes(32).toString('base64url');
  const query = {
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope,
    resource,
  };
  const decision = await request.post(`${API_URL}/oauth/authorize`, {
    headers: apiHeaders(undefined, user.accessToken),
    data: { ...query, approve: true },
  });
  expect(decision.status(), await decision.text()).toBe(200);
  const code = new URL((await decision.json()).redirectTo).searchParams.get(
    'code',
  )!;

  const tokens = await request.post(server.token_endpoint, {
    headers: apiHeaders(),
    form: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: client.client_id,
      code_verifier: verifier,
      resource,
    },
  });
  expect(tokens.status(), await tokens.text()).toBe(200);
  return (await tokens.json()) as { access_token: string; scope: string };
}

const upload = (request: APIRequestContext, token?: string) =>
  request.post(`${IMPORT_URL}/gpx`, {
    headers: apiHeaders(undefined, token),
    multipart: {
      file: {
        name: 'morning-run.gpx',
        mimeType: 'application/gpx+xml',
        buffer: GPX,
      },
      name: 'Run from Endurain',
    },
  });

test('an app sends activity files with an OAuth token for the import API', async ({
  request,
}) => {
  const athlete = await createAthlete(request);

  // Discovery, from the 401 of the import API
  const anonymous = await upload(request);
  expect(anonymous.status()).toBe(401);
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(
    anonymous.headers()['www-authenticate'],
  )?.[1];
  expect(metadataUrl).toBe(
    `${WEB_URL}/api/.well-known/oauth-protected-resource/activity-import`,
  );
  const metadata = await (await request.get(metadataUrl!)).json();
  expect(metadata).toMatchObject({
    resource: IMPORT_URL,
    authorization_servers: [`${WEB_URL}/api`],
    scopes_supported: ['activities:import'],
  });

  const tokens = await connect(
    request,
    athlete,
    IMPORT_URL,
    'activities:import',
  );
  expect(tokens.scope).toBe('activities:import');

  const imported = await upload(request, tokens.access_token);
  expect(imported.status(), await imported.text()).toBe(201);
  const { eventId } = (await imported.json()) as { eventId: number };

  // The activity is in the athlete's calendar
  const event = await request.get(`${API_URL}/event/${eventId}`, {
    headers: apiHeaders(undefined, athlete.accessToken),
  });
  expect(event.status()).toBe(200);
  expect((await event.json()).name).toBe('Run from Endurain');

  // The token is good for nothing else
  const mcp = await request.post(MCP_URL, {
    headers: {
      ...apiHeaders(undefined, tokens.access_token),
      Accept: 'application/json, text/event-stream',
    },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  });
  expect(mcp.status()).toBe(401);
  const calendar = await request.get(`${API_URL}/event`, {
    headers: apiHeaders(undefined, tokens.access_token),
  });
  expect(calendar.status()).toBe(401);
});

test('an AI agent token cannot import activities', async ({ request }) => {
  const athlete = await createAthlete(request);
  const tokens = await connect(request, athlete, MCP_URL, 'read write');

  const refused = await upload(request, tokens.access_token);
  expect(refused.status()).toBe(401);
  expect(refused.headers()['www-authenticate']).toContain(
    'error="invalid_token"',
  );
});
