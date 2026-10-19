import { UserAPI } from '@/api/user';
import { useAuthContext } from '@/contexts/auth';
import { setLocale } from '@/paraglide/runtime';
import {
  rememberLanguageChoice,
  toEmailLanguage,
} from '@/utils/language-choice';
import type { SupportedLocale } from '@/utils/locales';
import { useCallback } from 'react';

export function useLanguageSync() {
  const { authenticated } = useAuthContext();

  const syncLanguage = useCallback(
    async (lang: SupportedLocale) => {
      // Sync with backend if authenticated
      if (authenticated) {
        try {
          await UserAPI.updateLanguage(toEmailLanguage(lang));
        } catch (error) {
          console.error('Failed to sync language with backend:', error);
        }
      } else {
        // Saved to the profile, for emails, at the next sign-in
        rememberLanguageChoice(lang);
      }

      // Paraglide reloads the page, so persist the preference first.
      setLocale(lang);
    },
    [authenticated],
  );

  return { syncLanguage };
}
