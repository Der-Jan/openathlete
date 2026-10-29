import { expect, test } from '@playwright/test';

import { createAthlete } from '../../support/api';
import { signIn } from '../../support/browser';
import { trackPageProblems } from '../../support/page-health';
import { importRunWithRecords } from '../../support/records';

test.use({ storageState: { cookies: [], origins: [] } });

test('crops an activity to a part, then gets the recording back', async ({
  page,
  request,
}) => {
  const athlete = await createAthlete(request);
  const { eventId } = await importRunWithRecords(request, athlete);
  await signIn(page, athlete);
  const problems = trackPageProblems(page);

  await page.goto(`/dashboard/activity/${eventId}`);
  const distance = page.locator('[data-activity-stat="distance"]');
  await expect(distance).toContainText('1.50');

  // Select the first half on the charts, then crop to it
  const plot = page.locator('[data-chart-plot]');
  await plot.scrollIntoViewIfNeeded();
  const box = (await plot.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + 30, { steps: 5 });
  await page.mouse.up();
  const corrections = page.locator('[data-corrections]');
  await corrections.locator('[data-correction="crop"]').click();

  await expect(corrections.locator('[data-applied-corrections]')).toBeVisible();
  await expect(distance).not.toContainText('1.50');

  // The recording as it came is one click away
  await corrections.locator('[data-correction="restore"]').click();
  await expect(corrections.locator('[data-applied-corrections]')).toHaveCount(
    0,
  );
  await expect(distance).toContainText('1.50');

  expect(problems).toEqual([]);
});
