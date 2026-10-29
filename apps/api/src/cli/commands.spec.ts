import { CliDeps, USAGE, runCommand } from './commands';

function setup(users = [{ userId: 7, email: 'ana@example.com' }]) {
  const deps = {
    prisma: {
      providerAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { providerAccountId: 3 },
            { providerAccountId: 5 },
          ]),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(users[0] ?? null),
        findMany: jest.fn().mockResolvedValue(
          users.map((user) => ({
            ...user,
            firstName: 'Ana',
            lastName: 'Lopez',
            roles: ['ATHLETE'],
            createdAt: new Date('2026-10-01T10:00:00Z'),
          })),
        ),
      },
    },
    tokens: {
      createToken: jest.fn().mockResolvedValue({ token: 'tok-123' }),
    },
    accountDeletion: { deleteAccount: jest.fn() },
    appUrl: 'https://train.example.org/',
    queueFullImports: jest.fn(),
  } as unknown as CliDeps;
  const lines: string[] = [];
  const run = (...args: string[]) =>
    runCommand(args, deps, (line) => lines.push(line));
  return { deps, lines, run };
}

describe('admin commands', () => {
  it('lists the accounts', async () => {
    const { lines, run } = setup();
    expect(await run('list-users')).toBe(0);
    expect(lines).toEqual([
      '7\tana@example.com\tAna Lopez\tATHLETE\t2026-10-01',
      '1 account',
    ]);
  });

  it('prints a password reset link for the account', async () => {
    const { deps, lines, run } = setup();
    expect(await run('reset-password', 'Ana@Example.com')).toBe(0);
    expect(deps.prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: 'ana@example.com', mode: 'insensitive' } },
      }),
    );
    expect(lines[1]).toBe(
      'https://train.example.org/auth/password-reset?token=tok-123',
    );
  });

  it('deletes an account only once confirmed', async () => {
    const { deps, lines, run } = setup();
    expect(await run('delete-user', 'ana@example.com')).toBe(1);
    expect(deps.accountDeletion.deleteAccount).not.toHaveBeenCalled();
    expect(lines[0]).toContain('--yes');

    expect(await run('delete-user', 'ana@example.com', '--yes')).toBe(0);
    expect(deps.accountDeletion.deleteAccount).toHaveBeenCalledWith(7);
  });

  it('says when no account has the email', async () => {
    const { lines, run } = setup([]);
    expect(await run('reset-password', 'nobody@example.com')).toBe(1);
    expect(lines).toEqual(['No account with the email nobody@example.com']);
  });

  it('explains its usage', async () => {
    const { lines, run } = setup();
    expect(await run('help')).toBe(0);
    expect(await run('unknown')).toBe(1);
    expect(lines).toEqual([USAGE, USAGE]);
  });

  it('queues a Garmin backfill for every connected account', async () => {
    const { deps, lines, run } = setup();
    expect(await run('garmin-backfill')).toBe(0);
    expect(deps.prisma.providerAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: 'GARMIN',
          status: 'active',
          importActivitiesEnabled: true,
        },
      }),
    );
    expect(deps.queueFullImports).toHaveBeenCalledWith([3, 5]);
    expect(lines).toEqual(['Backfill queued for 2 Garmin accounts']);
  });
});
