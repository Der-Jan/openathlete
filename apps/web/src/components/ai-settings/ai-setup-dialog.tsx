import { useAiAccessQuery } from '@/api/ai-settings';
import { PaywallDialog } from '@/components/paywall';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { m } from '@/paraglide/messages';
import { getPath } from '@/routes/paths';
import { purchaseChannel } from '@/utils/capacitor';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AiConsentPrompt } from './ai-data-sharing';
import { needsAiDataSharingConsent } from './ai-data-sharing.hooks';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the dialog was opened from (PostHog, via the paywall). */
  analyticsSource?: string;
}

/**
 * Shown when an AI feature cannot run: asks the user to allow their data to
 * be sent to the AI provider when that is all that is missing; otherwise
 * points to the AI settings, and to the plans when subscribing includes AI.
 */
export function AiSetupDialog({ open, onOpenChange, analyticsSource }: Props) {
  const navigate = useNavigate();
  const { data: access } = useAiAccessQuery();
  const [plansOpen, setPlansOpen] = useState(false);
  const canSubscribe =
    Boolean(access?.upgradeUnlocksHosted) && purchaseChannel() !== null;

  if (needsAiDataSharingConsent(access)) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{m.ai_sharing_ask_title()}</DialogTitle>
            <DialogDescription>
              {m.ai_sharing_ask_description()}
            </DialogDescription>
          </DialogHeader>
          <AiConsentPrompt
            access={access!}
            onDone={() => onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{m.ai_setup_title()}</DialogTitle>
            <DialogDescription>{m.ai_setup_description()}</DialogDescription>
          </DialogHeader>
          {canSubscribe && (
            <p className="text-sm text-muted-foreground">
              {m.ai_setup_or_subscribe()}
            </p>
          )}
          <DialogFooter className="gap-2">
            {canSubscribe && (
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  setPlansOpen(true);
                }}
              >
                {m.ai_setup_view_plans()}
              </Button>
            )}
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate(`${getPath(['dashboard', 'settings'])}?tab=ai`);
              }}
            >
              {m.ai_setup_open_settings()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PaywallDialog
        open={plansOpen}
        onOpenChange={setPlansOpen}
        reason="ai-feature"
        analyticsSource={analyticsSource}
      />
    </>
  );
}
