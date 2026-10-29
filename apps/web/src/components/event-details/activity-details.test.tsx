// @vitest-environment jsdom
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEvent, EVENT_TYPE, SPORT_TYPE } from '@openathlete/shared';

import { ActivityDetails } from './activity-details';

const me = vi.hoisted(() => ({ athleteId: 1 }));
vi.mock('@/api/athlete', () => ({
  useGetMyAthleteQuery: () => ({ data: { athleteId: me.athleteId } }),
}));
const conditions = vi.hoisted(() => ({ weather: undefined as unknown }));
vi.mock('@/api/event', () => ({
  useGetEventStreamQuery: () => ({ data: undefined }),
  useGetEventWeatherQuery: () => ({ data: conditions.weather }),
  useGetEventNormalizationQuery: () => ({ data: undefined }),
}));
vi.mock('./tabs/activity-details-weather-tab', () => ({
  ActivityDetailsWeatherTab: () => <div data-weather />,
}));
// Every message renders as its key
vi.mock('@/paraglide/messages', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

type OverviewProps = {
  onAnswerFeedback?: () => void;
  onEditFeedback?: () => void;
};
type OverlayProps = { onSkip: () => void; isEditMode?: boolean };
const stubs = vi.hoisted(() => ({
  overview: {} as OverviewProps,
  overlay: {} as OverlayProps,
}));
vi.mock('./tabs/activity-details-overview-tab', () => ({
  ActivityDetailsOverviewTab: (props: OverviewProps) => {
    stubs.overview = props;
    return <div data-overview />;
  },
}));
vi.mock('../activity-feedback/activity-feedback-overlay', () => ({
  ActivityFeedbackOverlay: (props: OverlayProps) => {
    stubs.overlay = props;
    return <div data-feedback-flow={props.isEditMode ? 'edit' : 'answer'} />;
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const event = {
  eventId: 7,
  athleteId: 1,
  type: EVENT_TYPE.ACTIVITY,
  sport: SPORT_TYPE.RUNNING,
} as ActivityEvent;

describe('ActivityDetails', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    me.athleteId = 1;
    conditions.weather = undefined;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<ActivityDetails event={event} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const overview = () => container.querySelector('[data-overview]');
  const flow = () => container.querySelector('[data-feedback-flow]');

  it('shows my activity at once, without the feedback questions', () => {
    expect(overview()).not.toBeNull();
    expect(flow()).toBeNull();
  });

  it('opens the questions on request and comes back to the data', () => {
    act(() => stubs.overview.onAnswerFeedback?.());
    expect(flow()?.getAttribute('data-feedback-flow')).toBe('answer');
    expect(overview()).toBeNull();

    act(() => stubs.overlay.onSkip());
    expect(flow()).toBeNull();
    expect(overview()).not.toBeNull();
  });

  it('has no tabs to pick from without conditions', () => {
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it('puts the weather in a conditions tab', () => {
    conditions.weather = { samples: [] };
    act(() => root.render(<ActivityDetails event={{ ...event }} />));
    const tabs = [...container.querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent,
    );
    expect(tabs).toEqual(['overview', 'activity_conditions']);
  });

  it('edits the answers already given', () => {
    act(() => stubs.overview.onEditFeedback?.());
    expect(flow()?.getAttribute('data-feedback-flow')).toBe('edit');
  });
});
