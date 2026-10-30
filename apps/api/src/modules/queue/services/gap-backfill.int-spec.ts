import { ActivityStream } from '@openathlete/shared';

import { accountFixtureSql } from 'src/modules/auth/services/account-deletion.fixture';
import {
  compressActivityStream,
  uncompressActivityStream,
} from 'src/modules/core/helpers/activity-stream';
import { gradeAdjustedSpeed } from 'src/modules/core/helpers/grade-adjusted-speed';
import {
  GAP_VERSION,
  GapProcessor,
} from 'src/modules/core/services/pipeline/processors/gap.processor';
import { NormalizationProcessor } from 'src/modules/core/services/pipeline/processors/normalization.processor';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { GapBackfillService } from './gap-backfill.service';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'INTEGRATION_DATABASE_URL must point to a disposable test database',
  );

// The fixture's activity 3501, on event 3002 of athlete 2001
const ACTIVITY_ID = 3501;

/** 2 km at 3 m/s on a steady 10% climb, one point every 5 s. */
const stream = compressActivityStream({
  time: Array.from({ length: 134 }, (_, i) => i * 5),
  distance: Array.from({ length: 134 }, (_, i) => i * 15),
  altitude: Array.from({ length: 134 }, (_, i) => i * 1.5),
} as ActivityStream);

describe('GAP backfill (PostgreSQL)', () => {
  let prisma: PrismaService;
  let backfill: GapBackfillService;

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    const config = { get: () => undefined };
    backfill = new GapBackfillService(
      prisma,
      new GapProcessor(prisma),
      new NormalizationProcessor(
        prisma,
        config as unknown as ConstructorParameters<
          typeof NormalizationProcessor
        >[1],
      ),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.table_name}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
    for (const sql of accountFixtureSql) await prisma.$executeRawUnsafe(sql);
    await prisma.eventActivity.update({
      where: { eventActivityId: ACTIVITY_ID },
      data: {
        sport: 'RUNNING',
        stream: stream as object,
        averageGapSpeed: 1,
        gapVersion: 0,
      },
    });
  });

  it('recomputes the grade adjusted speed and its stream', async () => {
    expect(await backfill.run()).toBe(1);

    const activity = await prisma.eventActivity.findUniqueOrThrow({
      where: { eventActivityId: ACTIVITY_ID },
    });
    expect(activity.gapVersion).toBe(GAP_VERSION);
    expect(activity.averageGapSpeed).toBeCloseTo(gradeAdjustedSpeed(3, 0.1), 1);
    const { gap } = uncompressActivityStream(
      activity.stream as Parameters<typeof uncompressActivityStream>[0],
    );
    expect(gap?.[60]).toBeCloseTo(gradeAdjustedSpeed(3, 0.1), 1);
  });

  it('does nothing once every activity is up to date', async () => {
    await backfill.run();
    expect(await backfill.run()).toBe(0);
  });

  it('marks an activity it cannot adjust, to skip it next time', async () => {
    await prisma.eventActivity.update({
      where: { eventActivityId: ACTIVITY_ID },
      data: {
        stream: compressActivityStream({
          time: [0, 5],
        } as ActivityStream) as object,
      },
    });
    expect(await backfill.run()).toBe(1);
    expect(await backfill.run()).toBe(0);
  });
});
