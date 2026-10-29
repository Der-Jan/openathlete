// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEvent } from '@openathlete/shared';

import { AiSummaryCard } from './ai-summary-card';

// Every message renders as its key
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('AiSummaryCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (aiSummary: unknown) =>
    act(() =>
      root.render(
        <AiSummaryCard event={{ aiSummary } as unknown as ActivityEvent} />,
      ),
    );

  it('shows the headline, the findings and what to do next', () => {
    render({
      headline: 'Tempo held, slowed by the heat',
      points: ['54 s lost to 27 °C', '7% of drift'],
      suggestion: 'Easy run tomorrow',
    });
    const card = container.querySelector('[data-ai-summary]')!;
    expect(card.textContent).toContain('Tempo held, slowed by the heat');
    expect(card.querySelectorAll('li')).toHaveLength(2);
    expect(card.textContent).toContain('Easy run tomorrow');
  });

  it('shows nothing before the summary is written, or if it is malformed', () => {
    render(null);
    expect(container.querySelector('[data-ai-summary]')).toBeNull();
    render({ headline: 42 });
    expect(container.querySelector('[data-ai-summary]')).toBeNull();
  });
});
