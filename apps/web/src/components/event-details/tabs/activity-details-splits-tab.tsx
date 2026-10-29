import { m } from '@/paraglide/messages';

import {
  ActivityStream,
  SPORT_TYPE,
  formatSpeed,
  formatSpeedUnit,
  getSportConfig,
  paceDistanceMeters,
} from '@openathlete/shared';

import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { computeSplits } from './compute-splits';

interface P {
  stream: ActivityStream | undefined;
  sport: SPORT_TYPE;
}

export function ActivityDetailsSplitsTab({ stream, sport }: P) {
  const config = getSportConfig(sport);
  const splitMeters = paceDistanceMeters(config.speedUnit);
  const splits = computeSplits(stream, splitMeters);

  const speedLabel = config.speedLabel === 'pace' ? m.pace() : m.speed();
  const speedUnitLabel = formatSpeedUnit(config.speedUnit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.splits()}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {splitMeters === 1000 ? m.kilometers() : m.meters()}
                </TableHead>
                <TableHead>{m.split()}</TableHead>
                <TableHead>
                  {speedLabel} ({speedUnitLabel})
                </TableHead>
                {config.showElevation && (
                  <>
                    <TableHead>
                      {m.elevation_gain()} ({m.meters()})
                    </TableHead>
                    <TableHead>
                      {m.elevation_loss()} ({m.meters()})
                    </TableHead>
                  </>
                )}
                {config.showGap && (
                  <TableHead>
                    {m.gap()} ({speedUnitLabel})
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {splits.map((s) => (
                <TableRow key={s.index}>
                  <TableCell>
                    {splitMeters === 1000 ? s.index : s.index * splitMeters}
                  </TableCell>
                  <TableCell>{formatSec(s.durationSec)}</TableCell>
                  <TableCell>
                    {formatSpeed(s.speedMps, config.speedUnit)}
                  </TableCell>
                  {config.showElevation && (
                    <>
                      <TableCell>
                        {s.ascentM !== undefined ? Math.round(s.ascentM) : '-'}
                      </TableCell>
                      <TableCell>
                        {s.descentM !== undefined
                          ? Math.round(s.descentM)
                          : '-'}
                      </TableCell>
                    </>
                  )}
                  {config.showGap && (
                    <TableCell>
                      {s.gapMps !== undefined
                        ? formatSpeed(s.gapMps, config.speedUnit)
                        : '-'}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function formatSec(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
