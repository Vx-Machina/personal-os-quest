/**
 * Time-zone aware "game day" helpers.
 *
 * A game day is labelled by the local calendar date on which it started. With the
 * default reset at 04:00 Europe/Paris, 02:30 on 21 Oct (Paris) still belongs to the
 * game day "2026-10-20". Everything works on local wall-clock time via Intl, so it
 * is DST-safe without a date library.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute') };
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidResetTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function parseResetTime(value: string): { hour: number; minute: number } {
  const m = TIME_RE.exec(value);
  if (!m) throw new Error(`Invalid reset time "${value}", expected HH:MM`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function dayKeyToUtc(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const t = new Date(dayKeyToUtc(key) + n * 86_400_000);
  return formatDayKey(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayKeyToUtc(b) - dayKeyToUtc(a)) / 86_400_000);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayOf(key: string): number {
  return (new Date(dayKeyToUtc(key)).getUTCDay() + 6) % 7;
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The game day `now` belongs to, given a time zone and a daily reset time. */
export function dayKey(now: Date, timeZone: string, resetTime: string): string {
  const p = localParts(now, timeZone);
  const { hour, minute } = parseResetTime(resetTime);
  const key = formatDayKey(p.year, p.month, p.day);
  const beforeReset = p.hour * 60 + p.minute < hour * 60 + minute;
  return beforeReset ? addDays(key, -1) : key;
}

/** First instant (to the minute) at which the game day changes after `now`. */
export function nextResetAt(now: Date, timeZone: string, resetTime: string): Date {
  const current = dayKey(now, timeZone, resetTime);
  let lo = now.getTime();
  let hi = lo + 50 * 3_600_000; // longer than any day, DST included
  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey(new Date(mid), timeZone, resetTime) === current) lo = mid;
    else hi = mid;
  }
  // Snap to the start of that minute.
  return new Date(Math.floor(hi / 60_000) * 60_000);
}
