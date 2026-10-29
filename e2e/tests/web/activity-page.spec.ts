import { expect, test } from '@playwright/test';

import { importRecentRun } from '../../support/activities';
import { createAthlete, createCoachWithAthlete } from '../../support/api';
import { signIn } from '../../support/browser';
import { trackPageProblems } from '../../support/page-health';

test.use({ storageState: { cookies: [], origins: [] } });

test('opens an activity as its own page from the calendar', async ({
  page,
  request,
}) => {
  const athlete = await createAthlete(request);
  const { eventId } = await importRecentRun(request, athlete, 'RUNNING', 1, 30);
  await signIn(page, athlete);
  const problems = trackPageProblems(page);

  await page.goto('/dashboard/calendar');
  await page.getByText('RUNNING session').first().click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Open as a page' })
    .click();

  await expect(page).toHaveURL(`/dashboard/activity/${eventId}`);
  const activity = page.locator('[data-activity-page]');
  await expect(
    activity.getByRole('heading', { name: /RUNNING session/ }),
  ).toBeVisible();
  // My own activity shows its data at once, with its comment thread
  await expect(
    activity.locator('[data-activity-stat="distance"]'),
  ).toBeVisible();
  await expect(activity.locator('[data-event-comments]')).toBeVisible();

  await activity.getByRole('button', { name: 'Go back' }).click();
  await expect(page).toHaveURL('/dashboard/calendar');

  expect(problems).toEqual([]);
});

test('a shared link opens the activity for its coach, not for others', async ({
  page,
  request,
}) => {
  const { coach, athlete } = await createCoachWithAthlete(request);
  const { eventId } = await importRecentRun(request, athlete, 'RUNNING', 1, 30);

  await signIn(page, coach);
  const problems = trackPageProblems(page);
  await page.goto(`/dashboard/activity/${eventId}`);
  const activity = page.locator('[data-activity-page]');
  await expect(
    activity.getByRole('heading', { name: /RUNNING session/ }),
  ).toBeVisible();
  await expect(
    activity.locator('[data-activity-stat="distance"]'),
  ).toBeVisible();
  // Opened straight from the link: back leads to the calendar
  await activity.getByRole('button', { name: 'Go back' }).click();
  await expect(page).toHaveURL(/\/dashboard\/calendar/);
  expect(problems).toEqual([]);
});

test('says an activity it cannot show is not there', async ({
  page,
  request,
}) => {
  const owner = await createAthlete(request);
  const stranger = await createAthlete(request, { firstName: 'Stranger' });
  const { eventId } = await importRecentRun(request, owner, 'RUNNING', 1, 30);

  await signIn(page, stranger);
  const problems = trackPageProblems(page);
  await page.goto(`/dashboard/activity/${eventId}`);
  await expect(page.locator('[data-activity-not-found]')).toBeVisible();
  await expect(page.getByText('RUNNING session')).toHaveCount(0);
  // Only the refused read itself, nothing else breaks
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(new RegExp(`HTTP 40[34] GET .*/${eventId}$`));

  await page.goto('/dashboard/activity/not-a-number');
  await expect(page.locator('[data-activity-not-found]')).toBeVisible();
});
