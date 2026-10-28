import { createHmac } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import type { ApiEnvSchemaType } from '@openathlete/shared';

import { ActivityFileParserService } from '../../core/helpers/activity-file-parser.service';
import { PrismaService } from '../../prisma/services/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { SuuntoProviderService } from './suunto.provider.service';

// The FIT SDK is ESM, which Jest cannot load
jest.mock('../../core/helpers/activity-file-parser.service', () => ({
  ActivityFileParserService: class {},
}));

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part(claims)}.signature`;
}

function setup(env: Record<string, string> = {}) {
  const prisma = {
    providerAccount: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(({ where, data }) =>
        Promise.resolve({ ...where, ...data, importMetricsEnabled: true }),
      ),
    },
  };
  const queue = {
    addSuuntoWorkoutJob: jest.fn(),
    addSuuntoMetricsJob: jest.fn(),
  };
  const config = { get: (key: string) => env[key] };
  const service = new SuuntoProviderService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService<ApiEnvSchemaType, true>,
    queue as unknown as QueueService,
    {} as ActivityFileParserService,
  );
  return { service, prisma, queue };
}

describe('SuuntoProviderService webhooks', () => {
  it('accepts the body signed with the notification secret only', () => {
    const { service } = setup({ SUUNTO_WEBHOOK_SECRET: 'secret' });
    const body = Buffer.from('{"type":"WORKOUT_CREATED"}');
    const signature = createHmac('sha256', 'secret').update(body).digest('hex');

    expect(service.verifyWebhookSignature(body, signature)).toBe(true);
    expect(service.verifyWebhookSignature(body, 'ab'.repeat(32))).toBe(false);
    expect(service.verifyWebhookSignature(body, undefined)).toBe(false);
  });

  it('queues a workout instead of fetching it within the 2 seconds', async () => {
    const { service, queue } = setup();

    await service.handleWebhook({
      type: 'WORKOUT_CREATED',
      username: 'johndoe123',
      workout: { workoutKey: '67604889401b942184624cb8' },
    });

    expect(queue.addSuuntoWorkoutJob).toHaveBeenCalledWith(
      'johndoe123',
      '67604889401b942184624cb8',
    );
  });

  it('reads the key of legacy form notifications', async () => {
    const { service, queue } = setup();

    await service.handleWebhook({
      type: '',
      username: 'johndoe123',
      workoutid: '67604889401b942184624cb8',
    });

    expect(queue.addSuuntoWorkoutJob).toHaveBeenCalled();
  });

  it('syncs the days of 24/7 samples rather than saving them as the day', async () => {
    const { service, prisma, queue } = setup();
    prisma.providerAccount.findFirst.mockResolvedValue({
      providerAccountId: 9,
      importMetricsEnabled: true,
    });

    await service.handleWebhook({
      type: 'SUUNTO_247_ACTIVITY_CREATED',
      username: 'johndoe123',
      samples: [
        {
          timestamp: new Date(Date.now() - 3600_000).toISOString(),
          entryData: { HR: 71, StepCount: 169 },
        },
      ],
    });

    const [accountId, from] = queue.addSuuntoMetricsJob.mock.calls[0];
    expect(accountId).toBe(9);
    // From the day before the sample
    expect(Date.now() - from).toBeGreaterThan(24 * 3600_000);
  });

  it('finds an account saved without its username from the token user claim', async () => {
    const { service, prisma, queue } = setup();
    prisma.providerAccount.findMany.mockResolvedValue([
      { providerAccountId: 4, accessToken: jwt({ user: 'someone' }) },
      { providerAccountId: 5, accessToken: jwt({ user: 'johndoe123' }) },
    ]);

    await service.handleWebhook({
      type: 'SUUNTO_247_SLEEP_CREATED',
      username: 'johndoe123',
      samples: [{ timestamp: new Date().toISOString(), entryData: {} }],
    });

    expect(prisma.providerAccount.update).toHaveBeenCalledWith({
      where: { providerAccountId: 5 },
      data: { externalUserId: 'johndoe123' },
    });
    expect(queue.addSuuntoMetricsJob.mock.calls[0][0]).toBe(5);
  });
});
