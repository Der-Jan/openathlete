import { m } from '@/paraglide/messages';
import { cn } from '@/utils/shadcn';
import { CalendarCheck } from 'lucide-react';
import { useMemo } from 'react';

import { ActivityEvent } from '@openathlete/shared';

import {
  complianceAgainstGoals,
  complianceDotClass,
  isShownCompliance,
} from '../calendar/utils/compliance';
import {
  complianceLabel,
  complianceRatioLabel,
} from '../calendar/utils/compliance-labels';
import { LapOptions, lapRows, stepsOnTarget } from './laps';

interface P {
  event: ActivityEvent;
  options: LapOptions;
}

/**
 * How the activity went against the session it was planned as: the same
 * grade as the calendar card, and how many work steps met their target.
 */
export function PlanBanner({ event, options }: P) {
  const planned = event.plannedSession;
  const steps = useMemo(
    () => stepsOnTarget(lapRows('plan', options)),
    [options],
  );
  if (!planned) return null;

  const compliance = complianceAgainstGoals(planned, event);
  const ratio = complianceRatioLabel(compliance);

  return (
    <section
      className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm"
      data-plan-banner={compliance.status}
    >
      <span className="flex min-w-0 items-center gap-2 font-medium">
        <CalendarCheck className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {m.activity_plan_title({ name: planned.name })}
        </span>
      </span>
      {isShownCompliance(compliance) && (
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'size-2 rounded-full',
              complianceDotClass[compliance.status],
            )}
          />
          {complianceLabel[compliance.status]()}
          {ratio && <span className="text-muted-foreground">· {ratio}</span>}
        </span>
      )}
      {steps.graded > 0 && (
        <span className="text-muted-foreground" data-plan-steps>
          {m.activity_plan_steps_on_target({
            onTarget: steps.onTarget,
            graded: steps.graded,
          })}
        </span>
      )}
    </section>
  );
}
