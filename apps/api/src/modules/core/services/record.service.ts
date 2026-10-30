import { subject } from '@casl/ability';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Athlete, Prisma, SportType } from '@openathlete/database';
import { BestRecordDto, RECORD_TYPE } from '@openathlete/shared';

import { CaslAbilityFactory } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

interface BestRecordRow {
  record_id: number;
  type: string;
  distance: number | null;
  duration: number | null;
  value: number;
  date: Date;
  event_id: number | null;
  activity_name: string | null;
}

@Injectable()
export class RecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilities: CaslAbilityFactory,
  ) {}

  /** The athlete whose records the user asked for, once allowed to read them. */
  private async targetAthleteId(
    user: AuthUser,
    athleteId?: Athlete['athleteId'],
  ): Promise<number> {
    if (!athleteId) {
      if (!user.athlete?.athleteId) {
        throw new NotFoundException('Athlete not found');
      }
      return user.athlete.athleteId;
    }

    const athlete = await this.prisma.athlete.findUnique({
      where: { athleteId },
    });
    if (!athlete) {
      throw new NotFoundException('Athlete not found');
    }
    const ability = await this.abilities.getFor({ user });
    if (!ability.can('read', subject('Athlete', athlete))) {
      throw new ForbiddenException('Not allowed to access this athlete');
    }
    return athleteId;
  }

  /**
   * Sports with records, the most frequent first: a records curve only
   * makes sense for one sport.
   */
  async getRecordSports(
    user: AuthUser,
    athleteId?: Athlete['athleteId'],
  ): Promise<SportType[]> {
    const targetAthleteId = await this.targetAthleteId(user, athleteId);
    const rows = await this.prisma.$queryRaw<{ sport: SportType }[]>`
      SELECT a.sport FROM record r
      JOIN event_activity a ON a.event_activity_id = r.event_activity_id
      WHERE r.athlete_id = ${targetAthleteId}
      GROUP BY a.sport
      ORDER BY count(DISTINCT a.event_activity_id) DESC, a.sport`;
    return rows.map((row) => row.sport);
  }

  /**
   * Best record at each distance or duration, for one sport, among the
   * activities between `from` (included) and `to` (excluded).
   */
  async getRecords(
    user: AuthUser,
    {
      sport,
      athleteId,
      from,
      to,
    }: {
      sport?: SportType;
      athleteId?: Athlete['athleteId'];
      from?: Date;
      to?: Date;
    },
  ): Promise<BestRecordDto[]> {
    const targetAthleteId = await this.targetAthleteId(user, athleteId);

    // Keeps the best of each record kind. Pace records hold a time: lower
    // is better
    const rows = await this.prisma.$queryRaw<BestRecordRow[]>`
      SELECT DISTINCT ON (r.type, r.distance, r.duration)
        r.record_id, r.type, r.distance, r.duration, r.value, r.date,
        a.event_id, e.name AS activity_name
      FROM record r
      LEFT JOIN event_activity a
        ON a.event_activity_id = r.event_activity_id
      LEFT JOIN event e ON e.event_id = a.event_id
      WHERE r.athlete_id = ${targetAthleteId}
        ${sport ? Prisma.sql`AND a.sport = ${sport}::sport_type` : Prisma.empty}
        ${from ? Prisma.sql`AND r.date >= ${from}` : Prisma.empty}
        ${to ? Prisma.sql`AND r.date < ${to}` : Prisma.empty}
      ORDER BY r.type, r.distance, r.duration,
        CASE WHEN r.type = 'SPEED' THEN r.value ELSE -r.value END`;

    return rows.map((row) => ({
      recordId: row.record_id,
      type: row.type as RECORD_TYPE,
      distance: row.distance,
      duration: row.duration,
      value: row.value,
      date: row.date,
      eventId: row.event_id,
      activityName: row.activity_name,
    }));
  }
}
