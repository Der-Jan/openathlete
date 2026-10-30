import {
  GARMIN_PULL_DELAY_MS,
  GarminNotificationJobData,
  QueueService,
} from './queue.service';

describe('QueueService.addGarminNotificationJobs', () => {
  it('holds the pull back until the ping has been answered', async () => {
    const addBulk = jest.fn();
    const notification = {
      summaryType: 'dailies',
      userId: 'garmin-user',
      callbackURL: 'https://apis.garmin.com/wellness-api/rest/dailies',
    } as GarminNotificationJobData;

    await QueueService.prototype.addGarminNotificationJobs.call(
      { garminNotificationQueue: { addBulk } },
      [notification],
    );

    expect(addBulk.mock.calls[0][0][0].opts.delay).toBe(GARMIN_PULL_DELAY_MS);
  });
});
