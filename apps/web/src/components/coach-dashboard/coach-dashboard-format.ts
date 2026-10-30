import { m } from '@/paraglide/messages';

import { CoachAlertDto } from '@openathlete/shared';

/** One line a coach reads at a glance. */
export function alertText(alert: CoachAlertDto): string {
  switch (alert.type) {
    case 'pain':
      return m.coach_alert_pain({
        location: alert.location,
        score: Number(alert.painScore.toFixed(1)),
      });
    case 'inactive':
      return alert.days === null
        ? m.coach_alert_never_active()
        : m.coach_alert_inactive({ days: alert.days });
  }
}

// Same thresholds as the API's training status (training-formulas.constants)
const TSB_OVERREACHING = -10;
const TSB_DETRAINING = 25;

/** How fresh the athlete is: tired, ready, or losing fitness. */
export function formTone(tsb: number): 'tired' | 'ready' | 'detraining' {
  if (tsb < TSB_OVERREACHING) return 'tired';
  if (tsb > TSB_DETRAINING) return 'detraining';
  return 'ready';
}
