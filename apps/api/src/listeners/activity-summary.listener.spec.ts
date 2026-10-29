import { AiTask } from '@openathlete/shared';

import { ActivityImportedEvent } from 'src/events';

import { ActivitySummaryListener } from './activity-summary.listener';

// An ESM package Jest cannot load, pulled in through the AI module
jest.mock('src/modules/ai', () => ({
  AiModelResolverService: class {},
  AiService: class {},
}));

const summary = {
  headline: 'Steady tempo, slowed by the heat',
  points: ['54 s lost to 27 °C'],
  suggestion: null,
};

function setup(activity: Record<string, unknown> | null, model: unknown = {}) {
  const prisma = {
    eventActivity: {
      findUnique: jest.fn().mockResolvedValue(activity),
      aggregate: jest.fn().mockResolvedValue({
        _count: 3,
        _avg: { averageSpeed: 3.5, averageHeartrate: 150 },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    athleteMetric: { findMany: jest.fn().mockResolvedValue([]) },
    trainingZone: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const resolver = { tryResolveForAthlete: jest.fn().mockResolvedValue(model) };
  const ai = { generateObject: jest.fn().mockResolvedValue(summary) };
  const sockets = { notifyActivityProcessed: jest.fn() };
  const listener = new ActivitySummaryListener(
    prisma as never,
    resolver as never,
    ai as never,
    sockets as never,
  );
  return { listener, prisma, resolver, ai, sockets };
}

const run = {
  eventActivityId: 5,
  eventId: 50,
  sport: 'RUNNING',
  distance: 10000,
  movingTime: 3000,
  elevationGain: 40,
  averageSpeed: 3.33,
  averageGapSpeed: null,
  averageHeartrate: 150,
  maxHeartrate: 170,
  averageWatts: null,
  weightedAverageWatts: null,
  rpe: null,
  stream: null,
  aiSummaryAt: null,
  normalization: null,
  weather: null,
  feedbackQuestions: [],
  relatedTraining: null,
  relatedCompetition: null,
  event: {
    athleteId: 9,
    name: 'Morning run',
    startDate: new Date('2026-10-20T07:00:00Z'),
    endDate: new Date('2026-10-20T08:00:00Z'),
    athlete: { user: { language: 'EN' } },
  },
};

const imported = (bulkImport = false) =>
  new ActivityImportedEvent({ eventActivityId: 5, eventId: 50, bulkImport });

describe('ActivitySummaryListener', () => {
  it('writes the summary on the activity and tells the open views', async () => {
    const { listener, prisma, resolver, ai, sockets } = setup(run);
    await listener.handleActivityImport(imported());

    expect(resolver.tryResolveForAthlete).toHaveBeenCalledWith(
      AiTask.ACTIVITY_SUMMARY,
      9,
    );
    const prompt = ai.generateObject.mock.calls[0][2] as string;
    expect(prompt).toContain('Write in English');
    expect(prompt).toContain('3 activities in the 42 days before');
    expect(prisma.eventActivity.update).toHaveBeenCalledWith({
      where: { eventActivityId: 5 },
      data: { aiSummary: summary, aiSummaryAt: expect.any(Date) },
    });
    expect(sockets.notifyActivityProcessed).toHaveBeenCalledWith(50, 9);
  });

  it('leaves history imports alone', async () => {
    const { listener, prisma } = setup(run);
    await listener.handleActivityImport(imported(true));
    expect(prisma.eventActivity.findUnique).not.toHaveBeenCalled();
  });

  it('writes one summary per activity', async () => {
    const { listener, ai } = setup({ ...run, aiSummaryAt: new Date() });
    await listener.handleActivityImport(imported());
    expect(ai.generateObject).not.toHaveBeenCalled();
  });

  it('does nothing without AI for the athlete or a coach', async () => {
    const { listener, ai, prisma } = setup(run, null);
    await listener.handleActivityImport(imported());
    expect(ai.generateObject).not.toHaveBeenCalled();
    expect(prisma.eventActivity.update).not.toHaveBeenCalled();
  });

  it('logs a failure instead of throwing', async () => {
    const { listener, ai, prisma } = setup(run);
    ai.generateObject.mockRejectedValue(new Error('down'));
    await expect(
      listener.handleActivityImport(imported()),
    ).resolves.toBeUndefined();
    expect(prisma.eventActivity.update).not.toHaveBeenCalled();
  });
});
