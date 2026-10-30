import { describe, expect, it, vi } from 'vitest';

import { alertText, formTone } from './coach-dashboard-format';

vi.mock('@/paraglide/messages', () => ({
  m: new Proxy(
    {},
    {
      get: (_, key) => (params?: object) =>
        `${String(key)}${params ? JSON.stringify(params) : ''}`,
    },
  ),
}));

describe('coach dashboard', () => {
  it('words each alert', () => {
    expect(alertText({ type: 'pain', location: 'knee', painScore: 6.25 })).toBe(
      'coach_alert_pain{"location":"knee","score":6.3}',
    );
    expect(alertText({ type: 'inactive', days: 12 })).toBe(
      'coach_alert_inactive{"days":12}',
    );
    expect(alertText({ type: 'inactive', days: null })).toBe(
      'coach_alert_never_active',
    );
  });

  it('reads the form on the zones of the training status', () => {
    expect(formTone(-25)).toBe('tired');
    expect(formTone(0)).toBe('ready');
    expect(formTone(30)).toBe('detraining');
  });
});
