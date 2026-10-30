import { useStatisticsLoadQuery } from '@/api/statistics';
import { Card, CardContent } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { SkeletonChart } from '@/components/ui/skeleton';
import * as m from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime';
import { getDateFnsLocale } from '@/utils/locales';
import { TSB_DETRAINING, TSB_OVERREACHING } from '@/utils/training-form';
import { format, parseISO } from 'date-fns';
import { ReactNode, useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';

import { MetricInfo } from '../statistics/metric-info';
import { Period } from '../statistics/statistics-period';

interface TrainingLoadChartProps {
  athleteId: number;
  period: Period | null;
  /** Off until the chart comes near the screen */
  enabled: boolean;
}

const COLORS = {
  load: 'var(--chart-5)',
  ctl: 'var(--chart-1)',
  atl: 'var(--chart-2)',
  tsb: 'var(--chart-3)',
};

const TSB_ZONES = [
  { key: 'overtraining', color: '#ef4444', label: () => m.form_high_fatigue() },
  { key: 'optimal', color: '#22c55e', label: () => m.form_balanced() },
  { key: 'detraining', color: '#3b82f6', label: () => m.form_very_fresh() },
] as const;

type Series = keyof typeof COLORS;

function Legend({
  items,
}: {
  items: {
    key: string;
    color: string;
    label: string;
    value?: number;
    info?: ReactNode;
  }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted-foreground">{item.label}</span>
          {item.value !== undefined && (
            <span className="font-mono font-medium tabular-nums">
              {item.value.toFixed(1)}
            </span>
          )}
          {item.info}
        </li>
      ))}
    </ul>
  );
}

export function TrainingLoadChart({
  athleteId,
  period,
  enabled,
}: TrainingLoadChartProps) {
  const dateFnsLocale = getDateFnsLocale(getLocale());
  const { data, isFetching } = useStatisticsLoadQuery(
    {
      athleteId,
      from: period?.start ?? new Date(0),
      to: period?.end ?? new Date(0),
    },
    enabled && !!period,
  );
  const chartData = useMemo(
    () =>
      (data?.points ?? []).map((point) => ({
        ...point,
        // A plain date: parseISO reads it at local midnight
        date: parseISO(point.date).getTime(),
      })),
    [data],
  );

  const labels: Record<Series, string> = {
    load: data?.granularity === 'week' ? m.weekly_load() : m.daily_load(),
    ctl: m.fitness_ctl(),
    atl: m.fatigue_atl(),
    tsb: m.tsb_balance(),
  };
  const config = Object.fromEntries(
    (Object.keys(COLORS) as Series[]).map((key) => [
      key,
      { label: labels[key], color: COLORS[key] },
    ]),
  );
  // Values at the end of the period, shown next to each legend entry
  const latest = chartData[chartData.length - 1];
  const tickDate = (value: number) =>
    format(new Date(value), 'dd MMM', { locale: dateFnsLocale });
  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => {
            const date = payload?.[0]?.payload?.date;
            return typeof date === 'number'
              ? format(new Date(date), 'dd MMMM yyyy', {
                  locale: dateFnsLocale,
                })
              : '';
          }}
          formatter={(value, name) => (
            <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: COLORS[name as Series] }}
              />
              {labels[name as Series]}
              <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
                {Number(value).toFixed(1)}
              </span>
            </div>
          )}
        />
      }
    />
  );

  const tsbValues = chartData.map((point) => point.tsb);
  const tsbDomain: [number, number] = [
    Math.floor(Math.min(TSB_OVERREACHING - 10, ...tsbValues) / 10) * 10,
    Math.ceil(Math.max(TSB_DETRAINING + 10, ...tsbValues) / 10) * 10,
  ];

  return (
    <Card
      className={`gap-0 py-0 transition-opacity ${isFetching ? 'opacity-70' : ''}`}
    >
      <CardContent className="p-4">
        {!data ? (
          <div className="space-y-6">
            <SkeletonChart className="h-[352px]" />
            <SkeletonChart className="h-[232px]" />
          </div>
        ) : chartData.length > 0 ? (
          <div className="space-y-6">
            {chartData.every((point) => point.load === 0) && (
              <p className="text-sm text-muted-foreground">
                {m.statistics_load_empty()}
              </p>
            )}
            <div className="space-y-3" data-training-load-chart>
              <Legend
                items={(['load', 'ctl', 'atl'] as const).map((key) => ({
                  key,
                  color: COLORS[key],
                  label: labels[key],
                  value: latest?.[key],
                  info: <MetricInfo metric={key === 'load' ? 'trimp' : key} />,
                }))}
              />
              <ChartContainer config={config} className="h-[320px] w-full">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={tickDate}
                    tick={{ fontSize: 11 }}
                    minTickGap={32}
                  />
                  <YAxis width={40} tick={{ fontSize: 11 }} />
                  {tooltip}
                  <Bar
                    dataKey="load"
                    fill={COLORS.load}
                    fillOpacity={0.45}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ctl"
                    stroke={COLORS.ctl}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="atl"
                    stroke={COLORS.atl}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ChartContainer>
            </div>

            <div className="space-y-3" data-tsb-chart>
              <Legend
                items={[
                  {
                    info: <MetricInfo metric="tsb" />,
                    key: 'tsb',
                    color: COLORS.tsb,
                    label: labels.tsb,
                    value: latest?.tsb,
                  },
                  ...TSB_ZONES.map((zone) => ({
                    key: zone.key,
                    color: `${zone.color}33`,
                    label: zone.label(),
                  })),
                ]}
              />
              <ChartContainer config={config} className="h-[200px] w-full">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <ReferenceArea
                    y1={tsbDomain[0]}
                    y2={TSB_OVERREACHING}
                    fill={TSB_ZONES[0].color}
                    fillOpacity={0.1}
                    ifOverflow="hidden"
                  />
                  <ReferenceArea
                    y1={TSB_OVERREACHING}
                    y2={TSB_DETRAINING}
                    fill={TSB_ZONES[1].color}
                    fillOpacity={0.1}
                    ifOverflow="hidden"
                  />
                  <ReferenceArea
                    y1={TSB_DETRAINING}
                    y2={tsbDomain[1]}
                    fill={TSB_ZONES[2].color}
                    fillOpacity={0.1}
                    ifOverflow="hidden"
                  />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={tickDate}
                    tick={{ fontSize: 11 }}
                    minTickGap={32}
                  />
                  <YAxis
                    width={40}
                    tick={{ fontSize: 11 }}
                    domain={tsbDomain}
                    ticks={[TSB_OVERREACHING, 0, TSB_DETRAINING]}
                  />
                  {tooltip}
                  <Line
                    type="monotone"
                    dataKey="tsb"
                    stroke={COLORS.tsb}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {m.no_data_for_period()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
