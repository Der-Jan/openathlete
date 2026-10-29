import { type APIRequestContext, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type TestAthlete, apiHeaders } from './api';
import { API_URL } from './env';

// A synthetic 10-minute GPX run with heart rate and altitude; no real data.
const GPX = readFileSync(
  path.join(import.meta.dirname, '../fixtures/synthetic-run.gpx'),
);

/** Imports the synthetic run and waits until its records are computed. */
export async function importRunWithRecords(
  request: APIRequestContext,
  athlete: TestAthlete,
) {
  const headers = apiHeaders(undefined, athlete.accessToken);
  const response = await request.post(`${API_URL}/activity-import/gpx`, {
    headers,
    multipart: {
      file: {
        name: 'run.gpx',
        mimeType: 'application/octet-stream',
        buffer: GPX,
      },
      name: 'Records run',
      sport: 'RUNNING',
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const imported = (await response.json()) as { eventId: number };

  // The processing pipeline computes them in the background
  await expect
    .poll(
      async () => {
        const records = await request.get(`${API_URL}/record?sport=RUNNING`, {
          headers,
        });
        return ((await records.json()) as unknown[]).length;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  return imported;
}
