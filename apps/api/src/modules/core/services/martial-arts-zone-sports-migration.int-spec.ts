import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { SportType } from '@openathlete/database';

import { accountFixtureSql } from 'src/modules/auth/services/account-deletion.fixture';
import { PrismaService } from 'src/modules/prisma/services/prisma.service';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'INTEGRATION_DATABASE_URL must point to a disposable test database',
  );

const migrationSql = readFileSync(
  join(
    dirname(require.resolve('@openathlete/database/package.json')),
    'prisma/schema/migrations/20261027170100_martial_arts_zones/migration.sql',
  ),
  'utf8',
);

// The fixture's heart rate zone, of athlete 2001
const ZONE_ID = 2201;

const ALL_SPORTS = Object.values(SportType);
// The whole sport_type enum before Martial arts: "all sports" at the time
const ALL_BUT_MARTIAL_ARTS = ALL_SPORTS.filter(
  (sport) => sport !== 'MARTIAL_ARTS',
);

describe('martial_arts_zones migration (PostgreSQL)', () => {
  let prisma: PrismaService;

  const seed = async (sports: SportType[]) =>
    (
      await prisma.trainingZoneValue.create({
        data: { min: 120, max: 140, sports, trainingZoneId: ZONE_ID },
      })
    ).trainingZoneValueId;

  const sportsOf = async () =>
    new Map(
      (await prisma.trainingZoneValue.findMany()).map((value) => [
        value.trainingZoneValueId,
        value.sports,
      ]),
    );

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: databaseUrl });
    await prisma.$connect();
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

  it('adds Martial arts to values that list every other sport', async () => {
    const complete = await seed([...ALL_BUT_MARTIAL_ARTS].reverse());
    const before = await sportsOf();

    expect(await prisma.$executeRawUnsafe(migrationSql)).toBe(1);

    const after = await sportsOf();
    expect([...(after.get(complete) ?? [])].sort()).toEqual(
      [...ALL_SPORTS].sort(),
    );
    for (const [id, sports] of before)
      if (id !== complete) expect(after.get(id)).toEqual(sports);
  });

  it('keeps explicit selections and changes nothing when it runs again', async () => {
    await seed(['RUNNING', 'TRAIL_RUNNING']);
    await seed(ALL_BUT_MARTIAL_ARTS.filter((sport) => sport !== 'GOLF'));
    await seed(ALL_SPORTS);
    await seed([]);
    const before = await sportsOf();

    expect(await prisma.$executeRawUnsafe(migrationSql)).toBe(0);
    expect(await sportsOf()).toEqual(before);
  });
});
