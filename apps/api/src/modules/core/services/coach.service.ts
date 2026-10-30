import { Injectable, Logger } from '@nestjs/common';

import { EventType, TrainingLoadCalculationType } from '@openathlete/database';
import {
  CoachAlertDto,
  CoachDashboardAthleteRowDto,
  CoachDashboardResponseDto,
  coachDashboardResponseSchema,
} from '@openathlete/shared';

import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { TrainingLoadService } from './training-load.service';

/** No activity for this long makes an athlete inactive */
const INACTIVE_AFTER_DAYS = 7;
/** Pain reported this recently, and not resolved, is still worth a look */
const PAIN_WITHIN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CoachService {
  private readonly logger = new Logger(CoachService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trainingLoad: TrainingLoadService,
  ) {}

  /** Fitness, fatigue and form today; null when the athlete has no load. */
  private async form(user: AuthUser, athleteId: number, now: Date) {
    try {
      const metrics = await this.trainingLoad.getTrainingLoadMetrics(
        user,
        TrainingLoadCalculationType.TRIMP,
        now,
        athleteId,
      );
      if (metrics.ctl === 0 && metrics.atl === 0) return null;
      return {
        ctl: metrics.ctl,
        atl: metrics.atl,
        tsb: metrics.tsb,
      };
    } catch (error) {
      // One athlete's load must not take the whole dashboard down
      this.logger.warn(
        `Form of athlete ${athleteId} unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private defaultPeriod(): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 28); // last 4 weeks
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  async getCoachDashboard(
    user: AuthUser,
    period?: { start?: Date; end?: Date },
  ): Promise<CoachDashboardResponseDto> {
    // Resolve period
    const { start, end } = (() => {
      if (period?.start && period?.end)
        return { start: period.start, end: period.end };
      return this.defaultPeriod();
    })();

    // Get coached athletes for this user
    const coachedAthletes = await this.prisma.athlete.findMany({
      where: { coachAthletes: { some: { userId: user.userId } } },
      include: {
        user: {
          select: {
            userId: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const athleteIds = coachedAthletes.map((a) => a.athleteId);
    if (athleteIds.length === 0) {
      return coachDashboardResponseSchema.parse({
        period: { start: start.toISOString(), end: end.toISOString() },
        athletes: [],
      });
    }

    // Planned training sessions within period
    const plannedByAthlete = await this.prisma.event.groupBy({
      by: ['athleteId'],
      where: {
        athleteId: { in: athleteIds },
        type: EventType.TRAINING,
        startDate: { gte: start, lte: end },
      },
      _count: { _all: true },
    });

    // Planned time: sum of workout estimated_duration when available
    const plannedTimeByAthleteRaw = await this.prisma.event.findMany({
      where: {
        athleteId: { in: athleteIds },
        type: EventType.TRAINING,
        startDate: { gte: start, lte: end },
      },
      select: {
        athleteId: true,
        training: {
          select: {
            goalDuration: true,
          },
        },
      },
    });

    const plannedTimeByAthlete = plannedTimeByAthleteRaw.reduce(
      (acc, e) => {
        const aid = e.athleteId as number;
        const duration = e.training?.goalDuration ?? 0;
        acc[aid] = (acc[aid] || 0) + duration;
        return acc;
      },
      {} as Record<number, number>,
    );

    // Completed activity events within period with activity details
    const activities = await this.prisma.event.findMany({
      where: {
        athleteId: { in: athleteIds },
        type: EventType.ACTIVITY,
        startDate: { gte: start, lte: end },
      },
      select: {
        athleteId: true,
        startDate: true,
        endDate: true,
        activity: { select: { distance: true } },
      },
    });

    const completedByAthlete: Record<
      number,
      { count: number; time: number; distance: number }
    > = {};
    for (const ev of activities) {
      const aid = ev.athleteId as number;
      const startTs = new Date(ev.startDate).getTime();
      const endTs = new Date(ev.endDate).getTime();
      const time = Math.max(0, Math.floor((endTs - startTs) / 1000));
      const distance = ev.activity?.distance ?? 0;
      if (!completedByAthlete[aid]) {
        completedByAthlete[aid] = {
          count: 0,
          time: 0,
          distance: 0,
        };
      }
      completedByAthlete[aid].count += 1;
      completedByAthlete[aid].time += time;
      completedByAthlete[aid].distance += distance;
    }

    const now = new Date();
    const athleteUserIds = coachedAthletes.map((a) => a.userId);
    const [lastActivities, injuries, unread, forms] = await Promise.all([
      // The latest activity ever: an inactive athlete has none in the period
      this.prisma.event.groupBy({
        by: ['athleteId'],
        where: {
          athleteId: { in: athleteIds },
          type: EventType.ACTIVITY,
          startDate: { lte: now },
        },
        _max: { endDate: true },
      }),
      this.prisma.athleteInjury.findMany({
        where: {
          athleteId: { in: athleteIds },
          status: { not: 'RESOLVED' },
          updatedAt: {
            gte: new Date(now.getTime() - PAIN_WITHIN_DAYS * DAY_MS),
          },
        },
        orderBy: { painScore: 'desc' },
        select: { athleteId: true, location: true, painScore: true },
      }),
      // Messages from each athlete, in conversations the coach is part of
      this.prisma.message.groupBy({
        by: ['senderId'],
        where: {
          senderId: { in: athleteUserIds },
          thread: { participants: { some: { userId: user.userId } } },
          readReceipts: { none: { userId: user.userId } },
        },
        _count: { _all: true },
      }),
      Promise.all(athleteIds.map((id) => this.form(user, id, now))),
    ]);

    // Build rows
    const rows: CoachDashboardAthleteRowDto[] = coachedAthletes.map(
      (a, index) => {
        const lastActivity =
          lastActivities.find((l) => l.athleteId === a.athleteId)?._max
            .endDate ?? null;
        const form = forms[index];
        const alerts: CoachAlertDto[] = [];
        const pain = injuries.find((i) => i.athleteId === a.athleteId);
        if (pain) {
          alerts.push({
            type: 'pain',
            location: pain.location,
            painScore: pain.painScore,
          });
        }
        const idleDays = lastActivity
          ? Math.floor((now.getTime() - lastActivity.getTime()) / DAY_MS)
          : null;
        if (idleDays === null || idleDays >= INACTIVE_AFTER_DAYS) {
          alerts.push({ type: 'inactive', days: idleDays });
        }
        const plannedCount =
          plannedByAthlete.find((p) => p.athleteId === a.athleteId)?._count
            ._all || 0;
        const plannedTime = plannedTimeByAthlete[a.athleteId] || 0;
        const completed = completedByAthlete[a.athleteId] || {
          count: 0,
          time: 0,
          distance: 0,
        };
        const compliance =
          plannedCount > 0
            ? Math.round((completed.count / plannedCount) * 100)
            : 0;
        return {
          athleteId: a.athleteId,
          firstName: a.user?.firstName ?? null,
          lastName: a.user?.lastName ?? null,
          email: a.user?.email ?? null,
          start: start.toISOString(),
          end: end.toISOString(),
          plannedSessions: plannedCount,
          completedSessions: completed.count,
          plannedTime: plannedTime,
          completedTime: completed.time,
          completedDistance: completed.distance,
          lastActivityAt: lastActivity?.toISOString() ?? null,
          compliancePercent: compliance,
          form,
          alerts,
          unreadMessages:
            unread.find((u) => u.senderId === a.userId)?._count._all ?? 0,
        };
      },
    );

    // Athletes who need attention first
    rows.sort(
      (a, b) =>
        b.alerts.length - a.alerts.length ||
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        ),
    );

    return coachDashboardResponseSchema.parse({
      period: { start: start.toISOString(), end: end.toISOString() },
      athletes: rows,
    });
  }
}
