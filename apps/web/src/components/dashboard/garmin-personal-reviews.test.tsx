// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GarminPersonalReviews } from './garmin-personal-reviews';

const api = vi.hoisted(() => ({
  reviews: vi.fn(),
  previewReview: vi.fn(),
  resolveReview: vi.fn(),
}));
vi.mock('@/api/garmin-personal/garmin-personal.api', () => ({
  GarminPersonalAPI: api,
}));
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_, key) => () => String(key) }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const summary = {
  name: 'Synthetic Garmin ride',
  sport: 'CYCLING',
  startDate: '2020-01-02T09:00:00Z',
  endDate: '2020-01-02T10:00:00Z',
  distance: 10000,
};
const item = {
  id: 12,
  externalId: '12345',
  summary,
  candidates: [
    {
      ...summary,
      name: 'Edited existing ride',
      provider: 'STRAVA',
      eventActivityId: 55,
      eventId: 77,
    },
  ],
};

describe('Garmin review in the sync panel', () => {
  let element: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let cache: QueryClient;
  const count = vi.fn();
  const render = async (allowImport = true) => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={cache}>
          <GarminPersonalReviews
            userId={1}
            allowImport={allowImport}
            lastSyncedAt={null}
            onCountChange={count}
          />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  const click = async (label: string) => {
    const button = [...element.querySelectorAll('button')].find(
      (v) => v.textContent === label,
    )!;
    await act(async () => button.click());
  };
  beforeEach(() => {
    vi.resetAllMocks();
    api.reviews.mockResolvedValue({
      total: 1,
      items: [item],
      nextCursor: null,
    });
    api.resolveReview.mockResolvedValue({ resolved: true, pending: false });
    cache = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    element = document.createElement('div');
    root = createRoot(element);
  });
  afterEach(() => {
    act(() => root.unmount());
    cache.clear();
  });
  it('shows both recordings without choosing or importing automatically', async () => {
    await render();
    expect(element.textContent).toContain('Synthetic Garmin ride');
    expect(element.textContent).toContain('Edited existing ride');
    expect(element.textContent).toContain('STRAVA');
    expect(api.resolveReview).not.toHaveBeenCalled();
    expect(api.previewReview).not.toHaveBeenCalled();
    expect(count).toHaveBeenCalledWith(1);
  });
  it.each([
    ['garmin_review_link', { id: 12, action: 'link', eventActivityId: 55 }],
    ['garmin_review_import', { id: 12, action: 'import' }],
    ['garmin_review_ignore', { id: 12, action: 'ignore' }],
  ])(
    'sends only the explicit %s decision and refreshes the remaining count',
    async (label, decision) => {
      await render();
      api.reviews.mockResolvedValue({ total: 0, items: [], nextCursor: null });
      await click(String(label));
      await render();
      expect(api.resolveReview).toHaveBeenCalledWith(
        decision,
        expect.anything(),
      );
      expect(count).toHaveBeenCalledWith(0);
      expect(element.textContent).not.toContain('Synthetic Garmin ride');
    },
  );
  it('loads older recording details only on demand and keeps import disabled without consent', async () => {
    api.reviews.mockResolvedValue({
      total: 1,
      items: [{ ...item, summary: null, candidates: [] }],
      nextCursor: null,
    });
    await render(false);
    expect(
      [...element.querySelectorAll('button')]
        .filter((v) =>
          ['garmin_review_import', 'garmin_review_load'].includes(
            v.textContent!,
          ),
        )
        .every((v) => v.disabled),
    ).toBe(true);
    await render(true);
    api.previewReview.mockImplementation(async () => {
      api.reviews.mockResolvedValue({
        total: 1,
        items: [item],
        nextCursor: null,
      });
      return { loaded: true };
    });
    await click('garmin_review_load');
    await render();
    expect(api.previewReview).toHaveBeenCalledWith(12, expect.anything());
    expect(element.textContent).toContain('Synthetic Garmin ride');
    expect(api.resolveReview).not.toHaveBeenCalled();
  });
});
