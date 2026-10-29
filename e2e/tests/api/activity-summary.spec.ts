import { expect, test } from '@playwright/test';

import { apiHeaders, createAthlete } from '../../support/api';
import { API_URL } from '../../support/env';

test('the worker writes a summary of a new activity on the athlete AI', async ({
  request,
}) => {
  const athlete = await createAthlete(request);
  const headers = apiHeaders(undefined, athlete.accessToken);
  const credential = await request.post(`${API_URL}/ai/credentials`, {
    headers,
    data: {
      provider: 'custom',
      apiKey: 'e2e-secret-key-1234',
      baseUrl: 'http://fake-llm:8080/v1',
    },
  });
  expect(credential.status(), await credential.text()).toBe(201);
  const { aiCredentialId } = (await credential.json()) as {
    aiCredentialId: number;
  };
  const models = await request.put(`${API_URL}/ai/models`, {
    headers,
    data: {
      preferences: [{ task: 'DEFAULT', aiCredentialId, modelId: 'fake-coach' }],
    },
  });
  expect(models.ok(), await models.text()).toBe(true);
  const consent = await request.post(`${API_URL}/ai/consent`, { headers });
  expect(consent.status(), await consent.text()).toBe(200);

  // Logged by hand, as a synced activity would come in: files imported by
  // hand count as history, which the AI leaves alone
  const start = new Date('2026-10-20T07:00:00Z');
  const created = await request.post(`${API_URL}/event`, {
    headers,
    data: {
      type: 'ACTIVITY',
      name: 'Morning run',
      sport: 'RUNNING',
      startDate: start.toISOString(),
      endDate: new Date(start.getTime() + 3600_000).toISOString(),
      distance: 10_000,
      rpe: 0.6,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { eventId } = (await created.json()) as { eventId: number };

  await expect
    .poll(
      async () => {
        const event = await request.get(`${API_URL}/event/${eventId}`, {
          headers,
        });
        return ((await event.json()) as { aiSummary: unknown }).aiSummary;
      },
      { timeout: 30_000 },
    )
    .toMatchObject({
      headline: 'A steady run, the climbs costing a little time',
      suggestion: null,
    });
});
