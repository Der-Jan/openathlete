import { m } from '@/paraglide/messages';

import { formatDistance } from '@openathlete/shared';
import { Climb } from '@openathlete/shared';

import { xSeries } from '../activity-analysis/stream-range';
import { Map, MapHighlight } from '../map/map';
import { useActivityDetailsSelection } from './activity-details-selection-context';

type P = {
  className?: string;
  polyline: number[][];
  pins?: number[][];
  distance?: number[];
  time?: number[];
  /** Drawn over the track; picking one selects it on the charts */
  climbs?: Climb[];
};

export function ActivityDetailsMap({
  className,
  polyline,
  pins,
  distance,
  time,
  climbs,
}: P) {
  const { domain, setDomain, xAxis } = useActivityDetailsSelection();
  const series = xSeries({ distance, time }, xAxis);
  const highlights: MapHighlight[] = (climbs ?? []).map((climb, i) => ({
    key: `climb-${i}`,
    path: polyline.slice(climb.start, climb.end + 1),
    label: m.activity_climb_label({
      n: i + 1,
      distance: `${formatDistance(climb.lengthM)} ${m.kilometers()}`,
      grade: `${(climb.grade * 100).toFixed(1)}${m.percent_symbol()}`,
    }),
    onClick: series
      ? () => setDomain([series[climb.start], series[climb.end]])
      : undefined,
  }));
  let focusPolyline: number[][] | undefined = undefined;
  if (domain && polyline?.length) {
    const [from, to] = domain;
    if (series?.length) {
      // lower bound for from
      let lo = 0;
      let hi = series.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (series[mid] < from) lo = mid + 1;
        else hi = mid;
      }
      const startIdx = lo;
      // upper bound for to
      lo = 0;
      hi = series.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (series[mid] > to) hi = mid - 1;
        else lo = mid;
      }
      const endIdx = lo;
      if (startIdx <= endIdx) {
        focusPolyline = polyline.slice(startIdx, endIdx + 1);
      }
    }
  }

  return (
    <Map
      className={className}
      polyline={polyline}
      focusPolyline={focusPolyline}
      pins={pins}
      highlights={highlights}
    />
  );
}
