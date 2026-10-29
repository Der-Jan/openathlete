import { TokenType } from '@openathlete/database';

import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import { TokenService } from './token.service';

function setup(deleted: number, createdAt = new Date()) {
  const user = { userId: 3, email: 'ana@example.com' };
  const prisma = {
    token: {
      findFirst: jest.fn().mockResolvedValue({
        tokenId: 1,
        type: TokenType.OIDC_LOGIN,
        createdAt,
        user,
      }),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: deleted }),
    },
  };
  return {
    service: new TokenService(prisma as unknown as PrismaService),
    prisma,
    user,
  };
}

describe('TokenService', () => {
  it('looks a token up for its purpose only', async () => {
    const { service, prisma } = setup(1);
    await service.verifyToken('code', TokenType.PASSWORD_RESET);
    expect(prisma.token.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { token: 'code', type: TokenType.PASSWORD_RESET },
      }),
    );
  });

  it('spends a token it hands the user for', async () => {
    const { service, prisma, user } = setup(1);
    await expect(
      service.consumeToken('code', TokenType.OIDC_LOGIN),
    ).resolves.toEqual(user);
    expect(prisma.token.deleteMany).toHaveBeenCalledWith({
      where: { token: 'code', type: TokenType.OIDC_LOGIN },
    });
  });

  it('gives nothing when a concurrent request spent the token first', async () => {
    const { service } = setup(0);
    await expect(
      service.consumeToken('code', TokenType.OIDC_LOGIN),
    ).resolves.toBeNull();
  });

  it('gives nothing for an expired token', async () => {
    const { service, prisma } = setup(1, new Date(Date.now() - 2 * 60_000));
    await expect(
      service.consumeToken('code', TokenType.OIDC_LOGIN),
    ).resolves.toBeNull();
    expect(prisma.token.deleteMany).not.toHaveBeenCalled();
  });
});
