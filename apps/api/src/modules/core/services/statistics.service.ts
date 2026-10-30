import { subject } from '@casl/ability';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Athlete, Prisma } from '@openathlete/database';
import {
  GetStatisticsOverviewQueryDto,
  GetStatisticsSectionQueryDto,
  GetStatisticsTrendsQueryDto,
  SPORT_TYPE,
  StatisticsDaysDto,
  StatisticsFiltersDto,
  StatisticsLoadDto,
  StatisticsOverviewDto,
  StatisticsTotalsDto,
  StatisticsTrendsDto,
  StatisticsVolumeDto,
  statisticsGranularity,
} from '@openathlete/shared';

import { validTimeZone, zonedClock } from 'src/common/utils/time-zone';
import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { statisticsBuckets } from '../helpers/statistics-buckets';
import { getUtcWeekStart, toUtcDateKey } from '../helpers/training-load';
import { TrainingLoadService } from './training-load.service';

/** Above this, the load chart shows weeks: days are too many to draw */
const LOAD_DAILY_MAX_DAYS = 400;

const EMPTY_TOTALS: StatisticsTotalsDto = {
  movingTime: 0,
  distance: 0,
  elevationGain: 0,
  count: 0,
  load: 0,
};

/**
 * The statistics page reads each of its sections on its own. Every query
 * names its columns: an activity row also holds its recording, megabytes that
 * a sum has no use for.
 */
