import { eventKeys } from '@/api/event/event.keys';
import { GarminPersonalAPI } from '@/api/garmin-personal/garmin-personal.api';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { sportTypeLabelMap } from '@/utils/label-map/core/sport-type.label-map';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { GarminPersonalReviewSummary } from '@openathlete/shared';

function Recording({ summary }: { summary: GarminPersonalReviewSummary }) {
  const minutes =
    (Date.parse(summary.endDate) - Date.parse(summary.startDate)) / 60000;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt>{m.garmin_personal_start()}</dt>
      <dd>
        {new Date(summary.startDate).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </dd>
      <dt>{m.garmin_review_sport()}</dt>
      <dd>{sportTypeLabelMap[summary.sport]}</dd>
      <dt>{m.garmin_review_distance()}</dt>
      <dd>
        {(summary.distance / 1000).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })}{' '}
        km
      </dd>
      <dt>{m.garmin_review_duration()}</dt>
      <dd>
        {minutes.toLocaleString(undefined, { maximumFractionDigits: 1 })} min
      </dd>
    </dl>
  );
}

export function GarminPersonalReviews({
  userId,
  allowImport,
  lastSyncedAt,
  onCountChange,
}: {
  userId: number;
  allowImport: boolean;
  lastSyncedAt: string | null;
  onCountChange: (count: number) => void;
}) {
  const cache = useQueryClient();
  const queryKey = ['garmin-personal-reviews', userId];
  const reviews = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => GarminPersonalAPI.reviews(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const refresh = () => {
    void cache.invalidateQueries({ queryKey });
  };
  useEffect(() => {
    void cache.invalidateQueries({
      queryKey: ['garmin-personal-reviews', userId],
    });
  }, [cache, userId, lastSyncedAt]);
  const total = reviews.data?.pages[0]?.total;
  useEffect(() => {
    if (total !== undefined) onCountChange(total);
  }, [total, onCountChange]);
  const failed = () => {
    toast.error(m.garmin_review_failed());
    refresh();
    void cache.invalidateQueries({ queryKey: ['garmin-personal', userId] });
  };
  const preview = useMutation({
    mutationFn: GarminPersonalAPI.previewReview,
    onSuccess: refresh,
    onError: failed,
  });
  const resolve = useMutation({
    mutationFn: GarminPersonalAPI.resolveReview,
    onSuccess: (result) => {
      refresh();
      void cache.invalidateQueries({ queryKey: [eventKeys.getMyEvents] });
      if (result.pending) toast.info(m.garmin_review_processing());
    },
    onError: failed,
  });
  const busy = preview.isPending || resolve.isPending;
  if (reviews.isPending) return <p>{m.garmin_personal_loading()}</p>;
  if (reviews.isError)
    return (
      <div role="alert">
        <p>{m.garmin_review_failed()}</p>
        <Button variant="outline" onClick={() => void reviews.refetch()}>
          {m.garmin_review_retry()}
        </Button>
      </div>
    );
  if (!total) return null;
  return (
    <section
      aria-label={m.garmin_review_title()}
      className="space-y-4 border-t pt-4 ph-no-capture ph-mask"
      data-cs-mask="true"
    >
      <h3 className="font-semibold">
        {m.garmin_review_title()} ({total})
      </h3>
      <p className="text-sm text-muted-foreground">{m.garmin_review_help()}</p>
      {reviews.data.pages
        .flatMap((page) => page.items)
        .map((item) => (
          <article key={item.id} className="space-y-3 rounded-lg border p-3">
            <h4 className="font-medium">
              {item.summary?.name ?? `Garmin ${item.externalId}`}
            </h4>
            {item.summary ? (
              <>
                <p className="text-sm font-medium">
                  {m.garmin_review_recording()}
                </p>
                <Recording summary={item.summary} />
                {item.candidates.length ? (
                  item.candidates.map((candidate) => (
                    <div
                      key={candidate.eventActivityId}
                      className="space-y-2 rounded-md border p-3"
                    >
                      <p className="text-sm font-medium">
                        {m.garmin_review_existing()}: {candidate.name}{' '}
                        {candidate.provider ? `(${candidate.provider})` : ''}
                      </p>
                      <Recording summary={candidate} />
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          resolve.mutate({
                            id: item.id,
                            action: 'link',
                            eventActivityId: candidate.eventActivityId,
                          })
                        }
                      >
                        {m.garmin_review_link()}
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm">{m.garmin_review_no_candidates()}</p>
                )}
              </>
            ) : (
              <Button
                variant="outline"
                disabled={busy || !allowImport}
                onClick={() => preview.mutate(item.id)}
              >
                {m.garmin_review_load()}
              </Button>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy || !allowImport || !item.summary}
                onClick={() =>
                  resolve.mutate({ id: item.id, action: 'import' })
                }
              >
                {m.garmin_review_import()}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  resolve.mutate({ id: item.id, action: 'ignore' })
                }
              >
                {m.garmin_review_ignore()}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {m.garmin_review_ignore_hint()}
            </p>
          </article>
        ))}
      {reviews.hasNextPage && (
        <Button
          variant="outline"
          disabled={reviews.isFetchingNextPage}
          onClick={() => void reviews.fetchNextPage()}
        >
          {m.garmin_review_more()}
        </Button>
      )}
    </section>
  );
}
