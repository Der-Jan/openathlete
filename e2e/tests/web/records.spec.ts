import { expect, test } from '@playwright/test';

import { createAthlete } from '../../support/api';
import { signIn } from '../../support/browser';
import { trackPageProblems } from '../../support/page-health';
import { importRunWithRecords } from '../../support/records';

test.use({ storageState: { cookies: [], origins: [] } });

test('shows each kind of record on its own chart, with a table', async ({
  page,
  request,
}) => {
  const athlete = await createAthlete(request);
  await importRunWithRecords(request, athlete);
  await signIn(page, athlete);
  const problems = trackPageProblems(page);

  await page.goto('/dashboard/records');

  // Pace along distance, heart rate along duration: never on one chart
  const pace = page.locator('[data-records-metric="SPEED"]');
  const heartRate = page.locator('[data-records-metric="HEARTRATE"]');
  await expect(pace.getByText('Pace')).toBeVisible();
  await expect(pace.getByRole('rowheader', { name: '1 km' })).toBeVisible();
  await expect(
    heartRate.getByRole('rowheader', { name: '5 min' }),
  ).toBeVisible();
  await expect(pace.locator('svg.recharts-surface').first()).toBeVisible();

  // The run is from 2024: all time has it, the current season does not
  const kilometre = pace.getByRole('row', { name: /^1 km/ });
  // Time over the kilometre, then the pace
  await expect(kilometre.getByRole('cell').nth(0)).toContainText(
    /\d+:\d\d · \d+:\d\d/,
  );
  await expect(kilometre.getByRole('cell').nth(1)).toHaveText('–');

  // Each record links to the activity it comes from
  await kilometre.getByRole('button', { name: /Records run/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  // Training paces come from the strongest effort of the run
  const paces = page.locator('[data-training-paces]');
  await expect(paces.getByText(/^VDOT \d+\.\d/)).toBeVisible();
  await expect(
    paces.getByRole('row', { name: /^Threshold/ }).getByRole('cell'),
  ).toContainText(/\d+:\d\d/);

  expect(problems).toEqual([]);
});
