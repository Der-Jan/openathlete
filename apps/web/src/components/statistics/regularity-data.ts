import { StatisticsDaysDto } from '@openathlete/shared';

type Day = StatisticsDaysDto['days'][number];

const DAY_MS = 24 * 3600 * 1000;

const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const key = (time: number) => new Date(time).toISOString().slice(0, 10);

export interface CalendarCell {
  date: string;
  /** 0 for rest, then 1 to 4 from the athlete's own days of the year */
  level: number;
  movingTime: number;
}

/**
 * Weeks of a year, Monday first, each a column of the calendar. Levels are
 * quartiles of the athlete's active days: a beginner's calendar reads as well
 * as a professional's.
 */
export function calendarWeeks(
  days: Day[],
  year: number,
): { weeks: (CalendarCell | null)[][]; activeWeeks: number } {
  const inYear = days.filter(({ date }) => date.startsWith(`${year}-`));
  const byDate = new Map(inYear.map((day) => [day.date, day]));
  const sorted = inYear.map((day) => day.movingTime).sort((a, b) => a - b);
  const quartile = (share: number) =>
    sorted[Math.floor((sorted.length - 1) * share)];
  const level = (time: number) =>
    time <= quartile(0.25)
      ? 1
      : time <= quartile(0.5)
        ? 2
        : time <= quartile(0.75)
          ? 3
          : 4;

  const first = Date.UTC(year, 0, 1);
  const last = Date.UTC(year, 11, 31);
  const weeks: (CalendarCell | null)[][] = [];
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  let week: (CalendarCell | null)[] = Array<null>(lead).fill(null);
  for (let time = first; time <= last; time += DAY_MS) {
    const date = key(time);
    const day = byDate.get(date);
    week.push({
      date,
      movingTime: day?.movingTime ?? 0,
      level: day ? level(day.movingTime) : 0,
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push(week);
  return {
    weeks,
    activeWeeks: weeks.filter((cells) => cells.some((cell) => cell?.level))
      .length,
  };
}

export interface CumulativeRow {
  /** Day of the year, from 0 */
  day: number;
  current?: number;
  previous?: number;
  projection?: number;
}

/**
 * The running total of a year against the year before, every `step` days to
 * stay light. Past today, a dashed line carries on at the same average daily
 * rate: arithmetic, not a forecast of the athlete's training.
 */
export function cumulativeRows(
  days: Day[],
  year: number,
  value: (day: Day) => number,
  today: string,
  step = 7,
): CumulativeRow[] {
  const dayOfYear = (date: string, y: number) =>
    Math.round((utc(date) - Date.UTC(y, 0, 1)) / DAY_MS);
  const lastDay = dayOfYear(`${year}-12-31`, year);
  const running = (y: number) => {
    const totals = new Array<number>(lastDay + 2).fill(0);
    for (const day of days) {
      if (day.date.startsWith(`${y}-`)) {
        totals[Math.min(dayOfYear(day.date, y), lastDay)] += value(day);
      }
    }
    for (let i = 1; i < totals.length; i++) totals[i] += totals[i - 1];
    return totals;
  };
  const current = running(year);
  const previous = running(year - 1);
  const todayIndex = today.startsWith(`${year}-`)
    ? dayOfYear(today, year)
    : today < `${year}-`
      ? -1
      : lastDay;
  const rate = todayIndex >= 0 ? current[todayIndex] / (todayIndex + 1) : 0;

  const rows: CumulativeRow[] = [];
  for (let day = 0; day <= lastDay; day += step) rows.push(rowAt(day));
  if (rows.at(-1)?.day !== lastDay) rows.push(rowAt(lastDay));
  // The lines must meet today, between two steps
  if (todayIndex >= 0 && todayIndex < lastDay) {
    rows.push(rowAt(todayIndex));
    rows.sort((a, b) => a.day - b.day);
  }
  return rows.filter(
    (row, index) => index === 0 || row.day !== rows[index - 1].day,
  );

  function rowAt(day: number): CumulativeRow {
    return {
      day,
      previous: previous[day],
      ...(day <= todayIndex && { current: current[day] }),
      ...(todayIndex >= 0 &&
        todayIndex < lastDay &&
        day >= todayIndex && {
          projection: current[todayIndex] + rate * (day - todayIndex),
        }),
    };
  }
}
