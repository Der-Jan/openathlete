import { useAiDataSharingMutation } from '@/api/ai-settings';
import { m } from '@/paraglide/messages';
import { toast } from 'sonner';

import { AiAccessDto } from '@openathlete/shared';

/**
 * Whether the user still has to allow their data to be sent to AI providers
 * before an AI feature can run: something is set up, and they have not.
 */
export function needsAiDataSharingConsent(
  access: AiAccessDto | undefined,
): boolean {
  if (!access || access.dataSharingConsent) return false;
  return (
    Object.values(access.tasks).some((task) => task.available) ||
    access.transcriptionProvider !== null
  );
}

/** Saves the user's choice and says what it changes */
export function useSaveAiDataSharingChoice(onSaved?: () => void) {
  const mutation = useAiDataSharingMutation();
  const save = async (allow: boolean) => {
    try {
      await mutation.mutateAsync(allow);
      toast.success(
        allow ? m.ai_sharing_allowed_toast() : m.ai_sharing_withdrawn_toast(),
      );
      onSaved?.();
    } catch {
      toast.error(m.ai_sharing_error());
    }
  };
  return { save, isPending: mutation.isPending };
}
