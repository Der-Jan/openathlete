// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiAccessDto, AiTask } from '@openathlete/shared';

import { AiUsageSection } from './ai-usage-section';

vi.mock('@/paraglide/runtime', () => ({ getLocale: () => 'en' }));
vi.mock('@/paraglide/messages', () => ({
  m: {
    ai_usage_title: () => 'Usage this month',
    ai_usage_included: () => 'Included AI',
    ai_usage_percent_used: ({ percent }: { percent: number }) =>
      `${percent}% used`,
    ai_usage_resets: ({ date }: { date: string }) => `Renews on ${date}.`,
    ai_usage_exhausted: ({ date }: { date: string }) =>
      `Used up until ${date}.`,
    ai_usage_own_keys: ({ tokens }: { tokens: string }) =>
      `${tokens} tokens on your own keys`,
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const unavailable = {
  available: false,
  source: null,
  provider: null,
  modelId: null,
};

function access(overrides: Partial<AiAccessDto> = {}): AiAccessDto {
  return {
    tasks: {
      [AiTask.EVENT_GENERATION]: unavailable,
      [AiTask.EVENT_MODIFICATION]: unavailable,
      [AiTask.POST_ACTIVITY_QUESTIONS]: unavailable,
      [AiTask.FEEDBACK_EXTRACTION]: unavailable,
      [AiTask.TRAINING_LOAD_ESTIMATION]: unavailable,
    },
    hostedAccess: true,
    upgradeUnlocksHosted: false,
    customEndpointsAllowed: false,
    hostedQuotaExhausted: false,
    usage: {
      hostedTokens: 250_000,
      ownKeyTokens: 0,
      hostedBudgetUsed: 0.25,
      resetsAt: '2026-11-01T00:00:00.000Z',
    },
    dataSharingConsent: true,
    athleteDataSharingConsent: null,
    transcriptionProvider: null,
    ...overrides,
  };
}

describe('AiUsageSection', () => {
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

  const render = (value: AiAccessDto) =>
    act(() => root.render(<AiUsageSection access={value} />));

  it('shows the included allowance and when it renews', () => {
    render(access());

    expect(container.textContent).toContain('25% used');
    expect(container.textContent).toContain('Renews on November 1.');
    expect(
      container
        .querySelector('[role="progressbar"]')
        ?.getAttribute('aria-valuenow'),
    ).toBe('25');
  });

  it('says when the allowance is used up', () => {
    render(
      access({
        hostedQuotaExhausted: true,
        usage: { ...access().usage, hostedBudgetUsed: 1 },
      }),
    );

    expect(container.textContent).toContain('Used up until November 1.');
    expect(
      container
        .querySelector('[role="progressbar"]')
        ?.getAttribute('aria-valuenow'),
    ).toBe('100');
  });

  it('shows what ran on the own keys, without an allowance', () => {
    render(
      access({
        hostedAccess: false,
        usage: {
          ...access().usage,
          hostedBudgetUsed: null,
          ownKeyTokens: 42_000,
        },
      }),
    );

    expect(container.textContent).toContain('42K tokens on your own keys');
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('stays hidden with nothing to show', () => {
    render(access({ usage: { ...access().usage, hostedBudgetUsed: null } }));

    expect(container.textContent).toBe('');
  });
});
