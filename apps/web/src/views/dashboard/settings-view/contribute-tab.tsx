import { useCurrentSubscription } from '@/api/subscription';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { m } from '@/paraglide/messages';
import { purchaseChannel } from '@/utils/capacitor';
import { BUY_ME_A_COFFEE_URL } from '@/utils/support-reminder';
import { Coffee, ExternalLink, Github } from 'lucide-react';

import { SettingsSection } from './settings-section';

const GITHUB_REPO_URL = 'https://github.com/openathleteorg/openathlete';

export function ContributeTab() {
  // Store rules: donations outside the app's own in-app purchase are refused
  // in the iOS app, and the Android app points to no payment
  const hideFinancialSupport = purchaseChannel() !== 'stripe';
  // The hosted instance asks for support through Supporter: the coffee is
  // only a footnote there, and the main ask on self-hosted instances
  const { data: subscription } = useCurrentSubscription();
  const coffeeAsCard =
    !hideFinancialSupport && subscription?.billingEnabled === false;
  const coffeeAsLink =
    !hideFinancialSupport && subscription?.billingEnabled === true;

  return (
    <div className="space-y-6">
      <SettingsSection
        title={m.contribute()}
        description={
          !coffeeAsCard
            ? m.contribute_tab_description_ios()
            : m.contribute_tab_description()
        }
        contentClassName="pt-6"
      >
        <div
          className={coffeeAsCard ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4'}
        >
          {coffeeAsCard && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coffee className="h-4 w-4" />
                  {m.support_the_project()}
                </CardTitle>
                <CardDescription>
                  {m.support_the_project_description()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <a
                    href={BUY_ME_A_COFFEE_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {m.buy_me_a_coffee()} <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-4 w-4" />
                {m.contribute_on_github()}
              </CardTitle>
              <CardDescription>
                {m.contribute_on_github_description()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                  {m.open_github()} <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        {coffeeAsLink && (
          <p className="mt-4 text-sm text-muted-foreground">
            {m.contribute_coffee_prompt()}{' '}
            <a
              href={BUY_ME_A_COFFEE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline hover:text-foreground"
            >
              {m.buy_me_a_coffee()} <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        )}
      </SettingsSection>
    </div>
  );
}
