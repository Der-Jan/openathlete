// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLanguageSync } from './use-language-sync';

const mocks = vi.hoisted(() => ({
  authenticated: false,
  updateLanguage: vi.fn(),
  setLocale: vi.fn(),
  rememberLanguageChoice: vi.fn(),
}));

vi.mock('@/api/user', () => ({
  UserAPI: { updateLanguage: mocks.updateLanguage },
}));
vi.mock('@/contexts/auth', () => ({
  useAuthContext: () => ({ authenticated: mocks.authenticated }),
}));
vi.mock('@/paraglide/runtime', () => ({ setLocale: mocks.setLocale }));
vi.mock('@/utils/language-choice', () => ({
  rememberLanguageChoice: mocks.rememberLanguageChoice,
  toEmailLanguage: (locale: 'es' | 'pt-BR') =>
    locale === 'pt-BR' ? 'PT_BR' : 'ES',
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function pick(locale: 'es' | 'pt-BR') {
  let sync: ReturnType<typeof useLanguageSync>['syncLanguage'] = () =>
    Promise.resolve();
  function Probe() {
    sync = useLanguageSync().syncLanguage;
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe />));
  await act(() => sync(locale));
  act(() => root.unmount());
}

describe('useLanguageSync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('remembers a choice made while signed out, for the next sign-in', async () => {
    mocks.authenticated = false;
    await pick('es');
    expect(mocks.rememberLanguageChoice).toHaveBeenCalledWith('es');
    expect(mocks.updateLanguage).not.toHaveBeenCalled();
    expect(mocks.setLocale).toHaveBeenCalledWith('es');
  });

  it('saves a choice made while signed in right away', async () => {
    mocks.authenticated = true;
    await pick('es');
    expect(mocks.updateLanguage).toHaveBeenCalledWith('ES');
    expect(mocks.rememberLanguageChoice).not.toHaveBeenCalled();
  });

  it('stores Brazilian Portuguese as PT_BR for signed-in users', async () => {
    mocks.authenticated = true;
    await pick('pt-BR');
    expect(mocks.updateLanguage).toHaveBeenCalledWith('PT_BR');
    expect(mocks.setLocale).toHaveBeenCalledWith('pt-BR');
    expect(mocks.rememberLanguageChoice).not.toHaveBeenCalled();
  });
});
