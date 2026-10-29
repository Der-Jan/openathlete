import { m } from '@/paraglide/messages';
import { computeHoverPin } from '@/utils/map-hover';
import { useMemo, useState } from 'react';

import { ActivityEvent, ActivityStream } from '@openathlete/shared';

import { ActivityStreamsChart } from '../../activity-analysis/activity-streams-chart';
import { LapsCard } from '../../activity-analysis/laps-card';
import { useLapOptions } from '../../activity-analysis/laps-options';
import { PlanBanner } from '../../activity-analysis/plan-banner';
import {
  XAxisKind,
  defaultXAxis,
  xSeries,
} from '../../activity-analysis/stream-range';
import { HeartrateDistributionChart } from '../../charts/heartrate-distribution-chart';
import { ActivityRecordsCharts } from '../../records/activity-records-charts';
import { ChartRecord } from '../../records/record-metrics';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { ActivityDetailsMap } from '../activity-details-map';
import { ActivityDetailsSelectionProvider } from '../activity-details-selection-context';
import { ActivityFeedbackDisplayCard } from '../activity-feedback-display-card';
import { ActivityNormalizationCard } from '../activity-normalization-card';
import { ActivityQuickEditCard } from '../activity-quick-edit-card';
import { ActivityStatistics } from '../activity-statistics';

interface P {
  event: ActivityEvent;
  stream: ActivityStream | undefined;
  isMyActivity: boolean;
  onAnswerFeedback?: () => void;
  onEditFeedback?: () => void;
  onReopenFeedback?: () => void;
}

export function ActivityDetailsOverviewTab({
  event,
  stream,
  isMyActivity,
  onAnswerFeedback,
  onEditFeedback,
  onReopenFeedback,
}: P) {
  const [hover, setHover] = useState<
    undefined | { index: number; time: number }
  >();
  // Until the athlete picks one, the axis follows the data
  const [xAxisChoice, setXAxisChoice] = useState<XAxisKind>();
  const xAxis = xAxisChoice ?? defaultXAxis(stream);

  const hoverPin = useMemo(
    () => computeHoverPin(stream?.latlng, stream?.time, hover),
    [hover, stream],
  );

  const fullDomain: [number, number] | undefined = useMemo(() => {
    const series = xSeries(stream, xAxis);
    return series?.length ? [series[0], series[series.length - 1]] : undefined;
  }, [stream, xAxis]);

  const lapOptions = useLapOptions(event, stream);
  const hasMap = !!stream?.latlng?.length && !!fullDomain;
  const laps = event.segments?.filter(
    (segment) => segment.segmentType === 'LAP',
  );

  const feedbackCard = isMyActivity ? (
    <ActivityQuickEditCard
      event={event}
      isMyActivity={isMyActivity}
      onAnswerFeedback={onAnswerFeedback}
      onEditFeedback={onEditFeedback}
      onReopenFeedback={onReopenFeedback}
    />
  ) : (
    <ActivityFeedbackDisplayCard event={event} />
  );

  const content = (
    <>
      <PlanBanner event={event} options={lapOptions} />
      <Card className="col-span-2 sm:col-span-1">
        <CardHeader>
          <CardTitle>{m.statistics()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ActivityStatistics event={event} stream={stream} />
          </div>
        </CardContent>
      </Card>
      {hasMap && (
        <ActivityDetailsMap
          className="col-span-2 sm:col-span-1 rounded-xl shadow-sm border w-full min-h-[300px]"
          polyline={stream.latlng!}
          pins={hoverPin}
          distance={stream.distance}
          time={stream.time}
        />
      )}
      {feedbackCard}
      {stream?.heartrate && (
        <Card className="col-span-2 sm:col-span-1">
          <CardHeader>
            <CardTitle>{m.heart_rate_distribution()}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <HeartrateDistributionChart
              heartrateStream={stream.heartrate}
              sport={event.sport}
              duration={event.movingTime}
            />
          </CardContent>
        </Card>
      )}
      {stream && (
        <ActivityStreamsChart
          stream={stream}
          sport={event.sport}
          laps={laps}
          onHover={setHover}
        />
      )}
      <LapsCard event={event} options={lapOptions} />
      {!!event.records?.length && (
        <ActivityRecordsCharts
          records={event.records as ChartRecord[]}
          sport={event.sport}
        />
      )}
      <ActivityNormalizationCard event={event} />
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fullDomain ? (
        <ActivityDetailsSelectionProvider
          fullDomain={fullDomain}
          xAxis={xAxis}
          onXAxisChange={setXAxisChoice}
        >
          {content}
        </ActivityDetailsSelectionProvider>
      ) : (
        content
      )}
    </div>
  );
}
