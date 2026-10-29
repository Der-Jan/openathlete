import { m } from '@/paraglide/messages';
import { ActivityView } from '@/views/dashboard/activity-view';
import { useParams } from 'react-router-dom';

export function ActivityPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const id = Number(eventId);

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <p className="p-4 text-muted-foreground" data-activity-not-found>
        {m.activity_not_found()}
      </p>
    );
  }
  return <ActivityView eventId={id} />;
}
