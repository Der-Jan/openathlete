import { MetricType } from '@openathlete/database';
import {
  EVENT_TYPE,
  SPORT_TYPE,
  UpdateEventDto,
  WORKOUT_DURATION_TYPE,
  WORKOUT_STEP_TYPE,
  WORKOUT_TARGET_TYPE,
} from '@openathlete/shared';

import { EventService } from './event.service';

jest.mock('@garmin/fitsdk', () => ({}));
jest.mock('src/modules/auth/services/casl-prisma', () => ({
  accessibleBy: () => ({ Event: {} }),
}));

describe('EventService.computeAndApplyPlannedTrainingLoad', () => {
  const athleteId = 42;
  const eventId = 101;
  const eventTrainingId = 202;

  function createService({
    event,
    metrics = [
      { type: MetricType.HR_MAX, value: 190 },
      { type: MetricType.HR_REST, value: 50 },
    ],
    cancelEstimation = jest.fn().mockResolvedValue(undefined),
    scheduleEstimation = jest.fn().mockResolvedValue(true),
  }: {
    event: unknown;
    metrics?: Array<{ type: MetricType; value: number }>;
    cancelEstimation?: jest.Mock;
    scheduleEstimation?: jest.Mock;
  }) {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(event),
        findUnique: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          ...(event as Record<string, unknown>),
          ...data,
          startDate:
            data?.startDate ??
            (event as { startDate?: Date })?.startDate ??
            new Date(Date.now() + 86400_000),
          endDate:
            data?.endDate ??
            (event as { endDate?: Date })?.endDate ??
            new Date(Date.now() + 90000_000),
          updatedAt: new Date(),
        })),
      },
      eventTemplate: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      eventTraining: {
        update: jest.fn().mockResolvedValue({}),
      },
      workout: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            (event as { training?: { workout?: unknown } })?.training
              ?.workout ?? null,
          ),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ workoutId: 1 }),
      },
      workoutStep: {
        deleteMany: jest.fn().mockResolvedValue({}),
      },
      athleteMetric: {
        findFirst: jest
          .fn()
          .mockImplementation(
            async ({ where }: { where: { type: MetricType } }) =>
              metrics.find((m) => m.type === where.type) ?? null,
          ),
      },
    };
    const abilities = {
      getFor: jest.fn().mockResolvedValue({
        can: () => true,
      }),
    };
    const eventEmitter = {
      emit: jest.fn(),
    };
    const calendarWebSocketService = {
      notifyTrainingLoadEstimationCompleted: jest.fn(),
    };
    const trainingLoadEstimationService = {
      cancelEstimation,
      scheduleEstimation,
    };

    const service = new EventService(
      prisma as never,
      abilities as never,
      eventEmitter as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      trainingLoadEstimationService as never,
      calendarWebSocketService as never,
    );

    return {
      service,
      prisma,
      calendarWebSocketService,
      trainingLoadEstimationService,
    };
  }

  const baseEvent = {
    eventId,
    athleteId,
    type: 'TRAINING',
    startDate: new Date(Date.now() + 86400_000),
    endDate: new Date(Date.now() + 90000_000),
    athlete: {
      user: { gender: 'MALE' },
      trainingZones: [],
    },
    training: {
      eventTrainingId,
      sport: 'RUNNING',
      goalDuration: 3600,
      goalRpe: 0.6,
      estimatedLoad: null,
      workout: null,
    },
  };

  it('computes and stores deterministic load for duration and RPE without enqueuing AI', async () => {
    const {
      service,
      prisma,
      calendarWebSocketService,
      trainingLoadEstimationService,
    } = createService({ event: baseEvent });

    const result = await service.computeAndApplyPlannedTrainingLoad(
      eventId,
      athleteId,
      eventTrainingId,
      true,
    );

    expect(result).toBeGreaterThan(0);
    expect(prisma.eventTraining.update).toHaveBeenCalledWith({
      where: { eventTrainingId },
      data: { estimatedLoad: result },
    });
    expect(
      calendarWebSocketService.notifyTrainingLoadEstimationCompleted,
    ).toHaveBeenCalledWith(eventId, athleteId, result);
    expect(trainingLoadEstimationService.cancelEstimation).toHaveBeenCalledWith(
      eventId,
    );
    expect(
      trainingLoadEstimationService.scheduleEstimation,
    ).not.toHaveBeenCalled();
  });

  it('computes and stores deterministic load for structured workout with HR targets', async () => {
    const workoutEvent = {
      ...baseEvent,
      training: {
        ...baseEvent.training,
        workout: {
          steps: [
            {
              durationType: 'TIME',
              durationValue: 1800,
              targets: [{ targetType: 'HEARTRATE', targetValue: 140 }],
            },
          ],
        },
      },
    };

    const {
      service,
      prisma,
      calendarWebSocketService,
      trainingLoadEstimationService,
    } = createService({ event: workoutEvent });

    const result = await service.computeAndApplyPlannedTrainingLoad(
      eventId,
      athleteId,
      eventTrainingId,
      true,
    );

    expect(result).toBeGreaterThan(0);
    expect(prisma.eventTraining.update).toHaveBeenCalledWith({
      where: { eventTrainingId },
      data: { estimatedLoad: result },
    });
    expect(
      calendarWebSocketService.notifyTrainingLoadEstimationCompleted,
    ).toHaveBeenCalledWith(eventId, athleteId, result);
    expect(trainingLoadEstimationService.cancelEstimation).toHaveBeenCalledWith(
      eventId,
    );
    expect(
      trainingLoadEstimationService.scheduleEstimation,
    ).not.toHaveBeenCalled();
  });

  it('enqueues AI estimation when structured workout has unreadable targets for future events', async () => {
    const paceWorkoutEvent = {
      ...baseEvent,
      training: {
        ...baseEvent.training,
        workout: {
          steps: [
            {
              durationType: 'DISTANCE',
              durationValue: 1000,
              targets: [{ targetType: 'PACE', targetValue: 300 }],
            },
          ],
        },
      },
    };

    const {
      service,
      prisma,
      calendarWebSocketService,
      trainingLoadEstimationService,
    } = createService({ event: paceWorkoutEvent });

    const result = await service.computeAndApplyPlannedTrainingLoad(
      eventId,
      athleteId,
      eventTrainingId,
      true, // isFuture
    );

    expect(result).toBeNull();
    expect(
      trainingLoadEstimationService.scheduleEstimation,
    ).toHaveBeenCalledWith(eventId, eventTrainingId, athleteId);
    expect(prisma.eventTraining.update).not.toHaveBeenCalled();
    expect(
      calendarWebSocketService.notifyTrainingLoadEstimationCompleted,
    ).not.toHaveBeenCalled();
  });

  it('falls back to duration and RPE when AI is not available for athlete on unreadable structured workout', async () => {
    const paceWorkoutEvent = {
      ...baseEvent,
      training: {
        ...baseEvent.training,
        workout: {
          steps: [
            {
              durationType: 'DISTANCE',
              durationValue: 1000,
              targets: [{ targetType: 'PACE', targetValue: 300 }],
            },
          ],
        },
      },
    };

    const {
      service,
      prisma,
      calendarWebSocketService,
      trainingLoadEstimationService,
    } = createService({
      event: paceWorkoutEvent,
      scheduleEstimation: jest.fn().mockResolvedValue(false),
    });

    const result = await service.computeAndApplyPlannedTrainingLoad(
      eventId,
      athleteId,
      eventTrainingId,
      true,
    );

    expect(result).toBeGreaterThan(0);
    expect(
      trainingLoadEstimationService.scheduleEstimation,
    ).toHaveBeenCalledWith(eventId, eventTrainingId, athleteId);
    expect(prisma.eventTraining.update).toHaveBeenCalledWith({
      where: { eventTrainingId },
      data: { estimatedLoad: result },
    });
    expect(
      calendarWebSocketService.notifyTrainingLoadEstimationCompleted,
    ).toHaveBeenCalledWith(eventId, athleteId, result);
  });

  it('clears previous estimate when unestimable and session is in the past', async () => {
    const pastUnestimableEvent = {
      ...baseEvent,
      training: {
        ...baseEvent.training,
        goalDuration: null,
        goalRpe: null,
        estimatedLoad: 85,
        workout: {
          steps: [
            {
              durationType: 'DISTANCE',
              durationValue: 1000,
              targets: [{ targetType: 'PACE', targetValue: 300 }],
            },
          ],
        },
      },
    };

    const {
      service,
      prisma,
      calendarWebSocketService,
      trainingLoadEstimationService,
    } = createService({ event: pastUnestimableEvent });

    const result = await service.computeAndApplyPlannedTrainingLoad(
      eventId,
      athleteId,
      eventTrainingId,
      false, // not future
    );

    expect(result).toBeNull();
    expect(prisma.eventTraining.update).toHaveBeenCalledWith({
      where: { eventTrainingId },
      data: { estimatedLoad: null },
    });
    expect(
      calendarWebSocketService.notifyTrainingLoadEstimationCompleted,
    ).toHaveBeenCalledWith(eventId, athleteId, null);
    expect(
      trainingLoadEstimationService.scheduleEstimation,
    ).not.toHaveBeenCalled();
  });

  it('rename keeps the AI estimate and schedules nothing', async () => {
    const aiEstimatedPaceEvent = {
      ...baseEvent,
      name: '6 x 800m',
      training: {
        ...baseEvent.training,
        estimatedLoad: 73,
        workout: {
          workoutId: 10,
          steps: [
            {
              stepType: WORKOUT_STEP_TYPE.STEADY,
              durationType: WORKOUT_DURATION_TYPE.DISTANCE,
              durationValue: 800,
              targets: [
                {
                  targetType: WORKOUT_TARGET_TYPE.PACE,
                  targetValue: 3.5,
                  targetMin: null,
                  targetMax: null,
                  metricType: null,
                },
              ],
              repeatBlock: null,
            },
          ],
        },
      },
    };

    const { service, prisma, trainingLoadEstimationService } = createService({
      event: aiEstimatedPaceEvent,
    });
    jest
      .spyOn(service, 'getEventById')
      .mockResolvedValue(aiEstimatedPaceEvent as never);

    // 1. Rename only
    await service.updateEvent({ userId: 1 } as never, eventId, {
      type: EVENT_TYPE.TRAINING,
      name: 'Track intervals 6 x 800m',
    });

    // 2. Rename via full dialog submission (with identical goals & workout steps)
    await service.updateEvent({ userId: 1 } as never, eventId, {
      type: EVENT_TYPE.TRAINING,
      name: 'Track intervals renamed again',
      description: 'Updated description',
      sport: SPORT_TYPE.RUNNING,
      goalDuration: 3600,
      goalRpe: 0.6,
      workout: {
        steps: [
          {
            stepType: WORKOUT_STEP_TYPE.STEADY,
            durationType: WORKOUT_DURATION_TYPE.DISTANCE,
            durationValue: 800,
            targets: [
              {
                targetType: WORKOUT_TARGET_TYPE.PACE,
                targetValue: 3.5,
              },
            ],
          },
        ],
      },
    });

    // 3. Move to another day
    await service.updateEvent({ userId: 1 } as never, eventId, {
      startDate: new Date(Date.now() + 2 * 86400_000),
      endDate: new Date(Date.now() + 2 * 86400_000 + 3600_000),
    } as UpdateEventDto);

    expect(
      trainingLoadEstimationService.scheduleEstimation,
    ).not.toHaveBeenCalled();
    expect(prisma.eventTraining.update).not.toHaveBeenCalled();
  });

  it('recomputes or schedules AI when a load input changes on updateEvent', async () => {
    const aiEstimatedPaceEvent = {
      ...baseEvent,
      name: '6 x 800m',
      training: {
        ...baseEvent.training,
        estimatedLoad: 73,
        workout: {
          workoutId: 10,
          steps: [
            {
              stepType: WORKOUT_STEP_TYPE.STEADY,
              durationType: WORKOUT_DURATION_TYPE.DISTANCE,
              durationValue: 800,
              targets: [
                {
                  targetType: WORKOUT_TARGET_TYPE.PACE,
                  targetValue: 3.5,
                },
              ],
              repeatBlock: null,
            },
          ],
        },
      },
    };

    const { service, trainingLoadEstimationService } = createService({
      event: aiEstimatedPaceEvent,
    });
    jest
      .spyOn(service, 'getEventById')
      .mockResolvedValue(aiEstimatedPaceEvent as never);

    await service.updateEvent({ userId: 1 } as never, eventId, {
      type: EVENT_TYPE.TRAINING,
      workout: {
        steps: [
          {
            stepType: WORKOUT_STEP_TYPE.STEADY,
            durationType: WORKOUT_DURATION_TYPE.DISTANCE,
            durationValue: 1000, // changed from 800 to 1000
            targets: [
              {
                targetType: WORKOUT_TARGET_TYPE.PACE,
                targetValue: 3.5,
              },
            ],
          },
        ],
      },
    });

    expect(
      trainingLoadEstimationService.scheduleEstimation,
    ).toHaveBeenCalledWith(eventId, eventTrainingId, athleteId);
  });
});
