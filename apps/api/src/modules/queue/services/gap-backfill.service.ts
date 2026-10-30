import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { Prisma, SportType } from '@openathlete/database';

import {
  GAP_VERSION,
  GapProcessor,
} from '../../core/services/pipeline/processors/gap.processor';
import { NormalizationProcessor } from '../../core/services/pipeline/processors/normalization.processor';
import { PrismaService } from '../../prisma/services/prisma.service';

const BATCH_SIZE = 50;

/**
 * Recomputes the grade adjusted speed of activities adjusted by an older
 * version of GapProcessor, and the normalized speed built on it. Runs in the
 * background on the containers that process activities, a batch at a time,
 * and resumes after a restart.
 */
@Injectable()
export class GapBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GapBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gap: GapProcessor,
    private readonly normalization: NormalizationProcessor,
  ) {}

  onApplicationBootstrap() {
    // Not awaited: the backfill must not delay startup
    void this.run().catch((error: unknown) =>
      this.logger.error(
        `GAP backfill stopped: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  async run(): Promise<number> {
    let done = 0;
    for (;;) {
      const batch = await this.prisma.eventActivity.findMany({
        where: {
          gapVersion: { lt: GAP_VERSION },
          sport: { in: [SportType.RUNNING, SportType.TRAIL_RUNNING] },
          stream: { not: Prisma.DbNull },
        },
        select: { eventActivityId: true, eventId: true },
        orderBy: { eventActivityId: 'asc' },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;
      for (const ctx of batch) {
        try {
          await this.gap.run(ctx);
          await this.normalization.run(ctx);
        } catch (error) {
          this.logger.warn(
            `GAP of activity ${ctx.eventActivityId} could not be recomputed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        // Done, skipped for lack of altitude, or failed: not to retry forever
        await this.prisma.eventActivity.update({
          where: { eventActivityId: ctx.eventActivityId },
          data: { gapVersion: GAP_VERSION },
        });
        done++;
        // The worker also runs import jobs: let them through
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    if (done > 0) this.logger.log(`Recomputed the GAP of ${done} activities`);
    return done;
  }
}
