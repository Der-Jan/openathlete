import { useAiProvidersQuery } from '@/api/ai-settings';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { privacyPolicyUrl } from '@/utils/consent';

import { AiAccessDto, CUSTOM_AI_PROVIDER } from '@openathlete/shared';

import { useSaveAiDataSharingChoice } from './ai-data-sharing.hooks';

/** Who receives the data: each provider once, with how it is reached. */
function useRecipients(access: AiAccessDto): string[] {
  const { data: providers } = useAiProvidersQuery();
  const nameOf = (id: string) =>
    id === CUSTOM_AI_PROVIDER
      ? m.ai_sharing_custom_endpoint()
      : (providers?.find((provider) => provider.id === id)?.name ?? id);

  const recipients = new Set<string>();
  for (const task of Object.values(access.tasks)) {
    if (!task.available || !task.provider) continue;
    const source =
      task.source === 'hosted'
        ? m.ai_sharing_source_hosted()
        : m.ai_sharing_source_own();
    recipients.add(`${nameOf(task.provider)} (${source})`);
  }
  if (access.transcriptionProvider) {
    recipients.add(
      `${nameOf(access.transcriptionProvider)} (${m.ai_sharing_source_voice()})`,
    );
  }
  return [...recipients];
}

/**
 * What AI features send and to whom, as App Store guideline 5.1.2(i) and the
 * GDPR require the user to see before allowing it.
 */
export function AiDataSharingDetails({ access }: { access: AiAccessDto }) {
  const recipients = useRecipients(access);
  const privacyUrl = privacyPolicyUrl();
  const items = [
    m.ai_sharing_item_plan(),
    m.ai_sharing_item_activities(),
    m.ai_sharing_item_metrics(),
    m.ai_sharing_item_notes(),
    ...(access.transcriptionProvider ? [m.ai_sharing_item_voice()] : []),
  ];

  return (
    <div className="space-y-4 text-sm" data-ai-data-sharing>
      <div className="space-y-1.5">
        <p className="font-medium">{m.ai_sharing_what()}</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="space-y-1.5">
        <p className="font-medium">{m.ai_sharing_who()}</p>
        {recipients.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {recipients.map((recipient) => (
              <li key={recipient}>{recipient}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{m.ai_sharing_none()}</p>
        )}
      </div>
      <p className="text-muted-foreground">
        {m.ai_sharing_use()}
        {privacyUrl && (
          <>
            {' '}
            <a
              href={privacyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              {m.app_store_privacy_policy()}
            </a>
          </>
        )}
      </p>
    </div>
  );
}

/** The question itself, inside AiSetupDialog */
export function AiConsentPrompt({
  access,
  onDone,
}: {
  access: AiAccessDto;
  onDone: () => void;
}) {
  const { save, isPending } = useSaveAiDataSharingChoice(onDone);
  return (
    <div className="space-y-5">
      <AiDataSharingDetails access={access} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDone} disabled={isPending}>
          {m.ai_sharing_not_now()}
        </Button>
        <Button onClick={() => save(true)} disabled={isPending}>
          {m.ai_sharing_allow()}
        </Button>
      </div>
    </div>
  );
}
