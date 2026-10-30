import { NotFoundException } from '@nestjs/common';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { TrainingLoadService } from './training-load.service';

const athlete: AuthUser = {
  userId: 2,
  email: 'athlete@example.test',
  athlete: { athleteId: 12 },
  coachAthletes: [],
};
const coach: AuthUser = {
  userId: 1,
  email: 'coach@example.test',
  athlete: null,
  coachAthletes: [{ athleteId: 12 }],
};
const stranger: AuthUser = {
  userId: 3,
  email: 'stranger@example.test',
  athlete: { athleteId: 99 },
  coachAthletes: [{ athleteId: 13 }],
};

function setup() {
  const activity = {
    eventId: 50,
    athleteId: 12,
    type: 'ACTIVITY',
    activity: { eventActivityId: 101 },
  };
  const entries = [{ value: 48.6, calculation: { type: 'TRIMP' } }];
  // Stand-in for the database: the stored activity matches when the query
  // names it and, if the query restricts athletes, allows its athlete.
  const findFirst = jest.fn(async ({ where }: { where: unknown }) => {
    const query = JSON.stringify(where);
    const athletes = [...query.matchAll(/"athleteId":(\d+)/g)].map(([, id]) =>
      Number(id),
    );
    return query.includes('"eventId":50') &&
      (!athletes.length || athletes.includes(activity.athleteId))
      ? activity
      : null;
  });
  const prisma = {
    event: { findFirst },
    trainingLoadEntry: { findMany: jest.fn().mockResolvedValue(entries) },
  };
  const service = new TrainingLoadService(
    prisma as unknown as PrismaService,
    new CaslAbilityFactory(),
  );
  return { prisma, service, entries };
}

describe('TrainingLoadService.getActivityTrainingLoads', () => {
  it.each([
    ['the athlete', athlete],
    ['a linked coach', coach],
  ])('returns the saved loads to %s', async (_who, user) => {
    const { prisma, service, entries } = setup();
    await expect(service.getActivityTrainingLoads(user, 50)).resolves.toBe(
      entries,
    );
    expect(prisma.trainingLoadEntry.findMany).toHaveBeenCalledWith({
      where: { activityId: 101 },
      include: { calculation: true },
    });
  });

  it('hides activities of athletes the user is not linked to', async () => {
    const { prisma, service } = setup();
    await expect(
      service.getActivityTrainingLoads(stranger, 50),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.trainingLoadEntry.findMany).not.toHaveBeenCalled();
  });
});

/**
 * Stand-in database for the weekly summary: TRIMP entries keyed by day, the
 * planned events of the range and the athlete's heart rate profile.
 */
function weeklySummaryService({
  loads = {},
  plannedEvents = [],
  heartRate = { HR_MAX: 190, HR_REST: 50 },
  firstActivity = Object.keys(loads).sort()[0],
}: {
  loads?: Record<string, number>;
  plannedEvents?: unknown[];
  heartRate?: Record<string, number>;
  /** Day of the athlete's first activity; by default their first load */
  firstActivity?: string;
}) {
  const prisma = {
    athlete: {
      findFirst: jest.fn().mockResolvedValue({ athleteId: 12 }),
      findUnique: jest.fn().mockResolvedValue({ user: { gender: 'MALE' } }),
    },
    athleteMetric: {
      findFirst: jest.fn(async ({ where }: { where: { type: string } }) =>
        where.type in heartRate ? { value: heartRate[where.type] } : null,
      ),
    },
    trainingLoadEntry: {
      findMany: jest.fn().mockResolvedValue(
        Object.entries(loads).map(([day, value]) => ({
          date: new Date(`${day}T00:00:00Z`),
          value,
        })),
      ),
    },
    event: {
      findMany: jest.fn().mockResolvedValue(plannedEvents),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          firstActivity
            ? { startDate: new Date(`${firstActivity}T08:00:00Z`) }
            : null,
        ),
    },
  };
  const service = new TrainingLoadService(
    prisma as unknown as PrismaService,
    {
      getFor: jest.fn().mockResolvedValue({ can: () => true }),
    } as unknown as CaslAbilityFactory,
  );
  return { prisma, service };
}

