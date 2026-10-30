// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEvent } from '@openathlete/shared';

import {
  ActivityDetailsSelectionProvider,
  useActivityDetailsSelection,
} from '../event-details/activity-details-selection-context';
import { CorrectionsCard } from './corrections-card';

const calls = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/api/event', () => ({
  useAddActivityCorrectionMutation: () => ({
    mutate: calls.add,
    isPending: false,
  }),
  useRemoveActivityCorrectionMutation: () => ({
    mutate: calls.remove,
    isPending: false,
  }),
}));
// Every message renders as its key, followed by its parameters
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy(
    {},
    {
      get: (_target, key) => (params?: Record<string, unknown>) =>
        [String(key), ...Object.values(params ?? {})].join(' '),
    },
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const range = <T,>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

// Ten minutes, a sample every 10 s, with one heart rate spike
const stream = {
  time: range(61, (i) => i * 10),
  distance: range(61, (i) => i * 30),
  heartrate: range(61, (i) => (i === 30 ? 245 : 150)),
  altitude: range(61, () => 100),
};

function Selected({
  domain,
  corrections = [],
}: {
  domain?: [number, number];
  corrections?: unknown[];
}) {
  const { setDomain } = useActivityDetailsSelection();
  useEffect(() => setDomain(domain), [domain, setDomain]);
  return (
    <CorrectionsCard
      event={{ eventId: 4, corrections } as unknown as ActivityEvent}
      stream={stream}
    />
  );
}

describe('CorrectionsCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (props: Parameters<typeof Selected>[0] = {}) =>
    act(() =>
      root.render(
        <ActivityDetailsSelectionProvider
          fullDomain={[0, 1800]}
          xAxis="distance"
          onXAxisChange={() => {}}
        >
          <Selected {...props} />
        </ActivityDetailsSelectionProvider>,
      ),
    );
  const button = (name: string) =>
    container.querySelector<HTMLButtonElement>(`[data-correction="${name}"]`);

  beforeEach(() => {
    calls.add.mockReset();
    calls.remove.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('offers to remove the spikes it finds, and only those', () => {
    render();
    expect(button('despike-heartrate')!.textContent).toContain(
      'activity_corrections_despike_heartrate 1',
    );
    expect(button('despike-watts')).toBeNull();
    act(() => button('despike-heartrate')!.click());
    expect(calls.add).toHaveBeenCalledWith({
      eventId: 4,
      correction: { type: 'despike', channel: 'heartrate' },
    });
  });

  it('crops to the selection, in seconds of the recording', () => {
    render();
    expect(button('crop')!.disabled).toBe(true);
    // 300 to 900 m is 100 to 300 s at 3 m/s
    render({ domain: [300, 900] });
    act(() => button('crop')!.click());
    expect(calls.add).toHaveBeenCalledWith({
      eventId: 4,
      correction: { type: 'crop', from: 100, to: 300 },
    });
  });

  it('undoes a correction or restores the original', () => {
    render({
      corrections: [
        { type: 'crop', from: 60, to: 360, at: '2026-10-29T10:00:00Z' },
        { type: 'smoothAltitude', at: '2026-10-29T10:01:00Z' },
      ],
    });
    const applied = container.querySelector('[data-applied-corrections]')!;
    expect(applied.textContent).toContain(
      'activity_correction_crop_done 1:00 6:00',
    );
    // Altitude smoothed already: not offered twice
    expect(button('smooth-altitude')).toBeNull();

    const undo = applied.querySelectorAll('li button');
    act(() => (undo[1] as HTMLButtonElement).click());
    expect(calls.remove).toHaveBeenCalledWith({ eventId: 4, index: 1 });
    act(() => button('restore')!.click());
    expect(calls.remove).toHaveBeenLastCalledWith({ eventId: 4 });
  });
});
