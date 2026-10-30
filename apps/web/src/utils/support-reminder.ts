import { purchaseChannel } from './capacitor';
import { FIRST_SEEN_AT, SUPPORT_REMINDER_DISMISSED } from './local-storage';

export const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/openathlete';

const DAYS_BEFORE_REMINDER = 30;

interface ReminderState {
  /** The instance sells Supporter subscriptions: the hosted one */
  billingEnabled: boolean;
  dismissed: boolean;
  firstSeenAt: Date | null;
  /** When each connected provider finished importing the history */
  fullImportsCompletedAt: (string | null)[];
  now: Date;
}

/**
 * Self-hosters pay us nothing, so they are asked for a coffee once, at a
 * moment the app proved useful: after the first sync went through, or after
 * a month of use. The hosted instance sells Supporter instead, and the
 * stores forbid pointing to outside payments.
 */
export function shouldShowSupportReminder({
  billingEnabled,
  dismissed,
  firstSeenAt,
  fullImportsCompletedAt,
  now,
}: ReminderState): boolean {
  if (billingEnabled || dismissed || purchaseChannel() !== 'stripe') {
    return false;
  }
  if (fullImportsCompletedAt.some((completedAt) => completedAt !== null)) {
    return true;
  }
  if (!firstSeenAt) return false;
  const usedFor = now.getTime() - firstSeenAt.getTime();
  return usedFor >= DAYS_BEFORE_REMINDER * 24 * 60 * 60 * 1000;
}

/** First visit on this browser, recorded on the first call */
export function firstSeenAt(now = new Date()): Date {
  const stored = localStorage.getItem(FIRST_SEEN_AT);
  const parsed = stored ? new Date(stored) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  localStorage.setItem(FIRST_SEEN_AT, now.toISOString());
  return now;
}

export function isSupportReminderDismissed(): boolean {
  return localStorage.getItem(SUPPORT_REMINDER_DISMISSED) !== null;
}

export function dismissSupportReminder(): void {
  localStorage.setItem(SUPPORT_REMINDER_DISMISSED, new Date().toISOString());
}
