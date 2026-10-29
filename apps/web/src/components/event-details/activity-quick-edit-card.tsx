import {
  useGetActivityFeedbackQuestionsQuery,
  useSkipFeedbackMutation,
  useUnskipFeedbackMutation,
} from '@/api/activity-feedback';
import { athleteAiTaskUsable, useAiAccessQuery } from '@/api/ai-settings';
import { useUpdateEventMutation } from '@/api/event';
import { AiSetupDialog } from '@/components/ai-settings';
import { FormProvider, RHFRpe, RHFTextarea } from '@/components/hook-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SparklesIcon } from '@/components/ui/sparkles-icon';
import { m } from '@/paraglide/messages';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ActivityEvent, AiTask } from '@openathlete/shared';

import { ActivityAiNotes } from './activity-ai-notes';

const quickEditSchema = z.object({
  description: z.string().optional(),
  rpe: z.number().min(0).max(1).optional().nullable(),
});

type QuickEditFormValues = z.infer<typeof quickEditSchema>;

interface P {
  event: ActivityEvent;
  isMyActivity?: boolean;
  onAnswerFeedback?: () => void;
  onEditFeedback?: () => void;
  onReopenFeedback?: () => void;
}

export function ActivityQuickEditCard({
  event,
  isMyActivity = false,
  onAnswerFeedback,
  onEditFeedback,
  onReopenFeedback,
}: P) {
  const { data: feedbackData } = useGetActivityFeedbackQuestionsQuery(
    event.eventId,
    isMyActivity,
  );
  const unskipMutation = useUnskipFeedbackMutation(event.eventId);
  const skipMutation = useSkipFeedbackMutation(event.eventId);
  // Questions run on the athlete's or a coach's AI key, or hosted AI
  const { data: aiAccess } = useAiAccessQuery(event.athleteId ?? undefined);
  const [aiSetupOpen, setAiSetupOpen] = useState(false);

  const questions = feedbackData?.questions ?? [];
  const feedbackSkipped = feedbackData?.feedbackSkipped ?? false;
  const allAnswered =
    questions.length > 0 && questions.every((q) => q.answerText !== null);
  const hasQuestions = questions.length > 0;

  // Check if athlete or coach has access and no questions were generated
  const hasNoAccess =
    athleteAiTaskUsable(aiAccess, AiTask.POST_ACTIVITY_QUESTIONS) === false;
  const hasNoQuestions = questions.length === 0;
  const showPaywallAlert = hasNoAccess && hasNoQuestions;

  const handleReopenFeedback = async () => {
    try {
      await unskipMutation.mutateAsync();
      onReopenFeedback?.();
    } catch (error) {
      console.error('Failed to reopen feedback:', error);
      toast.error(m.failed_to_reopen_feedback());
    }
  };

  const handleEditFeedback = () => {
    onEditFeedback?.();
  };
  const updateEventMutation = useUpdateEventMutation({
    onSuccess: () => {
      toast.success(m.activity_updated_successfully());
    },
    onError: () => {
      toast.error(m.failed_to_update_activity());
    },
  });

  const methods = useForm<QuickEditFormValues>({
    resolver: zodResolver(quickEditSchema),
    defaultValues: {
      description: event.description ?? '',
      rpe: event.rpe ?? undefined,
    },
  });

  const onSubmit = (values: QuickEditFormValues) => {
    updateEventMutation.mutate({
      eventId: event.eventId,
      body: {
        type: event.type,
        description: values.description,
        rpe: values.rpe,
      },
    });
  };

  return (
    <>
      <Card className="flex flex-col col-span-2 sm:col-span-1">
        <CardHeader>
          <CardTitle>{m.quick_edit()}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
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
          {isMyActivity && hasQuestions && (
            <div className="mb-4 pb-4 border-b">
              {feedbackSkipped ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {m.activity_feedback_skipped()}
                  </p>
                  <Button
                    onClick={handleReopenFeedback}
                    variant="outline"
                    size="sm"
                    disabled={unskipMutation.isPending}
                    className="w-full sm:w-auto"
                  >
                    {m.activity_feedback_reopen()}
                  </Button>
                </div>
              ) : !allAnswered ? (
                <div
                  className="flex flex-col gap-3"
                  data-activity-feedback-pending
                >
                  <p className="text-sm font-medium">
                    {m.activity_feedback_ready()}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={onAnswerFeedback}
                      size="sm"
                      className="w-full sm:w-auto"
                    >
                      {m.activity_feedback_start()}
                    </Button>
                    <Button
                      onClick={() =>
                        skipMutation.mutate(undefined, {
                          onError: () =>
                            toast.error(m.failed_to_update_activity()),
                        })
                      }
                      variant="outline"
                      size="sm"
                      disabled={skipMutation.isPending}
                      className="w-full sm:w-auto"
                    >
                      {skipMutation.isPending
                        ? m.activity_feedback_skipping()
                        : m.activity_feedback_skip()}
                    </Button>
                  </div>
                </div>
              ) : allAnswered ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {m.activity_feedback_completed_via_questions()}
                    </p>
                    <Button
                      onClick={handleEditFeedback}
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                    >
                      {m.activity_feedback_edit()}
                    </Button>
                  </div>
                  <ActivityAiNotes event={event} />
                </div>
              ) : null}
            </div>
          )}

          <FormProvider
            methods={methods}
            onSubmit={methods.handleSubmit(onSubmit)}
            className="flex-1 flex flex-col"
          >
            <div className="space-y-4 flex-1 flex flex-col">
              <RHFTextarea
                name="description"
                label={m.description()}
                placeholder={m.activity_description_placeholder()}
                rows={3}
                className="min-h-[70px]"
              />
              <RHFRpe name="rpe" label={m.rpe()} />
              <div className="flex justify-end mt-auto">
                <Button
                  type="submit"
                  disabled={updateEventMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {updateEventMutation.isPending
                    ? m.save() + '...'
                    : m.submit()}
                </Button>
              </div>
            </div>
          </FormProvider>
        </CardContent>
      </Card>
      <AiSetupDialog
        open={aiSetupOpen}
        onOpenChange={setAiSetupOpen}
        analyticsSource="activity_quick_edit"
      />
    </>
  );
}
