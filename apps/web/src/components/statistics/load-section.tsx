import { m } from '@/paraglide/messages';

import { TrainingLoadChart } from '../training-load';
import { StatSection } from './stat-section';
import { Period } from './statistics-period';

interface P {
  athleteId: number;
  period: Period | null;
}

export function LoadSection({ athleteId, period }: P) {
  return (
    <StatSection id="load" title={m.statistics_section_load()}>
      {(visible) => (
        <TrainingLoadChart
          athleteId={athleteId}
          period={period}
          enabled={visible}
        />
      )}
    </StatSection>
  );
}
