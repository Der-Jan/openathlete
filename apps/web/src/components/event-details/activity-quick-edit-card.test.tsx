// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEvent, EVENT_TYPE, SPORT_TYPE } from '@openathlete/shared';

import { ActivityQuickEditCard } from './activity-quick-edit-card';

type Question = {
  activityFeedbackQuestionId: number;
  answerText: string | null;
};
const feedback = vi.hoisted(() => ({
  questions: [] as Question[],
  skipped: false,
  skip: vi.fn(),
}));
vi.mock('@/api/activity-feedback', () => ({
  useGetActivityFeedbackQuestionsQuery: () => ({
    data: { questions: feedback.questions, feedbackSkipped: feedback.skipped },
  }),
  useSkipFeedbackMutation: () => ({ mutate: feedback.skip, isPending: false }),
  useUnskipFeedbackMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/api/ai-settings', () => ({
  athleteAiTaskUsable: () => true,
  useAiAccessQuery: () => ({ data: undefined }),
}));
vi.mock('@/api/event', () => ({
  useUpdateEventMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/ai-settings', () => ({ AiSetupDialog: () => null }));
vi.mock('@/components/hook-form', () => ({
  FormProvider: ({ children }: { children: React.ReactNode }) => (
    <form>{children}</form>
  ),
  RHFTextarea: () => null,
  RHFRpe: () => null,
}));
vi.mock('./activity-ai-notes', () => ({ ActivityAiNotes: () => null }));
// Every message renders as its key
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const event = {
  eventId: 7,
  athleteId: 1,
  type: EVENT_TYPE.ACTIVITY,
  sport: SPORT_TYPE.RUNNING,
  description: '',
  rpe: null,
} as unknown as ActivityEvent;

describe('ActivityQuickEditCard', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onAnswerFeedback = vi.fn();

  beforeEach(() => {
    feedback.questions = [
      { activityFeedbackQuestionId: 1, answerText: null },
      { activityFeedbackQuestionId: 2, answerText: null },
    ];
    feedback.skipped = false;
    feedback.skip.mockReset();
    onAnswerFeedback.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = () =>
    act(() =>
      root.render(
        <ActivityQuickEditCard
          event={event}
          isMyActivity
          onAnswerFeedback={onAnswerFeedback}
        />,
      ),
    );
  const button = (label: string) =>
    [...container.querySelectorAll('button')].find(
      (b) => b.textContent === label,
    );

  it('offers to answer or skip the pending questions', () => {
    render();
    expect(
      container.querySelector('[data-activity-feedback-pending]'),
    ).not.toBeNull();

    act(() => button('activity_feedback_start')?.click());
    expect(onAnswerFeedback).toHaveBeenCalledOnce();

    act(() => button('activity_feedback_skip')?.click());
    expect(feedback.skip).toHaveBeenCalledOnce();
  });

  it('no longer asks once the questions are answered or skipped', () => {
    feedback.questions = [{ activityFeedbackQuestionId: 1, answerText: 'Ok' }];
    render();
    expect(
      container.querySelector('[data-activity-feedback-pending]'),
    ).toBeNull();

    feedback.questions = [{ activityFeedbackQuestionId: 1, answerText: null }];
    feedback.skipped = true;
    render();
    expect(
      container.querySelector('[data-activity-feedback-pending]'),
    ).toBeNull();
    expect(button('activity_feedback_reopen')).toBeDefined();
  });
});
