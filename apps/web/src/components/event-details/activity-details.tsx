import { useGetMyAthleteQuery } from '@/api/athlete';
import { useGetEventStreamQuery, useGetEventWeatherQuery } from '@/api/event';
import { m } from '@/paraglide/messages';
import { useMemo, useState } from 'react';

import {
  ActivityEvent,
  getSportConfig,
  paceDistanceMeters,
} from '@openathlete/shared';

import { ActivityFeedbackOverlay } from '../activity-feedback/activity-feedback-overlay';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ActivityDetailsOverviewTab } from './tabs/activity-details-overview-tab';
import { ActivityDetailsSplitsTab } from './tabs/activity-details-splits-tab';
import { ActivityDetailsWeatherTab } from './tabs/activity-details-weather-tab';

interface P {
  event: ActivityEvent;
}

export function ActivityDetails({ event }: P) {
  const { data: athlete } = useGetMyAthleteQuery();
  // The post-activity questions open on request, never in front of the data
  const [feedbackMode, setFeedbackMode] = useState<'answer' | 'edit' | null>(
    null,
  );
  const isMyActivity = athlete?.athleteId === event.athleteId;
  const { data: stream } = useGetEventStreamQuery(event.eventId, 3000, [
    'altitude',
    'latlng',
    'heartrate',
    'distance',
    'time',
    'watts',
    'gap',
    'temp',
    'cadence',
  ]);
  const sportConfig = getSportConfig(event.sport);
  const hasSplits = useMemo(() => {
    if (!sportConfig.showSplits) return false;
    const d = stream?.distance;
    if (!d?.length) return false;
    const lastDistance = d[d.length - 1] ?? 0;
    return lastDistance >= paceDistanceMeters(sportConfig.speedUnit);
  }, [stream?.distance, sportConfig.showSplits, sportConfig.speedUnit]);

  const { data: weather } = useGetEventWeatherQuery(event.eventId, {
    retry: 1,
  });

  return (
    <>
      {isMyActivity && feedbackMode && (
        <ActivityFeedbackOverlay
          event={event}
          onSkip={() => setFeedbackMode(null)}
          isEditMode={feedbackMode === 'edit'}
          skipIntroScreen
        />
      )}

      {!(isMyActivity && feedbackMode) && (
        <Tabs defaultValue="overview" className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="overview">{m.overview()}</TabsTrigger>
            {hasSplits && (
              <TabsTrigger value="splits">{m.splits()}</TabsTrigger>
            )}
            {weather && (
              <TabsTrigger value="weather">{m.weather()}</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="overview">
            <ActivityDetailsOverviewTab
              event={event}
              stream={stream}
              isMyActivity={athlete?.athleteId === event.athleteId}
              onAnswerFeedback={() => setFeedbackMode('answer')}
              onEditFeedback={() => setFeedbackMode('edit')}
              onReopenFeedback={() => setFeedbackMode('edit')}
            />
          </TabsContent>
          {hasSplits && (
            <TabsContent value="splits">
              <ActivityDetailsSplitsTab stream={stream} sport={event.sport} />
            </TabsContent>
          )}
          {weather && (
            <TabsContent value="weather">
              <ActivityDetailsWeatherTab data={weather} stream={stream} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </>
  );
}
