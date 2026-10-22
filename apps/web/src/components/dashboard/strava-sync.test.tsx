// @vitest-environment jsdom
import {
  type ConnectedProvider,
  ProviderAPI,
} from '@/api/provider/provider.api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StravaSync } from './strava-sync';

vi.mock('@/api/provider/provider.api', () => ({
  ProviderAPI: { syncStrava: vi.fn() },
}));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('Strava sync action', () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  const provider = {
    provider: 'STRAVA',
    status: 'active',
    importActivitiesEnabled: true,
  } as ConnectedProvider;
  const render = async (
    connection: ConnectedProvider | undefined = provider,
    scope = 'account-42',
  ) => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <StravaSync key={scope} provider={connection} />
          </MemoryRouter>
        </QueryClientProvider>,
      ),
    );
  };
  const settle = async () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ProviderAPI.syncStrava).mockResolvedValue({
      success: true,
      queued: true,
    });
    client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    client.clear();
  });

  it('requires a tap, coalesces taps, and acknowledges queued work rather than completed imports', async () => {
    await render();
    expect(ProviderAPI.syncStrava).not.toHaveBeenCalled();
    await act(async () => container.querySelector('button')!.click());
    await settle();
    expect(ProviderAPI.syncStrava).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button')!.disabled).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'sync_strava_queued',
    );
  });

  it('does not allow disabled imports', async () => {
    await render({ ...provider, importActivitiesEnabled: false });
    expect(container.querySelector('button')!.disabled).toBe(true);
    expect(container.querySelector('a')?.getAttribute('href')).toContain(
      'tab=connectors',
    );
  });

  it('explains missing server support without leaking response bodies or retrying the POST', async () => {
    vi.mocked(ProviderAPI.syncStrava).mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: 'private response' },
    });
    await render();
    await act(async () => container.querySelector('button')!.click());
    await settle();
    expect(container.textContent).toContain('sync_strava_unavailable');
    expect(container.textContent).not.toContain('private response');
    expect(ProviderAPI.syncStrava).toHaveBeenCalledTimes(1);
  });

  it('ignores late results from the previous account', async () => {
    let finish!: (value: { success: true; queued: true }) => void;
    vi.mocked(ProviderAPI.syncStrava).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await act(async () => container.querySelector('button')!.click());
    await render(provider, 'account-43');
    await act(async () => finish({ success: true, queued: true }));
    await settle();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('button')!.disabled).toBe(false);
  });
});
