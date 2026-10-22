import { type ConnectedProvider } from '@/api/provider/provider.api';
import { useSyncStravaMutation } from '@/api/provider/provider.hooks';
import { Button } from '@/components/ui/button';
import { m } from '@/paraglide/messages';
import { isAxiosError } from 'axios';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/** Kept separate from Health: queue acceptance is not an imported-activity count. */
export function StravaSync({ provider }: { provider?: ConnectedProvider }) {
  const sync = useSyncStravaMutation();
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!requested) return;
    const timer = window.setTimeout(() => setRequested(false), 60_000);
    return () => window.clearTimeout(timer);
  }, [requested]);
  if (!provider) return null;
  const ready =
    provider.status === 'active' && provider.importActivitiesEnabled;
  const status = isAxiosError(sync.error)
    ? sync.error.response?.status
    : undefined;
  const error =
    status === 404 || status === 501
      ? m.sync_strava_unavailable()
      : status === 429
        ? m.sync_strava_wait()
        : m.sync_source_failed();
  return (
    <section className="mt-5 space-y-3 border-t pt-4" aria-label="Strava">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Strava</h2>
        <Button
          className="min-h-11"
          disabled={!ready || sync.isPending || requested}
          onClick={() =>
            sync.mutate(undefined, { onSuccess: () => setRequested(true) })
          }
        >
          <RefreshCw
            className={sync.isPending ? 'size-4 animate-spin' : 'size-4'}
          />
          {sync.isPending ? m.sync_source_progress() : m.sync_strava_now()}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{m.sync_strava_help()}</p>
      {!ready && (
        <Link
          className="inline-flex min-h-11 items-center underline"
          to="/dashboard/settings?tab=connectors"
        >
          {m.sync_strava_connection()}
        </Link>
      )}
      {sync.isSuccess && (
        <p role="status" className="text-sm">
          {m.sync_strava_queued()}
        </p>
      )}
      {sync.error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
