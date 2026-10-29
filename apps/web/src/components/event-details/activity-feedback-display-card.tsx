import { athleteAiTaskUsable, useAiAccessQuery } from '@/api/ai-settings';
import { AiSetupDialog } from '@/components/ai-settings';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { m } from '@/paraglide/messages';
import { useState } from 'react';

import {
  ActivityEvent,
  ActivityFeedbackQuestion,
  AiTask,
} from '@openathlete/shared';

import { ActivityAiNotes } from './activity-ai-notes';

interface P {
  event: ActivityEvent;
}

export function ActivityFeedbackDisplayCard({ event }: P) {
  const questions = event.feedbackQuestions ?? [];
  const answeredQuestions = questions.filter(
    (q: ActivityFeedbackQuestion) =>
      q.answerText !== null && q.answerText !== '',
  );
  // Questions run on the athlete's or a coach's AI key, or hosted AI
  const { data: aiAccess } = useAiAccessQuery(event.athleteId ?? undefined);
  const [aiSetupOpen, setAiSetupOpen] = useState(false);

  // No AI for the athlete and no questions were generated
  const hasNoAccess =
    athleteAiTaskUsable(aiAccess, AiTask.POST_ACTIVITY_QUESTIONS) === false;
  const hasNoQuestions = questions.length === 0;
  const showPaywallAlert = hasNoAccess && hasNoQuestions;

  return (
    <>
      <Card className="flex flex-col col-span-2 sm:col-span-1">
        <CardHeader>
          <CardTitle>{m.activity_feedback_completed_via_questions()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {showPaywallAlert && (
            <Alert className="mb-4">
              <SparklesIcon className="h-4 w-4" />
              <AlertTitle>{m.ai_feedback_questions_off_title()}</AlertTitle>
              <AlertDescription className="mt-2 flex flex-col gap-3">
                <span>{m.ai_feedback_questions_off_description()}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setAiSetupOpen(true)}
                >
                  {m.ai_setup_title()}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {answeredQuestions.map((question: ActivityFeedbackQuestion) => (
            <div
              key={question.activityFeedbackQuestionId}
              className="space-y-2"
            >
              <p className="text-sm font-medium">{question.questionText}</p>
              <p className="text-sm text-muted-foreground">
                {question.answerText}
              </p>
            </div>
          ))}
          {answeredQuestions.length > 0 && (
            <div className="pt-4 border-t">
              <ActivityAiNotes event={event} />
            </div>
          )}
          {answeredQuestions.length === 0 && !showPaywallAlert && (
            <p className="text-sm text-muted-foreground">
              {m.activity_feedback_no_feedback()}
            </p>
          )}
          {event.description && event.description.trim() !== '' && (
            <div className="space-y-2 pt-4 border-t">
              <p className="text-sm font-medium">{m.description()}</p>
              <p className="text-sm text-muted-foreground">
                {event.description}
              </p>
            </div>
          )}
          {event.rpe !== null && event.rpe !== undefined && (
            <div className="space-y-2 pt-4 border-t">
              <p className="text-sm font-medium">{m.rpe()}</p>
              <p className="text-sm text-muted-foreground">
                {Math.round(event.rpe * 10)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <AiSetupDialog
        open={aiSetupOpen}
        onOpenChange={setAiSetupOpen}
        analyticsSource="activity_feedback_display"
      />
    </>
  );
}
