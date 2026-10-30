import { ConfigService } from '@nestjs/config';

import { ConnectorProvider, ProviderAccount } from '@openathlete/database';
import { ApiEnvSchemaType } from '@openathlete/shared';

import { PrismaService } from '../../prisma/services/prisma.service';
import { InvalidRefreshTokenError } from '../errors/invalid-refresh-token.error';
import { BaseProviderService, OAuthConfig } from './base-provider.service';

class TestProvider extends BaseProviderService {
  protected readonly provider = ConnectorProvider.SUUNTO;
  protected readonly oauthConfig = {} as OAuthConfig;
}

const account = {
  providerAccountId: 8,
  athleteId: 1,
  status: 'active',
  accessToken: 'expired',
  refreshToken: 'spent',
  expiresAt: new Date(0),
} as unknown as ProviderAccount;

function axiosFailure(status: number, data: unknown) {
  return Object.assign(new Error(`Status ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

function setup(stored: Partial<ProviderAccount> = account) {
  const prisma = {
    providerAccount: {
      findUnique: jest.fn().mockResolvedValue({ ...account, ...stored }),
      update: jest.fn(),
    },
  };
  const service = new TestProvider(
    prisma as unknown as PrismaService,
    {} as ConfigService<ApiEnvSchemaType, true>,
  );
  return { service, prisma };
}

describe('BaseProviderService.getValidAccessToken', () => {
  it.each([
    ['401', 401, {}],
    ['400 invalid_grant', 400, { error: 'invalid_grant' }],
  ])('revokes the account on a %s', async (_, status, data) => {
    const { service, prisma } = setup();
    jest
      .spyOn(service, 'refreshAccessToken')
      .mockRejectedValue(axiosFailure(status, data));

    await expect(service.getValidAccessToken(account)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    expect(prisma.providerAccount.update).toHaveBeenCalledWith({
      where: { providerAccountId: 8 },
      data: { status: 'revoked' },
    });
  });

  it('keeps the account when a concurrent job rotated the token', async () => {
    const { service, prisma } = setup({
      accessToken: 'fresh',
      refreshToken: 'rotated',
    });
    jest
      .spyOn(service, 'refreshAccessToken')
      .mockRejectedValue(axiosFailure(400, { error: 'invalid_grant' }));

    await expect(service.getValidAccessToken(account)).resolves.toBe('fresh');
    expect(prisma.providerAccount.update).not.toHaveBeenCalled();
  });

  it('keeps the account on another 400, such as a wrong client secret', async () => {
    const { service, prisma } = setup();
    const failure = axiosFailure(400, { error: 'invalid_client' });
    jest.spyOn(service, 'refreshAccessToken').mockRejectedValue(failure);

    await expect(service.getValidAccessToken(account)).rejects.toBe(failure);
    expect(prisma.providerAccount.update).not.toHaveBeenCalled();
  });
});
