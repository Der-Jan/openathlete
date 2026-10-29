import { Job, UnrecoverableError } from 'bullmq';

import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, Inject, Logger, forwardRef } from '@nestjs/common';

import { ConnectorProvider, ProviderAccount } from '@openathlete/database';

import { PrismaService } from '../../prisma/services/prisma.service';
import { FullImportResult } from '../../providers-sync/base/base-provider.service';
import {
  GarminProviderService,
  PolarProviderService,
  StravaProviderService,
  SuuntoProviderService,
} from '../../providers-sync/providers';
import { ProviderFullImportJobData } from '../queue.service';

/**
 * Lists a provider account's activity history and queues one activity
 * import job per activity. Garmin instead requests a backfill, whose
 * activities arrive later through its webhooks.
 */
@Processor('provider-full-import', {
  concurrency: 2,
  // Spread out the history requests: Garmin answers 429 to a burst, such as
  // the backfill of every account at once (openathlete garmin-backfill)
  limiter: { max: 10, duration: 60_000 },
})
export class ProviderFullImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ProviderFullImportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => StravaProviderService))
    private readonly stravaProviderService: StravaProviderService,
    @Inject(forwardRef(() => GarminProviderService))
    private readonly garminProviderService: GarminProviderService,
    @Inject(forwardRef(() => PolarProviderService))
    private readonly polarProviderService: PolarProviderService,
    @Inject(forwardRef(() => SuuntoProviderService))
    private readonly suuntoProviderService: SuuntoProviderService,
  ) {
    super();
  }

  async process(job: Job<ProviderFullImportJobData>) {
    const { providerAccountId } = job.data;
    const account = await this.prisma.providerAccount.findUnique({
      where: { providerAccountId },
    });

    // Disconnected or import turned off since the request: nothing to do
    if (
      !account ||
      account.status !== 'active' ||
      !account.importActivitiesEnabled
    ) {
      if (account) await this.resetRequest(providerAccountId);
      return { queuedActivities: 0, skipped: true };
    }

    let result: FullImportResult;
    try {
      result = await this.runProviderImport(account);
    } catch (error) {
      // A refused request (missing permission...) won't succeed on retry
      if (error instanceof HttpException && error.getStatus() < 500) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }

    await this.prisma.providerAccount.update({
      where: { providerAccountId },
      data: {
        // A Garmin backfill completes later, through webhooks
        fullImportCompletedAt: result.backfillRequested ? null : new Date(),
      },
    });

    this.logger.log(
      `Historical ${account.provider} import for account ${providerAccountId}: ${
        result.backfillRequested
          ? 'backfill requested'
          : `${result.queuedActivities} activities queued`
      }`,
    );
    return result;
  }

  /** Once every attempt failed, let the user request the import again. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<ProviderFullImportJobData>, error: Error) {
    this.logger.error(
      `Historical import for account ${job.data.providerAccountId} failed (attempt ${job.attemptsMade}): ${error.message}`,
      error.stack,
    );
    if (
      error instanceof UnrecoverableError ||
      job.attemptsMade >= (job.opts.attempts ?? 1)
    ) {
      await this.resetRequest(job.data.providerAccountId);
    }
  }

  private runProviderImport(
    account: ProviderAccount,
  ): Promise<FullImportResult> {
    switch (account.provider) {
      case ConnectorProvider.STRAVA:
        return this.stravaProviderService.queueFullImport(account);
      case ConnectorProvider.GARMIN:
        return this.garminProviderService.queueFullImport(account);
      case ConnectorProvider.POLAR:
        return this.polarProviderService.queueFullImport(account);
      case ConnectorProvider.SUUNTO:
        return this.suuntoProviderService.queueFullImport(account);
      default:
        throw new Error(
          `Historical import is not available for ${account.provider}`,
        );
    }
  }

  private async resetRequest(providerAccountId: number) {
    await this.prisma.providerAccount.updateMany({
      where: { providerAccountId, fullImportCompletedAt: null },
      data: { fullImportRequestedAt: null },
    });
  }
}
