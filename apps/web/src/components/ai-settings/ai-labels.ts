import { m } from '@/paraglide/messages';

import { AiProvider, AiTask } from '@openathlete/shared';

export function aiTaskLabel(task: AiTask): string {
  switch (task) {
    case AiTask.DEFAULT:
      return m.ai_task_default();
    case AiTask.EVENT_GENERATION:
      return m.ai_task_event_generation();
    case AiTask.EVENT_MODIFICATION:
      return m.ai_task_event_modification();
    case AiTask.POST_ACTIVITY_QUESTIONS:
      return m.ai_task_post_activity_questions();
    case AiTask.FEEDBACK_EXTRACTION:
      return m.ai_task_feedback_extraction();
    case AiTask.TRAINING_LOAD_ESTIMATION:
      return m.ai_task_training_load_estimation();
    case AiTask.ACTIVITY_SUMMARY:
      return m.ai_task_activity_summary();
  }
}

/** Display name of a provider id, falling back to the id itself. */
export function aiProviderName(
  providers: AiProvider[] | undefined,
  providerId: string,
): string {
  return providers?.find((item) => item.id === providerId)?.name ?? providerId;
}
