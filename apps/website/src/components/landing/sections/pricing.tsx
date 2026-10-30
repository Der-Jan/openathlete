'use client';

import { Container } from '@/components/landing/container';
import { LandingSectionHeader } from '@/components/landing/landing-canvas';
import { PricingCard } from '@/components/landing/pricing-card';
import { Section } from '@/components/landing/section';
import { APP_URL, BUY_ME_A_COFFEE_URL } from '@/config';
import { m } from '@/paraglide/messages';
import { cn } from '@/utils/shadcn';

const GITHUB_REPO_URL = 'https://github.com/openathleteorg/openathlete';
const GITHUB_SETUP_URL = `${GITHUB_REPO_URL}#getting-started`;

export function Pricing() {
  const signupUrl = `${APP_URL}/auth/create-account`;
  // After sign-up and onboarding (or straight away when signed in), the
  // app opens the Supporter offer
  const supporterUrl = `${signupUrl}?returnTo=${encodeURIComponent('/dashboard/settings?tab=subscription')}`;

  return (
    <Section id="pricing" surface="soft">
      <Container>
        <LandingSectionHeader
          title={m.landing_pricing_title()}
          titleId="pricing-heading"
          maxWidthClass="max-w-4xl"
          childrenMaxWidthClass="max-w-3xl"
        >
          <p className="text-base leading-relaxed text-muted-foreground">
            {m.landing_pricing_subtitle()}
          </p>
          <p className="mt-2 text-sm text-muted-foreground/90">
            {m.landing_pricing_note()}
          </p>
        </LandingSectionHeader>

        <div
          className={cn(
            'mx-auto mt-14 grid max-w-6xl gap-5',
            'sm:gap-6 md:grid-cols-3 md:items-stretch',
          )}
        >
          <PricingCard
            name={m.landing_pricing_selfhost_name()}
            price={m.landing_pricing_selfhost_price()}
            perks={[
              m.landing_pricing_selfhost_perk_1(),
              m.landing_pricing_selfhost_perk_2(),
              m.landing_pricing_selfhost_perk_3(),
              m.landing_pricing_selfhost_perk_4(),
            ]}
            ctaLabel={m.landing_pricing_selfhost_cta()}
            ctaHref={GITHUB_SETUP_URL}
            ctaExternal
          />
          <PricingCard
            name={m.landing_pricing_free_name()}
            price={m.landing_pricing_free_price()}
            perks={[
              m.landing_pricing_free_perk_1(),
              m.landing_pricing_free_perk_2(),
              m.landing_pricing_free_perk_3(),
              m.landing_pricing_free_perk_4(),
            ]}
            ctaLabel={m.landing_pricing_free_cta()}
            ctaHref={signupUrl}
          />
          <PricingCard
            name={m.landing_pricing_supporter_name()}
            price={m.landing_pricing_supporter_price()}
            priceLabel={m.landing_pricing_supporter_period()}
            perks={[
              m.landing_pricing_supporter_perk_1(),
              m.landing_pricing_supporter_perk_2(),
              m.landing_pricing_supporter_perk_3(),
              m.landing_pricing_supporter_perk_4(),
              m.landing_pricing_supporter_perk_5(),
            ]}
            highlighted
            badge={m.landing_pricing_popular_badge()}
            ctaLabel={m.landing_pricing_supporter_cta()}
            ctaHref={supporterUrl}
          />
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {m.landing_pricing_coffee_prompt()}{' '}
          <a
            href={BUY_ME_A_COFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            {m.landing_pricing_coffee_link()}
          </a>
        </p>
      </Container>
    </Section>
  );
}
