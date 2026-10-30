import { EventEmitter2 } from '@nestjs/event-emitter';

import { ActivityStream, CompressedActivityStream } from '@openathlete/shared';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import {
  DELETED_ATHLETE_ID,
  DELETED_USER_ID,
  accountFixtureSql,
} from 'src/modules/auth/services/account-deletion.fixture';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { streamUpdate } from '../helpers/activity-corrections';
import {
  compressActivityStream,
  uncompressActivityStream,
} from '../helpers/activity-stream';
import { ActivityCorrectionsService } from './activity-corrections.service';
import { EventService } from './event.service';

// An ESM package Jest cannot load, pulled in by the FIT import; unused here
jest.mock('@garmin/fitsdk', () => ({}));

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'INTEGRATION_DATABASE_URL must point to a disposable test database',
  );

// The fixture's run: event 3002, activity 3501
const EVENT_ID = 3002;
const ACTIVITY_ID = 3501;

const range = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

// Ten minutes at 3 m/s and 150 bpm, a sample a second, with a strap spike
const recording = (): ActivityStream => ({
  time: range(601, (i) => i),
  distance: range(601, (i) => i * 3),
  heartrate: range(601, (i) => (i === 300 ? 240 : 150)),
  altitude: range(601, () => 100),
});

describe('correcting an activity (PostgreSQL)', () => {
  let prisma: PrismaService;
  let corrections: ActivityCorrectionsService;
  const queue = { addActivityProcessingJob: jest.fn() };
  const athlete = {
    userId: DELETED_USER_ID,
    email: 'athlete@example.com',
    athlete: { athleteId: DELETED_ATHLETE_ID },
    coachAthletes: [],
  } as unknown as AuthUser;

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    const events = new EventService(
      prisma,
      new CaslAbilityFactory(),
      new EventEmitter2(),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    corrections = new ActivityCorrectionsService(
      prisma,
      new CaslAbilityFactory(),
      queue as never,
      events,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    queue.addActivityProcessingJob.mockReset().mockResolvedValue(undefined);
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
        stream: compressActivityStream(recording()) as object,
        averageHeartrate: 150.2,
        maxHeartrate: 240,
        distance: 1800,
        movingTime: 600,
      },
    });
    await prisma.event.update({
      where: { eventId: EVENT_ID },
      data: {
        startDate: new Date('2026-01-06T07:00:00Z'),
        endDate: new Date('2026-01-06T07:10:00Z'),
      },
    });
    // One lap over the whole run, instead of the fixture's
    await prisma.activitySegment.deleteMany({
      where: { eventActivityId: ACTIVITY_ID },
    });
    await prisma.activitySegment.create({
      data: {
        eventActivityId: ACTIVITY_ID,
        segmentType: 'LAP',
        orderIndex: 0,
        startTimeSeconds: 0,
        endTimeSeconds: 600,
      },
    });
  });

  const read = () =>
    prisma.eventActivity.findUniqueOrThrow({
      where: { eventActivityId: ACTIVITY_ID },
      include: { event: true, segments: true },
    });
  const streamOf = (value: unknown) =>
    uncompressActivityStream(value as CompressedActivityStream);

  it('removes a spike, keeping the recording as it came', async () => {
    const result = await corrections.add(athlete, EVENT_ID, {
      type: 'despike',
      channel: 'heartrate',
    });

    const activity = await read();
    expect(streamOf(activity.stream).heartrate![300]).toBe(150);
    expect(streamOf(activity.originalStream).heartrate![300]).toBe(240);
    expect(activity.maxHeartrate).toBe(150);
    expect(activity.averageHeartrate).toBe(150);
    // Figures the correction doesn't touch stay as recorded
    expect(activity.distance).toBe(1800);
    expect(result).toMatchObject({
      corrections: [{ type: 'despike', channel: 'heartrate' }],
    });
    expect(queue.addActivityProcessingJob).toHaveBeenCalledWith(
      ACTIVITY_ID,
      EVENT_ID,
      true,
    );
  });

  it('crops the recording, moving its start and its laps', async () => {
    await corrections.add(athlete, EVENT_ID, {
      type: 'crop',
      from: 60,
      to: 360,
    });

    const activity = await read();
    expect(activity.event.startDate.toISOString()).toBe(
      '2026-01-06T07:01:00.000Z',
    );
    expect(activity.event.endDate.toISOString()).toBe(
      '2026-01-06T07:06:00.000Z',
    );
    expect(activity.distance).toBe(900);
    expect(activity.movingTime).toBe(300);
    expect(activity.segments).toMatchObject([
      { startTimeSeconds: 0, endTimeSeconds: 300 },
    ]);
  });

  it('undoes one correction or all of them', async () => {
    await corrections.add(athlete, EVENT_ID, {
      type: 'despike',
      channel: 'heartrate',
    });
    await corrections.add(athlete, EVENT_ID, {
      type: 'crop',
      from: 60,
      to: 360,
    });

    await corrections.remove(athlete, EVENT_ID, 1);
    let activity = await read();
    expect(activity.distance).toBe(1800);
    expect(activity.maxHeartrate).toBe(150);
    expect(activity.corrections).toMatchObject([{ type: 'despike' }]);

    await corrections.remove(athlete, EVENT_ID);
    activity = await read();
    expect(activity.maxHeartrate).toBe(240);
    expect(activity.originalStream).toBeNull();
    expect(activity.corrections).toBeNull();
    expect(streamOf(activity.stream).heartrate![300]).toBe(240);
    expect(activity.event.startDate.toISOString()).toBe(
      '2026-01-06T07:00:00.000Z',
    );
    expect(activity.segments).toMatchObject([
      { startTimeSeconds: 0, endTimeSeconds: 600 },
    ]);
  });

  it("applies the corrections again over a provider's new recording", async () => {
    await corrections.add(athlete, EVENT_ID, {
      type: 'despike',
      channel: 'heartrate',
    });

    const next = recording();
    next.heartrate![100] = 239;
    await prisma.eventActivity.update({
      where: { eventActivityId: ACTIVITY_ID },
      data: await streamUpdate(
        prisma,
        ACTIVITY_ID,
        compressActivityStream(next),
      ),
    });

    const activity = await read();
    expect(streamOf(activity.originalStream).heartrate![100]).toBe(239);
    expect(streamOf(activity.stream).heartrate![100]).toBe(150);
  });

  it("refuses another athlete's activity", async () => {
    const stranger = {
      userId: 999_999,
      email: 'other@example.com',
      athlete: { athleteId: 999_999 },
      coachAthletes: [],
    } as unknown as AuthUser;
    await expect(
      corrections.add(stranger, EVENT_ID, { type: 'smoothAltitude' }),
    ).rejects.toThrow('Activity not found');
  });
});
