// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEvent, INJURY_STATUS } from '@openathlete/shared';

import { ActivityAiNotes } from './activity-ai-notes';

const ai = vi.hoisted(() => ({ available: true, athleteConsent: true }));
vi.mock('@/api/ai-settings', async () => ({
  athleteAiTaskUsable: (
    await vi.importActual<typeof import('@/api/ai-settings/ai-settings.hooks')>(
      '@/api/ai-settings/ai-settings.hooks',
    )
  ).athleteAiTaskUsable,
  useAiAccessQuery: () => ({
    data: {
      tasks: { FEEDBACK_EXTRACTION: { available: ai.available } },
      athleteDataSharingConsent: ai.athleteConsent,
    },
  }),
}));
// Every message renders as its key, followed by its parameters.
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

const answered = [{ activityFeedbackQuestionId: 1, answerText: 'Knee sore' }];

describe('ActivityAiNotes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    ai.available = true;
    ai.athleteConsent = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (event: Partial<ActivityEvent>) =>
    act(() =>
      root.render(
        <ActivityAiNotes
          event={{ athleteId: 2, ...event } as unknown as ActivityEvent}
        />,
      ),
    );
  const text = () => container.textContent;

  it('says nothing before the questions are answered', () => {
    render({ feedbackQuestions: [{ answerText: null }] as never });
    expect(text()).toBe('');
  });

  it('shows that the AI is reading the answers', () => {
    render({ feedbackQuestions: answered as never, feedbackAnalyzedAt: null });
    expect(text()).toContain('activity_ai_notes_pending');
  });

  it('stays silent when no AI can analyse the answers', () => {
    ai.available = false;
    render({ feedbackQuestions: answered as never, feedbackAnalyzedAt: null });
    expect(text()).toBe('');
  });

  it('stays silent when the athlete did not allow AI on their data', () => {
    ai.athleteConsent = false;
    render({ feedbackQuestions: answered as never, feedbackAnalyzedAt: null });
    expect(text()).toBe('');
  });

  it('says when the analysis found no pain', () => {
    render({
      feedbackQuestions: answered as never,
      feedbackAnalyzedAt: new Date(),
      extractedInjuries: [],
    });
    expect(text()).toContain('activity_ai_notes_none');
  });

  it('lists the pain the AI noted', () => {
    render({
      feedbackQuestions: answered as never,
      feedbackAnalyzedAt: new Date(),
      extractedInjuries: [
        {
          athleteInjuryId: 7,
          location: 'knee',
          painScore: 0.6,
          context: 'Sore on the descents',
          status: INJURY_STATUS.WORSENING,
        },
      ],
    });
    expect(text()).toContain('knee');
    expect(text()).toContain('activity_ai_notes_pain 6');
    expect(text()).toContain('Sore on the descents');
    expect(text()).not.toContain('activity_ai_notes_none');
  });
});
