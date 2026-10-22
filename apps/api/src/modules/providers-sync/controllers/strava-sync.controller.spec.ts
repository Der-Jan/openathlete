import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AuthUser } from 'src/modules/auth/decorators/user.decorator';

import { StravaSyncController } from './strava-sync.controller';

jest.mock('src/modules/auth', () => ({
  JwtUser: () => () => undefined,
  UserTypeGuard: class {},
}));

describe('Strava manual sync', () => {
  const user = { userId: 42 } as AuthUser;
  const account = { providerAccountId: 7, importActivitiesEnabled: true };
  function setup(value: object | null = account) {
    const prisma = {
      providerAccount: { findFirst: jest.fn().mockResolvedValue(value) },
    };
    const queue = {
      addRecentStravaSyncJob: jest.fn().mockResolvedValue(undefined),
    };
    return {
      prisma,
      queue,
      controller: new StravaSyncController(prisma as never, queue as never),
    };
  }

  it('queues only the signed-in athlete’s active connection without changing history state', async () => {
    const { controller, prisma, queue } = setup();
    await expect(controller.sync(user)).resolves.toEqual({
      success: true,
      queued: true,
    });
    expect(prisma.providerAccount.findFirst).toHaveBeenCalledWith({
      where: { athlete: { userId: 42 }, provider: 'STRAVA', status: 'active' },
    });
    expect(queue.addRecentStravaSyncJob).toHaveBeenCalledWith(7);
  });

  it('rejects absent or disabled connections without queuing work', async () => {
    for (const value of [
      null,
      { ...account, importActivitiesEnabled: false },
    ]) {
      const { controller, queue } = setup(value);
      await expect(controller.sync(user)).rejects.toBeInstanceOf(
        value ? BadRequestException : NotFoundException,
      );
      expect(queue.addRecentStravaSyncJob).not.toHaveBeenCalled();
    }
  });

  it('does not report acceptance if Redis rejects the job', async () => {
    const { controller, queue } = setup();
    queue.addRecentStravaSyncJob.mockRejectedValue(
      new Error('Queue unavailable'),
    );
    await expect(controller.sync(user)).rejects.toThrow('Queue unavailable');
  });
});
