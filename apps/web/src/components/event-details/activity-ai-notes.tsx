import { athleteAiTaskUsable, useAiAccessQuery } from '@/api/ai-settings';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { m } from '@/paraglide/messages';
import { getPainScoreColor } from '@/utils/color';
import { injuryStatusLabelMap } from '@/utils/label-map/core';
import { cn } from '@/utils/shadcn';

import { ActivityEvent, AiTask } from '@openathlete/shared';

interface P {
  event: ActivityEvent;
}

/**
 * What the AI read in the answers to the post-activity questions: the pain
 * it noted, or that there was none. It feeds the injury logs and the coach's
 * alerts, so the athlete and the coach see it where it comes from.
 */
export function ActivityAiNotes({ event }: P) {
  const { data: aiAccess } = useAiAccessQuery(event.athleteId ?? undefined);
  const answered = (event.feedbackQuestions ?? []).some(
    (question) => question.answerText,
  );
  const analysed = !!event.feedbackAnalyzedAt;
  const injuries = event.extractedInjuries ?? [];

  if (!answered) return null;
  // Without AI for the analysis, or the athlete's permission to send it
  // their answers, it never runs: no "reading" forever
  if (!analysed && !athleteAiTaskUsable(aiAccess, AiTask.FEEDBACK_EXTRACTION)) {
    return null;
  }

  return (
    <div className="space-y-2" data-activity-ai-notes>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <SparklesIcon className="h-4 w-4" />
        {m.activity_ai_notes_title()}
      </p>
      {!analysed ? (
        <p className="text-sm text-muted-foreground">
          {m.activity_ai_notes_pending()}
        </p>
      ) : injuries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {m.activity_ai_notes_none()}
        </p>
      ) : (
        <ul className="space-y-2">
          {injuries.map((injury) => (
            <li key={injury.athleteInjuryId} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium capitalize">
                  {injury.location}
                </span>
                <span
                  className={cn(
                    'rounded-md border px-1.5 text-xs tabular-nums',
                    getPainScoreColor(injury.painScore),
                  )}
                >
                  {m.activity_ai_notes_pain({
                    score: Math.round(injury.painScore * 10),
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {injuryStatusLabelMap[injury.status]}
                </span>
              </div>
              {injury.context && (
                <p className="text-muted-foreground">{injury.context}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
