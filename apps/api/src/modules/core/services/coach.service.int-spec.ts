import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import {
  COACH_ATHLETE_ID,
  COACH_USER_ID,
  DELETED_ATHLETE_ID,
  DELETED_USER_ID,
  accountFixtureSql,
} from 'src/modules/auth/services/account-deletion.fixture';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { CoachService } from './coach.service';
import { TrainingLoadService } from './training-load.service';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'INTEGRATION_DATABASE_URL must point to a disposable test database',
  );

const DAY_MS = 24 * 60 * 60 * 1000;

describe('coach dashboard (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: CoachService;
  // The fixture's coach, who coaches athlete 2001 (user 1001)
  const coach = {
    userId: COACH_USER_ID,
    email: 'coach@example.com',
    athlete: { athleteId: COACH_ATHLETE_ID },
    coachAthletes: [{ userId: COACH_USER_ID, athleteId: DELETED_ATHLETE_ID }],
  } as unknown as AuthUser;

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    const abilities = new CaslAbilityFactory();
    service = new CoachService(
      prisma,
      new TrainingLoadService(prisma, abilities),
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
  });

  const row = async () => {
    const { athletes } = await service.getCoachDashboard(coach);
    return athletes.find((a) => a.athleteId === DELETED_ATHLETE_ID)!;
  };

  it('flags pain, inactivity and unread messages', async () => {
    // The fixture's run is from January; its knee pain is not resolved
    await prisma.message.create({
      data: {
        messageThreadId: 3802,
        senderId: DELETED_USER_ID,
        content: 'My knee hurts again',
      },
    });

    const athlete = await row();
    expect(athlete.alerts.map((alert) => alert.type)).toEqual([
      'pain',
      'inactive',
    ]);
    expect(athlete.alerts[0]).toMatchObject({ location: 'knee' });
    // The fixture's earlier athlete message is read, this one is not
    expect(athlete.unreadMessages).toBe(1);
    // The last activity ever, outside the default four weeks
    expect(athlete.lastActivityAt?.slice(0, 10)).toBe('2026-01-06');
  });

  it('reads the form of an athlete whose load rises', async () => {
    await prisma.athleteInjury.updateMany({ data: { status: 'RESOLVED' } });
    const now = Date.now();
    // Four quiet weeks, then three hard days this week
    const sessions = [
      ...[34, 31, 27, 24, 20, 17, 13, 10].map((daysAgo) => ({
        daysAgo,
        load: 120,
      })),
      ...[5, 3, 1].map((daysAgo) => ({ daysAgo, load: 450 })),
    ];
    for (const [index, { daysAgo, load }] of sessions.entries()) {
      const start = new Date(now - daysAgo * DAY_MS);
      const event = await prisma.event.create({
        data: {
          name: `Run ${index}`,
          type: 'ACTIVITY',
          startDate: start,
          endDate: new Date(start.getTime() + 3600_000),
          athleteId: DELETED_ATHLETE_ID,
          activity: {
            create: {
              sport: 'RUNNING',
              distance: 10000,
              elevationGain: 0,
              movingTime: 3600,
              averageSpeed: 2.8,
              maxSpeed: 4,
              externalId: `load-${index}`,
            },
          },
        },
        include: { activity: true },
      });
      await prisma.trainingLoadEntry.create({
        data: {
          date: start,
          value: load,
          calculationId: 3701,
          activityId: event.activity!.eventActivityId,
        },
      });
    }

    const athlete = await row();
    expect(athlete.form).not.toBeNull();
    expect(athlete.form!.atl).toBeGreaterThan(athlete.form!.ctl);
    expect(athlete.alerts).toEqual([]);
  });

  it('lists nothing to watch for an athlete who trains steadily', async () => {
    await prisma.athleteInjury.updateMany({ data: { status: 'RESOLVED' } });
    await prisma.event.update({
      where: { eventId: 3002 },
      data: { endDate: new Date(), startDate: new Date(Date.now() - 3600_000) },
    });
    expect((await row()).alerts).toEqual([]);
  });
});
