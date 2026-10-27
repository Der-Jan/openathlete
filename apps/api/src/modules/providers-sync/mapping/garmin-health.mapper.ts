import { MetricType } from '@openathlete/database';

import type {
  GarminBloodPressureSummary,
  GarminBodyCompositionSummary,
  GarminDailySummary,
  GarminHealthSnapshotSummary,
  GarminHrvSummary,
  GarminPulseOxSummary,
  GarminRespirationSummary,
  GarminSkinTempSummary,
  GarminSleepSummary,
  GarminUserMetricsSummary,
} from '../../core/types/connector';

export interface GarminMetricRecord {
  type: MetricType;
  date: Date;
  value: number;
}

/**
 * Part of a daily average. Garmin sends all-day respiration and pulse ox as
 * many summaries per day, spread over several pings, and resends a summary
 * when it gets more complete. Each summary is kept under its own key, so the
 * newer version replaces the older one before the day is averaged.
 */
export interface GarminDailyPartial {
  type: MetricType;
  /** YYYY-MM-DD, the user's local day */
  day: string;
  key: string;
  sum: number;
  count: number;
  min: number;
}

function round(value: number, precision = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

function push(
  target: GarminMetricRecord[],
  type: MetricType,
  date: Date | null,
  value?: number | null,
  precision?: number,
) {
  if (!date || value === undefined || value === null) return;
  if (!Number.isFinite(value)) return;
  target.push({
    type,
    date,
    value: precision === undefined ? value : round(value, precision),
  });
}

export function garminCalendarDate(calendarDate?: string): Date | null {
  if (!calendarDate || !/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) return null;
  const date = new Date(`${calendarDate}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The user's local day of a timestamp, as Garmin Connect shows it */
export function garminLocalDay(
  timestampSeconds?: number,
  offsetSeconds?: number,
): string | null {
  if (timestampSeconds === undefined || !Number.isFinite(timestampSeconds)) {
    return null;
  }
  const date = new Date((timestampSeconds + (offsetSeconds ?? 0)) * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function localDayDate(timestampSeconds?: number, offsetSeconds?: number) {
  return garminCalendarDate(
    garminLocalDay(timestampSeconds, offsetSeconds) ?? undefined,
  );
}

function values(data?: Record<string, number>): number[] {
  if (!data) return [];
  return Object.values(data).filter((value) => Number.isFinite(value));
}

function average(list: number[]): number | undefined {
  if (list.length === 0) return undefined;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

const minutes = (seconds?: number | null) =>
  seconds === undefined || seconds === null ? undefined : round(seconds / 60);
const hours = (seconds?: number | null) =>
  seconds === undefined || seconds === null ? undefined : round(seconds / 3600);
const kilos = (grams?: number | null) =>
  grams === undefined || grams === null ? undefined : round(grams / 1000);
// Garmin uses negative stress levels for "not enough data", "off wrist"...
const stress = (level?: number | null) =>
  level === undefined || level === null || level < 0 ? undefined : level;

export function mapGarminDailies(
  summaries: GarminDailySummary[],
): GarminMetricRecord[] {
  const metrics: GarminMetricRecord[] = [];
  for (const summary of summaries) {
    const date = garminCalendarDate(summary.calendarDate);
    if (!date) continue;

    if (
      summary.activeKilocalories !== undefined ||
      summary.bmrKilocalories !== undefined
    ) {
      push(
        metrics,
        MetricType.DAILY_CALORIES,
        date,
        (summary.activeKilocalories ?? 0) + (summary.bmrKilocalories ?? 0),
        0,
      );
    }
    push(
      metrics,
      MetricType.DAILY_ACTIVE_CALORIES,
      date,
      summary.activeKilocalories,
      0,
    );
    push(
      metrics,
      MetricType.DAILY_BMR_CALORIES,
      date,
      summary.bmrKilocalories,
      0,
    );
    push(metrics, MetricType.DAILY_STEPS, date, summary.steps, 0);
    push(
      metrics,
      MetricType.DAILY_DISTANCE,
      date,
      summary.distanceInMeters === undefined
        ? undefined
        : round(summary.distanceInMeters / 1000),
    );
    push(
      metrics,
      MetricType.DAILY_ACTIVE_MINUTES,
      date,
      minutes(summary.activeTimeInSeconds),
    );
    push(
      metrics,
      MetricType.DAILY_MODERATE_MINUTES,
      date,
      minutes(summary.moderateIntensityDurationInSeconds),
    );
    push(
      metrics,
      MetricType.DAILY_VIGOROUS_MINUTES,
      date,
      minutes(summary.vigorousIntensityDurationInSeconds),
    );
    push(metrics, MetricType.DAILY_FLOORS, date, summary.floorsClimbed, 0);
    push(
      metrics,
      MetricType.HR_MIN_DAILY,
      date,
      summary.minHeartRateInBeatsPerMinute,
      0,
    );
    // averageHeartRateInBeatsPerMinute covers the last 7 days: the day's
    // average comes from its 15-second samples
    push(
      metrics,
      MetricType.HR_AVG_DAILY,
      date,
      average(values(summary.timeOffsetHeartRateSamples)),
      0,
    );
    push(
      metrics,
      MetricType.HR_MAX_DAILY,
      date,
      summary.maxHeartRateInBeatsPerMinute,
      0,
    );
    push(
      metrics,
      MetricType.HR_REST,
      date,
      summary.restingHeartRateInBeatsPerMinute,
      0,
    );
    push(
      metrics,
      MetricType.STRESS_AVERAGE,
      date,
      stress(summary.averageStressLevel),
      0,
    );
    push(
      metrics,
      MetricType.STRESS_MAX,
      date,
      stress(summary.maxStressLevel),
      0,
    );
    push(
      metrics,
      MetricType.STRESS_DURATION,
      date,
      minutes(summary.stressDurationInSeconds),
    );
    push(
      metrics,
      MetricType.STRESS_REST_DURATION,
      date,
      minutes(summary.restStressDurationInSeconds),
    );
    push(
      metrics,
      MetricType.STRESS_ACTIVITY_DURATION,
      date,
      minutes(summary.activityStressDurationInSeconds),
    );
    push(
      metrics,
      MetricType.STRESS_LOW_DURATION,
      date,
      minutes(summary.lowStressDurationInSeconds),
    );
    push(
      metrics,
      MetricType.STRESS_MEDIUM_DURATION,
      date,
      minutes(summary.mediumStressDurationInSeconds),
    );
    push(
      metrics,
      MetricType.STRESS_HIGH_DURATION,
      date,
      minutes(summary.highStressDurationInSeconds),
    );
    push(
      metrics,
      MetricType.BODY_BATTERY_CHARGED,
      date,
      summary.bodyBatteryChargedValue,
      0,
    );
    push(
      metrics,
      MetricType.BODY_BATTERY_DRAINED,
      date,
      summary.bodyBatteryDrainedValue,
      0,
    );
  }
  return metrics;
}

export function mapGarminSleeps(
  summaries: GarminSleepSummary[],
): GarminMetricRecord[] {
  const metrics: GarminMetricRecord[] = [];
  for (const summary of summaries) {
    const date = garminCalendarDate(summary.calendarDate);
    if (!date) continue;

    push(
      metrics,
      MetricType.SLEEP_DURATION,
      date,
      hours(summary.durationInSeconds),
    );
    // Off wrist, Garmin only knows when sleep started and ended: its zero
    // stages and score are no data, not a night without deep sleep
    if (summary.validation === 'OFF_WRIST') continue;

    push(
      metrics,
      MetricType.SLEEP_REM_DURATION,
      date,
      hours(summary.remSleepInSeconds),
    );
    push(
      metrics,
      MetricType.SLEEP_DEEP_DURATION,
      date,
      hours(summary.deepSleepDurationInSeconds),
    );
    push(
      metrics,
      MetricType.SLEEP_LIGHT_DURATION,
      date,
      hours(summary.lightSleepDurationInSeconds),
    );
    push(
      metrics,
      MetricType.SLEEP_AWAKE_DURATION,
      date,
      hours(summary.awakeDurationInSeconds),
    );
    push(
      metrics,
      MetricType.NAP_DURATION,
      date,
      hours(summary.totalNapDurationInSeconds),
    );
    push(
      metrics,
      MetricType.SLEEP_SCORE,
      date,
      summary.overallSleepScore?.value,
      0,
    );
    push(
      metrics,
      MetricType.SLEEP_RESPIRATION_AVG,
      date,
      average(values(summary.timeOffsetSleepRespiration)),
    );
    push(
      metrics,
      MetricType.SLEEP_SPO2_AVG,
      date,
      average(values(summary.timeOffsetSleepSpo2)),
    );
  }
  return metrics;
}

/**
 * Several readings can share a day: they are sorted so the day keeps the
 * latest one, whatever the order Garmin lists them in.
 */
function byMeasurementTime<T extends { measurementTimeInSeconds: number }>(
  summaries: T[],
): T[] {
  return [...summaries].sort(
    (a, b) => a.measurementTimeInSeconds - b.measurementTimeInSeconds,
  );
}

export function mapGarminBodyComps(
  summaries: GarminBodyCompositionSummary[],
): GarminMetricRecord[] {
  const metrics: GarminMetricRecord[] = [];
  for (const summary of byMeasurementTime(summaries)) {
    const date = localDayDate(
      summary.measurementTimeInSeconds,
      summary.measurementTimeOffsetInSeconds,
    );
    push(metrics, MetricType.WEIGHT, date, kilos(summary.weightInGrams));
    push(metrics, MetricType.BMI, date, summary.bodyMassIndex);
    push(metrics, MetricType.BODY_FAT, date, summary.bodyFatInPercent);
    push(metrics, MetricType.BODY_WATER, date, summary.bodyWaterInPercent);
    push(
      metrics,
      MetricType.MUSCLE_MASS,
      date,
      kilos(summary.muscleMassInGrams),
    );
    push(metrics, MetricType.BONE_MASS, date, kilos(summary.boneMassInGrams));
  }
  return metrics;
}

export function mapGarminUserMetrics(
  summaries: GarminUserMetricsSummary[],
): GarminMetricRecord[] {
  const metrics: GarminMetricRecord[] = [];
  for (const summary of summaries) {
    const date = garminCalendarDate(summary.calendarDate);
    push(metrics, MetricType.VO2MAX, date, summary.vo2Max);
    push(metrics, MetricType.VO2MAX_CYCLING, date, summary.vo2MaxCycling);
    push(metrics, MetricType.FITNESS_AGE, date, summary.fitnessAge, 0);
  }
  return metrics;
}

const SNAPSHOT_METRICS: Record<string, MetricType> = {
  heart_rate: MetricType.SNAPSHOT_HEART_RATE_AVG,
  stress: MetricType.SNAPSHOT_STRESS_AVG,
  respiration: MetricType.SNAPSHOT_RESPIRATION_AVG,
  spo2: MetricType.SNAPSHOT_SPO2_AVG,
  rmssd_hrv: MetricType.SNAPSHOT_RMSSD,
  sdrr_hrv: MetricType.SNAPSHOT_SDNN,
};

export function mapGarminHealthSnapshots(
  summaries: GarminHealthSnapshotSummary[],
): GarminMetricRecord[] {
  const metrics: GarminMetricRecord[] = [];
  for (const summary of summaries) {
    const date =
      garminCalendarDate(summary.calendarDate) ??
      localDayDate(
        summary.startTimeInSeconds,
        summary.startTimeOffsetInSeconds,
      );
    for (const item of summary.summaries ?? []) {
      const type = SNAPSHOT_METRICS[item.summaryType];
      if (type) push(metrics, type, date, item.avgValue);
    }
  }
  return metrics;
}

export function mapGarminHrv(
  summaries: GarminHrvSummary[],
): GarminMetricRecord[] {
  const metrics: GarminMetricRecord[] = [];
  for (const summary of summaries) {
    const date = garminCalendarDate(summary.calendarDate);
    push(metrics, MetricType.HRV_LAST_NIGHT_AVG, date, summary.lastNightAvg);
    push(
      metrics,
      MetricType.HRV_LAST_NIGHT_5MIN_HIGH,
      date,
      summary.lastNight5MinHigh,
    );
  }
  return metrics;
}

export function mapGarminBloodPressures(
  summaries: GarminBloodPressureSummary[],
): GarminMetricRecord[] {
  const metrics: GarminMetricRecord[] = [];
  for (const summary of byMeasurementTime(summaries)) {
    const date = localDayDate(
      summary.measurementTimeInSeconds,
      summary.measurementTimeOffsetInSeconds,
    );
    push(
      metrics,
      MetricType.BLOOD_PRESSURE_SYSTOLIC,
      date,
      summary.systolic,
      0,
    );
    push(
      metrics,
      MetricType.BLOOD_PRESSURE_DIASTOLIC,
      date,
      summary.diastolic,
      0,
    );
    push(metrics, MetricType.BLOOD_PRESSURE_PULSE, date, summary.pulse, 0);
  }
  return metrics;
}

export function mapGarminSkinTemps(
  summaries: GarminSkinTempSummary[],
): GarminMetricRecord[] {
  const metrics: GarminMetricRecord[] = [];
  for (const summary of summaries) {
    push(
      metrics,
      MetricType.SKIN_TEMP_DEVIATION,
      garminCalendarDate(summary.calendarDate),
      summary.avgDeviationCelsius,
    );
  }
  return metrics;
}

export function garminRespirationPartials(
  summaries: GarminRespirationSummary[],
): GarminDailyPartial[] {
  const partials: GarminDailyPartial[] = [];
  for (const summary of summaries) {
    const day = garminLocalDay(
      summary.startTimeInSeconds,
      summary.startTimeOffsetInSeconds,
    );
    const breaths = values(summary.timeOffsetEpochToBreaths);
    if (!day || breaths.length === 0) continue;
    partials.push({
      type: MetricType.RESPIRATION_RATE_AVG,
      day,
      // Epochs are replaced by start time, as Garmin's updates are
      key: String(summary.startTimeInSeconds),
      sum: breaths.reduce((sum, value) => sum + value, 0),
      count: breaths.length,
      min: Math.min(...breaths),
    });
  }
  return partials;
}

export function garminPulseOxPartials(
  summaries: GarminPulseOxSummary[],
): GarminDailyPartial[] {
  const partials: GarminDailyPartial[] = [];
  for (const summary of summaries) {
    const day =
      (garminCalendarDate(summary.calendarDate) && summary.calendarDate) ||
      garminLocalDay(
        summary.startTimeInSeconds,
        summary.startTimeOffsetInSeconds,
      );
    const spo2 = values(summary.timeOffsetSpo2Values);
    if (!day || spo2.length === 0) continue;
    // All-day and on-demand readings come as separate summaries
    const key = summary.summaryId || `${summary.startTimeInSeconds}`;
    const base = {
      day,
      key,
      sum: spo2.reduce((sum, value) => sum + value, 0),
      count: spo2.length,
      min: Math.min(...spo2),
    };
    partials.push({ ...base, type: MetricType.PULSE_OX_AVG });
    partials.push({ ...base, type: MetricType.PULSE_OX_MIN });
  }
  return partials;
}

/** Turns the partials of a day into its metric: an average, or a minimum */
export function aggregateGarminPartials(
  type: MetricType,
  day: string,
  parts: Pick<GarminDailyPartial, 'sum' | 'count' | 'min'>[],
): GarminMetricRecord | null {
  const date = garminCalendarDate(day);
  const count = parts.reduce((total, part) => total + part.count, 0);
  if (!date || count === 0) return null;
  const value =
    type === MetricType.PULSE_OX_MIN
      ? Math.min(...parts.map((part) => part.min))
      : parts.reduce((total, part) => total + part.sum, 0) / count;
  return { type, date, value: round(value) };
}
