---
name: i18n
description: Add or change user-facing text in OpenAthlete (web app Paraglide catalogs, API emails and push notifications, website) in every supported language. Use for any new or modified UI string, email or notification.
---

# User-facing text

Web app supported languages: English (`en`), French (`fr`), Italian (`it`), Spanish (`es`), and Brazilian Portuguese (`pt-BR`). The marketing website (`apps/website`) currently supports `en`, `fr`, and `es`. French users use the informal "tu" in AI-generated text and the formal "vous" in the UI, as the existing catalogs do. Brazilian Portuguese uses "você" and natural imperative forms.

## Web app

1. Add the key to all five catalogs in `apps/web/messages/{en,fr,it,es,pt-BR}.json`:
   - use snake_case, prefixed by the feature (`full_import_started`, `calendar_day_events_label`);
   - write parameters as `{name}`;
   - add it next to related keys, not only at the end, to limit merge conflicts.
2. Use it as `m.full_import_started({ provider })`, with `import { m } from '@/paraglide/messages'`.
3. Check:
   ```bash
   pnpm check:locale-parity       # same keys in every catalog
   pnpm web exec paraglide-js compile --project ./project.inlang --outdir ./src/paraglide
   ```
   `pnpm find:untranslated` lists keys still in English in other catalogs. `pnpm find:unused-translations` finds dead keys.
4. Write real translations, not copies of the English. Keep the product terms consistent with the existing catalogs (search them first): training load, CTL/ATL/TSB, the names of sports.

## API emails and push notifications

- Email templates in `apps/api/src/modules/notification/emails/templates/` have a `translations` object with `FR`, `EN`, `IT` and `ES`. Subjects are in `libs/shared/src/email/email.ts`.
- Push texts: `apps/api/src/modules/notification/push/translations.ts`.
- The user's language is `user.language` (`UserLanguage` enum). Adding a language means a Prisma enum migration (`prisma-migration` skill).

## Website

`apps/website/messages/{en,fr,es}.json`, compiled by `pnpm website translate`. `pnpm check:locale-parity` covers these catalogs too. Blog posts live in `apps/website/src/content/blog/`: English and French are required, Spanish (`es` metadata, `ContentEs`) is optional and falls back to English.

## Verify

`scripts/verify.sh` runs the parity check and compiles the catalogs. The E2E test `renders the dashboard in <locale>` checks each locale renders.