describe('TrainingLoadService fitness', () => {
  // Three months of steady load, then the same days read through each method
  const loads = Object.fromEntries(
    Array.from({ length: 90 }, (_, index) => {
      const day = new Date(Date.UTC(2026, 3, 1 + index));
      return [day.toISOString().slice(0, 10), 60];
    }),
  );
  const day = new Date('2026-06-28T00:00:00Z');

  async function dailyCtl(from: string) {
    const { service } = weeklySummaryService({ loads });
    const days = await service.getDailyForm(
      athlete,
      new Date(from),
      day,
      12,
      false,
    );
    return days.at(-1)!.ctl;
  }

  it('gives a date the same fitness whatever the period read', async () => {
    expect(await dailyCtl('2026-06-22T00:00:00Z')).toBe(
      await dailyCtl('2026-04-06T00:00:00Z'),
    );
  });

  it('agrees between the day by day form and the weekly summary', async () => {
    const { service } = weeklySummaryService({ loads });
    const weeks = await service.getWeeklyTrimpSummary(
      athlete,
      new Date('2026-06-22T00:00:00Z'),
      day,
      12,
    );
    const week = weeks.find(
      ({ weekStart }) => weekStart.toISOString().slice(0, 10) === '2026-06-22',
    );
    expect(week?.ctl).toBe(await dailyCtl('2026-06-22T00:00:00Z'));
  });
});

describe('TrainingLoadService weekly planned load', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-10-14T10:00:00Z') });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const session = (
    day: string,
    fields: {
      goalDuration?: number | null;
      goalRpe?: number | null;
      estimatedLoad?: number | null;
      relatedActivityId?: number | null;
    },
    type: 'training' | 'competition' = 'training',
  ) => {
    const goals = {
      goalDuration: fields.goalDuration ?? null,
      goalRpe: fields.goalRpe ?? null,
      relatedActivityId: fields.relatedActivityId ?? null,
    };
    return {
      startDate: new Date(`${day}T07:00:00Z`),
      training:
        type === 'training'
          ? { ...goals, estimatedLoad: fields.estimatedLoad ?? null }
          : null,
      competition: type === 'competition' ? goals : null,
    };
  };

  async function week(
    plannedEvents: unknown[],
    heartRate?: Record<string, number>,
  ) {
    const { service, prisma } = weeklySummaryService({
      plannedEvents,
      heartRate,
    });
    const summaries = await service.getWeeklyTrimpSummary(
      athlete,
      new Date('2026-10-19T00:00:00Z'),
      new Date('2026-10-19T00:00:00Z'),
    );
    return { summary: summaries[0], prisma };
  }

  it('estimates sessions and races without any AI estimate', async () => {
    const { summary, prisma } = await week([
      session('2026-10-20', { goalDuration: 3600, goalRpe: 0.5 }),
      session(
        '2026-10-25',
        { goalDuration: 5400, goalRpe: 0.9 },
        'competition',
      ),
    ]);

    // RPE 5/10 for an hour: about 73 TRIMP; the race adds far more
    expect(summary.estimatedLoad).toBeGreaterThan(73 + 150);
    expect(summary.plannedLoad).toBe(summary.estimatedLoad);
    expect(summary.totalLoad).toBe(summary.estimatedLoad);
    // Trainings and races of the range, in one query
    expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.event.findMany.mock.calls[0][0].where).toMatchObject({
      athleteId: 12,
      type: { in: ['TRAINING', 'COMPETITION'] },
    });
  });

  it('prefers the AI estimate, and leaves done sessions to the actual load', async () => {
    const { summary } = await week([
      session('2026-10-20', { goalDuration: 3600, estimatedLoad: 120 }),
      session('2026-10-21', {
        goalDuration: 3600,
        estimatedLoad: 80,
        relatedActivityId: 7,
      }),
    ]);
    expect(summary.estimatedLoad).toBe(120);
    expect(summary.plannedLoad).toBe(200);
  });

  it('projects the form at the end of the week', async () => {
    const { summary } = await week([
      session('2026-10-20', { goalDuration: 7200, goalRpe: 0.7 }),
    ]);
    expect(summary.formProjected).toBe(true);
    expect(summary.ctl).toBeGreaterThan(0);
    // A hard session on a blank history: fatigue outweighs fitness
    expect(summary.tsb).toBeLessThan(0);
  });

  it('cannot estimate without a heart rate profile, as for activities', async () => {
    const { summary } = await week(
      [session('2026-10-20', { goalDuration: 3600, goalRpe: 0.5 })],
      {},
    );
    expect(summary.estimatedLoad).toBe(0);
  });
});
