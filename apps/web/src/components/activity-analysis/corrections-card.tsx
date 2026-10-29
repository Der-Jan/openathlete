import {
  useAddActivityCorrectionMutation,
  useRemoveActivityCorrectionMutation,
} from '@/api/event';
import { m } from '@/paraglide/messages';
import { getLocale } from '@/paraglide/runtime';
import { Crop, Mountain, RotateCcw, Undo2, Zap } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';

import {
  ActivityCorrection,
  ActivityEvent,
  ActivityStream,
  StoredActivityCorrection,
  findSpikes,
  formatDuration,
} from '@openathlete/shared';

import { useActivityDetailsSelection } from '../event-details/activity-details-selection-context';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { indexRange, xSeries } from './stream-range';

const describe = (correction: StoredActivityCorrection) => {
  switch (correction.type) {
    case 'despike':
      return correction.channel === 'heartrate'
        ? m.activity_correction_despike_heartrate_done()
        : m.activity_correction_despike_watts_done();
    case 'crop':
      return m.activity_correction_crop_done({
        from: formatDuration(correction.from),
        to: formatDuration(correction.to),
      });
    case 'smoothAltitude':
      return m.activity_correction_smooth_altitude_done();
  }
};

interface P {
  event: ActivityEvent;
  stream: ActivityStream;
}

/**
 * Fixes for a recording gone wrong: spikes of a sensor, a watch stopped
 * late, noisy altitude. Each is undone on its own, and the recording as it
 * came stays one click away.
 */
export function CorrectionsCard({ event, stream }: P) {
  const { domain, xAxis, reset } = useActivityDetailsSelection();
  const corrections = (event.corrections ??
    []) as unknown as StoredActivityCorrection[];
  const onError = () => toast.error(m.activity_corrections_failed());
  const add = useAddActivityCorrectionMutation({
    onSuccess: () => {
      reset();
      toast.success(m.activity_corrections_saved());
    },
    onError,
  });
  const remove = useRemoveActivityCorrectionMutation({
    onSuccess: () => toast.success(m.activity_corrections_saved()),
    onError,
  });
  const busy = add.isPending || remove.isPending;

  const spikes = useMemo(
    () => ({
      heartrate: stream.heartrate
        ? findSpikes(stream.heartrate, 'heartrate').length
        : 0,
      watts: stream.watts ? findSpikes(stream.watts, 'watts').length : 0,
    }),
    [stream],
  );

  // A crop is in seconds of the recording as it now stands
  const crop = useMemo(() => {
    const time = stream.time;
    const series = xSeries(stream, xAxis);
    const range = domain && series && indexRange(series, domain);
    if (!range || !time) return null;
    return { from: time[range[0]], to: time[range[1]] };
  }, [domain, stream, xAxis]);

  const apply = (correction: ActivityCorrection) =>
    add.mutate({ eventId: event.eventId, correction });
  const smoothed = corrections.some((c) => c.type === 'smoothAltitude');

  return (
    <Card className="col-span-2" data-corrections>
      <CardHeader className="space-y-1">
        <CardTitle>{m.activity_corrections_title()}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {m.activity_corrections_hint()}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {spikes.heartrate > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => apply({ type: 'despike', channel: 'heartrate' })}
              data-correction="despike-heartrate"
            >
              <Zap className="size-4" />
              {m.activity_corrections_despike_heartrate({
                count: spikes.heartrate,
              })}
            </Button>
          )}
          {spikes.watts > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => apply({ type: 'despike', channel: 'watts' })}
              data-correction="despike-watts"
            >
              <Zap className="size-4" />
              {m.activity_corrections_despike_watts({ count: spikes.watts })}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !crop}
            title={crop ? undefined : m.activity_corrections_crop_hint()}
            onClick={() => crop && apply({ type: 'crop', ...crop })}
            data-correction="crop"
          >
            <Crop className="size-4" />
            {m.activity_corrections_crop()}
          </Button>
          {!!stream.altitude?.length && !smoothed && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => apply({ type: 'smoothAltitude' })}
              data-correction="smooth-altitude"
            >
              <Mountain className="size-4" />
              {m.activity_corrections_smooth_altitude()}
            </Button>
          )}
        </div>
        {!crop && (
          <p className="text-xs text-muted-foreground">
            {m.activity_corrections_crop_hint()}
          </p>
        )}

        {corrections.length > 0 && (
          <div className="space-y-2" data-applied-corrections>
            <p className="text-sm font-medium">
              {m.activity_corrections_applied()}
            </p>
            <ul className="divide-y rounded-md border">
              {corrections.map((correction, index) => (
                <li
                  key={`${correction.type}-${correction.at}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span>
                    {describe(correction)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(correction.at).toLocaleDateString(getLocale())}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      remove.mutate({ eventId: event.eventId, index })
                    }
                  >
                    <Undo2 className="size-4" />
                    {m.activity_correction_undo()}
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => remove.mutate({ eventId: event.eventId })}
              data-correction="restore"
            >
              <RotateCcw className="size-4" />
              {m.activity_corrections_restore()}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