@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: CaslAbilityFactory,
    private readonly trainingLoad: TrainingLoadService,
  ) {}

  /**
   * Checks the user may read this athlete. Asking CASL about 'Athlete' in
   * general would let anyone read any athlete's statistics by id.
   */
  private async assertCanRead(user: AuthUser, athleteId: number) {
    const athlete = await this.prisma.athlete.findUnique({
      where: { athleteId },
    });
    if (!athlete) throw new NotFoundException('Athlete not found');
    const ability = await this.abilities.getFor({ user });
    if (!ability.can('read', subject('Athlete', athlete))) {
      throw new ForbiddenException('Not allowed to access this athlete');
    }
  }

  /** The athlete's time zone, once the user is allowed to read them. */
  private async readableTimeZone(user: AuthUser, athleteId: number) {
    const athlete = await this.prisma.athlete.findUnique({
      where: { athleteId },
      include: { user: { select: { timeZone: true } } },
    });
    if (!athlete) throw new NotFoundException('Athlete not found');
    const ability = await this.abilities.getFor({ user });
    if (!ability.can('read', subject('Athlete', athlete))) {
      throw new ForbiddenException('Not allowed to access this athlete');
    }
    return validTimeZone(athlete.user.timeZone);
  }

  /** The activities of a period, as the end of a query on `event e` */
  private activitiesOf(
    athleteId: number,
    from: Date,
    to: Date,
    sport?: SPORT_TYPE,
  ) {
    return Prisma.sql`
      FROM event e
      JOIN event_activity a ON a.event_id = e.event_id
      WHERE e.athlete_id = ${athleteId}
        AND e.type = 'ACTIVITY'
        AND e.start_date >= ${from}
        AND e.start_date <= ${to}
        ${sport ? Prisma.sql`AND a.sport = ${sport}::sport_type` : Prisma.empty}`;
  }

  /** First day of an activity's bucket, on the athlete's calendar */
  private bucketOf(granularity: string, timeZone: string) {
    return Prisma.sql`date_trunc(${granularity}, e.start_date AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone})::date::text`;
  }

  /** Sports and first activity of the athlete, to offer as filters. */
  async getFilters(
    user: AuthUser,
    athleteId: Athlete['athleteId'],
  ): Promise<StatisticsFiltersDto> {
    await this.assertCanRead(user, athleteId);
    const rows = await this.prisma.$queryRaw<
      { sport: SPORT_TYPE; first_activity: Date }[]
    >`
      SELECT a.sport, min(e.start_date) AS first_activity
      FROM event e
      JOIN event_activity a ON a.event_id = e.event_id
      WHERE e.athlete_id = ${athleteId} AND e.type = 'ACTIVITY'
      GROUP BY a.sport
      ORDER BY sum(a.moving_time) DESC`;
    return {
      firstActivityDate: rows.length
        ? new Date(Math.min(...rows.map((row) => row.first_activity.getTime())))
        : null,
      sports: rows.map((row) => row.sport),
    };
  }

  private async totalsBySport(
    athleteId: number,
    from: Date,
    to: Date,
    sport?: SPORT_TYPE,
  ) {
    return this.prisma.$queryRaw<
      (StatisticsTotalsDto & { sport: SPORT_TYPE })[]
    >`
      SELECT a.sport,
        coalesce(sum(a.moving_time), 0)::float8 AS "movingTime",
        coalesce(sum(a.distance), 0)::float8 AS distance,
        coalesce(sum(a.elevation_gain), 0)::float8 AS "elevationGain",
        count(*)::int AS count,
        coalesce(sum((
          SELECT t.value
          FROM training_load_entry t
          JOIN training_load_calculation c
            ON c.training_load_calculation_id = t.calculation_id
          WHERE t.activity_id = a.event_activity_id AND c.type = 'TRIMP'
        )), 0)::float8 AS load
      ${this.activitiesOf(athleteId, from, to, sport)}
      GROUP BY a.sport
      ORDER BY "movingTime" DESC`;
  }

  private sumTotals(rows: StatisticsTotalsDto[]): StatisticsTotalsDto {
    return rows.reduce(
      (sum, row) => ({
        movingTime: sum.movingTime + row.movingTime,
        distance: sum.distance + row.distance,
        elevationGain: sum.elevationGain + row.elevationGain,
        count: sum.count + row.count,
        load: sum.load + row.load,
      }),
      EMPTY_TOTALS,
    );
  }

  async getOverview(
    user: AuthUser,
    query: GetStatisticsOverviewQueryDto,
  ): Promise<StatisticsOverviewDto> {
    const { athleteId, from, to, sport, compareFrom, compareTo } = query;
    await this.assertCanRead(user, athleteId);
    const [sports, compared] = await Promise.all([
      this.totalsBySport(athleteId, from, to, sport),
      compareFrom && compareTo
        ? this.totalsBySport(athleteId, compareFrom, compareTo, sport)
        : null,
    ]);
    return {
      totals: this.sumTotals(sports),
      compared: compared && this.sumTotals(compared),
      sports,
    };
  }

  /** Volume by sport, for every bucket of the period. */
  async getVolume(
    user: AuthUser,
    { athleteId, from, to, sport }: GetStatisticsSectionQueryDto,
    now = new Date(),
  ): Promise<StatisticsVolumeDto> {
    const timeZone = await this.readableTimeZone(user, athleteId);
    const granularity = statisticsGranularity(from, to);
    const rows = await this.prisma.$queryRaw<
      (StatisticsVolumeDto['buckets'][number]['sports'][number] & {
        period: string;
      })[]
    >`
      SELECT ${this.bucketOf(granularity, timeZone)} AS period, a.sport,
        sum(a.moving_time)::float8 AS "movingTime",
        sum(a.distance)::float8 AS distance,
        sum(a.elevation_gain)::float8 AS "elevationGain",
        count(*)::int AS count
      ${this.activitiesOf(athleteId, from, to, sport)}
      GROUP BY 1, 2
      ORDER BY 1, 3 DESC`;

    return {
      granularity,
      buckets: statisticsBuckets(
        zonedClock(from, timeZone).date,
        zonedClock(to, timeZone).date,
        granularity,
        zonedClock(now, timeZone).date,
      ).map((bucket) => ({
        ...bucket,
        sports: rows
          .filter((row) => row.period === bucket.period)
          .map(({ period: _period, ...sportVolume }) => sportVolume),
      })),
    };
  }

  /** Every active day of a period, for the calendar and the yearly totals. */
  async getDays(
    user: AuthUser,
    { athleteId, from, to, sport }: GetStatisticsSectionQueryDto,
  ): Promise<StatisticsDaysDto> {
    const timeZone = await this.readableTimeZone(user, athleteId);
    const days = await this.prisma.$queryRaw<StatisticsDaysDto['days']>`
      SELECT ${this.bucketOf('day', timeZone)} AS date,
        sum(a.moving_time)::float8 AS "movingTime",
        sum(a.distance)::float8 AS distance,
        sum(a.elevation_gain)::float8 AS "elevationGain",
        count(*)::int AS count
      ${this.activitiesOf(athleteId, from, to, sport)}
      GROUP BY 1
      ORDER BY 1`;
    return { days };
  }

  /** How the averages of a sport evolve, bucket by bucket. */
  async getTrends(
    user: AuthUser,
    { athleteId, from, to, sport }: GetStatisticsTrendsQueryDto,
    now = new Date(),
  ): Promise<StatisticsTrendsDto> {
    const timeZone = await this.readableTimeZone(user, athleteId);
    const granularity = statisticsGranularity(from, to);
    // Each figure over the time of the activities that have it
    const timeWeighted = (column: Prisma.Sql) => Prisma.sql`
      sum(${column} * a.moving_time) / nullif(
        sum(a.moving_time) FILTER (WHERE ${column} IS NOT NULL), 0)`;
    const rows = await this.prisma.$queryRaw<
      (Omit<StatisticsTrendsDto['buckets'][number], 'partial'> & {
        period: string;
      })[]
    >`
      SELECT ${this.bucketOf(granularity, timeZone)} AS period,
        count(*)::int AS count,
        (sum(a.distance) / count(*))::float8 AS "distancePerActivity",
        (sum(a.elevation_gain) / count(*))::float8 AS "elevationPerActivity",
        (sum(a.distance) / nullif(sum(a.moving_time), 0))::float8 AS "averageSpeed",
        (${timeWeighted(Prisma.sql`a.average_gap_speed`)})::float8 AS "averageGapSpeed",
        (${timeWeighted(Prisma.sql`a.average_heartrate`)})::float8 AS "averageHeartrate",
        (${timeWeighted(Prisma.sql`a.average_cadence`)})::float8 AS "averageCadence",
        (${timeWeighted(Prisma.sql`a.average_watts`)})::float8 AS "averageWatts"
      ${this.activitiesOf(athleteId, from, to, sport)}
      GROUP BY 1`;

    const byPeriod = new Map(rows.map((row) => [row.period, row]));
    return {
      granularity,
      buckets: statisticsBuckets(
        zonedClock(from, timeZone).date,
        zonedClock(to, timeZone).date,
        granularity,
        zonedClock(now, timeZone).date,
      ).map((bucket) => ({
        count: 0,
        distancePerActivity: null,
        elevationPerActivity: null,
        averageSpeed: null,
        averageGapSpeed: null,
        averageHeartrate: null,
        averageCadence: null,
        averageWatts: null,
        ...byPeriod.get(bucket.period),
        ...bucket,
      })),
    };
  }

  /** Load and form, by day or by week on long periods. */
  async getLoad(
    user: AuthUser,
    { athleteId, from, to }: GetStatisticsSectionQueryDto,
  ): Promise<StatisticsLoadDto> {
    const history = await this.trainingLoad.getTrainingLoadHistory(
      user,
      'TRIMP',
      from,
      to,
      athleteId,
    );
    const round = (value: number) => Math.round(value * 10) / 10;
    const days = (to.getTime() - from.getTime()) / (24 * 3600 * 1000);
    const granularity = days <= LOAD_DAILY_MAX_DAYS ? 'day' : 'week';

    const points = new Map<string, StatisticsLoadDto['points'][number]>();
    for (const day of history) {
      const date = toUtcDateKey(
        granularity === 'day' ? day.date : getUtcWeekStart(day.date),
      );
      points.set(date, {
        date,
        load: round((points.get(date)?.load ?? 0) + day.load),
        ctl: round(day.ctl),
        atl: round(day.atl),
        tsb: round(day.tsb),
      });
    }
    return { granularity, points: [...points.values()] };
  }
}
