import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dismissSupportReminder,
  firstSeenAt,
  isSupportReminderDismissed,
  shouldShowSupportReminder,
} from './support-reminder';

const platform = vi.hoisted(() => ({ name: 'web' }));
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => platform.name,
    isNativePlatform: () => platform.name !== 'web',
  },
}));

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const now = new Date('2026-10-29T12:00:00Z');
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const selfHosted = {
  billingEnabled: false,
  dismissed: false,
  firstSeenAt: daysAgo(1),
  fullImportsCompletedAt: [],
  now,
};

describe('shouldShowSupportReminder', () => {
  afterEach(() => {
    platform.name = 'web';
    vi.unstubAllEnvs();
  });

  it('waits for a reason to ask', () => {
    expect(shouldShowSupportReminder(selfHosted)).toBe(false);
  });

  it('asks once a sync went through', () => {
    expect(
      shouldShowSupportReminder({
        ...selfHosted,
        fullImportsCompletedAt: [null, '2026-10-28T08:00:00Z'],
      }),
    ).toBe(true);
  });

  it('asks after 30 days of use', () => {
    expect(
      shouldShowSupportReminder({ ...selfHosted, firstSeenAt: daysAgo(29) }),
    ).toBe(false);
    expect(
      shouldShowSupportReminder({ ...selfHosted, firstSeenAt: daysAgo(30) }),
    ).toBe(true);
  });

  it('never asks again once dismissed', () => {
    expect(
      shouldShowSupportReminder({
        ...selfHosted,
        firstSeenAt: daysAgo(90),
        dismissed: true,
      }),
    ).toBe(false);
  });

  it('never asks on the hosted instance, which sells Supporter', () => {
    expect(
      shouldShowSupportReminder({
        ...selfHosted,
        firstSeenAt: daysAgo(90),
        billingEnabled: true,
      }),
    ).toBe(false);
  });

  it('never asks in the mobile apps, nor in builds without payments', () => {
    const due = { ...selfHosted, firstSeenAt: daysAgo(90) };
    platform.name = 'ios';
    expect(shouldShowSupportReminder(due)).toBe(false);
    platform.name = 'android';
    expect(shouldShowSupportReminder(due)).toBe(false);
    platform.name = 'web';
    vi.stubEnv('VITE_DISABLE_PAYMENTS', 'true');
    expect(shouldShowSupportReminder(due)).toBe(false);
  });
});

describe('reminder storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the date of the first visit', () => {
    expect(firstSeenAt(daysAgo(10))).toEqual(daysAgo(10));
    expect(firstSeenAt(now)).toEqual(daysAgo(10));
  });

  it('remembers the dismissal', () => {
    expect(isSupportReminderDismissed()).toBe(false);
    dismissSupportReminder();
    expect(isSupportReminderDismissed()).toBe(true);
  });
});
