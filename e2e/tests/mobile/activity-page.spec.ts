import { expect, test } from '@playwright/test';

import { importRecentRun } from '../../support/activities';
import { createAthlete } from '../../support/api';
import { signIn } from '../../support/browser';
import { trackPageProblems } from '../../support/page-health';

test.use({ storageState: { cookies: [], origins: [] } });

test('an activity page fits a phone', async ({ page, request }) => {
  const athlete = await createAthlete(request);
  const { eventId } = await importRecentRun(request, athlete, 'RUNNING', 1, 30);
  await signIn(page, athlete);
  const problems = trackPageProblems(page);

  await page.goto(`/dashboard/activity/${eventId}`);
  const activity = page.locator('[data-activity-page]');
  await expect(
    activity.locator('[data-activity-stat="distance"]'),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');

  // Jump links take a phone straight to a section
  await page
    .locator('[data-activity-sections]')
    .getByRole('button', { name: 'Charts' })
    .click();
  await expect(page.locator('[data-activity-streams-chart]')).toBeInViewport();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
  expect(problems).toEqual([]);
});
