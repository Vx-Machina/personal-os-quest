/** Pure statistics for the built-in trackers. Everything is derived from log entries. */
import { addDays, daysBetween, localParts } from '../time';
import { PROTOCOLS } from './frameworks';
import type { GoalSettings, LogEntry, LogKind, MealSlot, ProtocolKey, ProtocolsData } from './types';
import { hhmmToMin, MEAL_SLOTS, minToHhmm, weekKey } from './validate';

export const SMOKE_BADGES = [
  { days: 1, label: '1 day', xp: 10, gold: 5 },
  { days: 3, label: '3 days', xp: 20, gold: 10 },
  { days: 7, label: '1 week', xp: 40, gold: 20 },
  { days: 30, label: '1 month', xp: 100, gold: 50 },
  { days: 90, label: '3 months', xp: 250, gold: 120 },
];

const MAX_SCAN = 3650;

export function logsOf(logs: LogEntry[], kind: LogKind): LogEntry[] {
  return logs.filter((l) => l.kind === kind);
}

function byDay(logs: LogEntry[]): Map<string, LogEntry[]> {
  const m = new Map<string, LogEntry[]>();
  for (const l of logs) {
    const arr = m.get(l.dayKey);
    if (arr) arr.push(l);
    else m.set(l.dayKey, [l]);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.ts.localeCompare(b.ts));
  return m;
}

export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

/**
 * Consecutive good days ending today. If today is not good yet it is "pending":
 * the count starts from yesterday instead of breaking.
 */
export function streakBack(today: string, good: (day: string) => boolean): number {
  let d = good(today) ? today : addDays(today, -1);
  let n = 0;
  while (n < MAX_SCAN && good(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function inWeek(day: string, week: string): boolean {
  return weekKey(day) === week;
}

// ----------------------------------------------------------------------------- smoking

export interface SmokingStats {
  started: boolean;
  quitDay: string | null;
  /** Smoke-free days in a row, today included (0 if you smoked today). */
  streak: number;
  best: number;
  smokeFreeDays: number;
  slipToday: number;
  lastSlip: string | null;
  series: { day: string; count: number | null }[];
  cravings: { today: number; resistedToday: number; week: number; resistedWeek: number };
  money: { saved: number; perDay: number; currency: string } | null;
  moneyMissing: string[];
  badges: { days: number; label: string; earned: boolean }[];
  next: { days: number; label: string; inDays: number } | null;
}

export function smokingStats(logs: LogEntry[], settings: GoalSettings, today: string): SmokingStats {
  const smoke = byDay(logsOf(logs, 'smoke'));
  const cigs = (d: string) => (smoke.get(d) ?? []).reduce((s, l) => s + (l.value ?? 0), 0);
  const { quitDay, baselinePerDay, packPrice, packSize, currency } = settings.smoking;
  const free = (d: string) => quitDay !== null && daysBetween(quitDay, d) >= 0 && daysBetween(d, today) >= 0 && cigs(d) === 0;

  let streak = 0;
  let best = 0;
  let total = 0;
  let lastSlip: string | null = null;
  if (quitDay && daysBetween(quitDay, today) >= 0) {
    let run = 0;
    for (let d = quitDay; daysBetween(d, today) >= 0; d = addDays(d, 1)) {
      if (free(d)) {
        run++;
        total++;
        best = Math.max(best, run);
      } else {
        run = 0;
        lastSlip = d;
      }
    }
    streak = run;
  }

  const week = weekKey(today);
  const cravings = logsOf(logs, 'craving');
  const resisted = (l: LogEntry) => l.value2 === 1;
  const cravingStats = {
    today: cravings.filter((l) => l.dayKey === today).length,
    resistedToday: cravings.filter((l) => l.dayKey === today && resisted(l)).length,
    week: cravings.filter((l) => inWeek(l.dayKey, week)).length,
    resistedWeek: cravings.filter((l) => inWeek(l.dayKey, week) && resisted(l)).length,
  };

  const moneyMissing = [
    baselinePerDay === null ? 'cigarettes per day before quitting' : '',
    packPrice === null ? 'price per pack' : '',
    packSize === null ? 'cigarettes per pack' : '',
  ].filter(Boolean);
  let money: SmokingStats['money'] = null;
  if (!moneyMissing.length && baselinePerDay !== null && packPrice !== null && packSize) {
    const perCig = packPrice / packSize;
    const first = quitDay ?? [...smoke.keys()].sort()[0] ?? null;
    let saved = 0;
    if (first) {
      for (let d = first; daysBetween(d, today) >= 0; d = addDays(d, 1)) {
        const known = smoke.has(d) || (quitDay !== null && daysBetween(quitDay, d) >= 0);
        if (known) saved += Math.max(0, baselinePerDay - cigs(d)) * perCig;
      }
    }
    money = { saved: Math.round(saved * 100) / 100, perDay: Math.round(baselinePerDay * perCig * 100) / 100, currency };
  }

  const badges = SMOKE_BADGES.map((b) => ({ days: b.days, label: b.label, earned: best >= b.days }));
  const nb = SMOKE_BADGES.find((b) => b.days > streak);
  return {
    started: quitDay !== null,
    quitDay,
    streak,
    best,
    smokeFreeDays: total,
    slipToday: cigs(today),
    lastSlip,
    series: lastDays(today, 14).map((d) => ({ day: d, count: smoke.has(d) ? cigs(d) : quitDay && daysBetween(quitDay, d) >= 0 ? 0 : null })),
    cravings: cravingStats,
    money,
    moneyMissing,
    badges,
    next: nb ? { days: nb.days, label: nb.label, inDays: nb.days - streak } : null,
  };
}

// ----------------------------------------------------------------------------- wake

export interface WakeStats {
  target: string;
  todayMin: number | null;
  checkedToday: boolean;
  onTimeToday: boolean | null;
  streak: number;
  weekAvg: string | null;
  lastWeekAvg: string | null;
  onTimeThisWeek: number;
  daysThisWeek: number;
  series: { day: string; min: number | null; onTime: boolean | null }[];
}

export function wakeStats(logs: LogEntry[], settings: GoalSettings, today: string): WakeStats {
  const days = byDay(logsOf(logs, 'wake'));
  const limit = hhmmToMin(settings.wakeTarget) + settings.wakeGraceMin;
  const first = (d: string) => days.get(d)?.[0] ?? null;
  const onTime = (d: string): boolean | null => {
    const l = first(d);
    if (!l) return null;
    return l.value === null ? true : l.value <= limit;
  };
  const avg = (week: string) => {
    const vals = [...days.entries()].filter(([d]) => inWeek(d, week)).map(([, ls]) => ls[0].value).filter((v): v is number => v !== null);
    return vals.length ? minToHhmm(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  };
  const week = weekKey(today);
  const weekDays = [...days.keys()].filter((d) => inWeek(d, week));
  return {
    target: settings.wakeTarget,
    todayMin: first(today)?.value ?? null,
    checkedToday: first(today) !== null,
    onTimeToday: onTime(today),
    streak: streakBack(today, (d) => onTime(d) === true),
    weekAvg: avg(week),
    lastWeekAvg: avg(addDays(week, -7)),
    onTimeThisWeek: weekDays.filter((d) => onTime(d) === true).length,
    daysThisWeek: daysBetween(week, today) + 1,
    series: lastDays(today, 14).map((d) => ({ day: d, min: first(d)?.value ?? null, onTime: onTime(d) })),
  };
}

// ----------------------------------------------------------------------------- gym (rolling 48h rule)

export interface GymStats {
  lastTs: string | null;
  hoursSince: number | null;
  /** ok < 24h, due 24-48h, overdue >= 48h since the last session. */
  status: 'none' | 'ok' | 'due' | 'overdue';
  thisWeek: number;
  last7: number;
}

export function gymStats(logs: LogEntry[], today: string, now: Date): GymStats {
  const gym = logsOf(logs, 'gym').sort((a, b) => a.ts.localeCompare(b.ts));
  const last = gym.at(-1) ?? null;
  const hours = last ? (now.getTime() - new Date(last.ts).getTime()) / 3_600_000 : null;
  const week = weekKey(today);
  const sessionDays = new Set(gym.map((l) => l.dayKey));
  return {
    lastTs: last?.ts ?? null,
    hoursSince: hours === null ? null : Math.max(0, Math.round(hours * 10) / 10),
    status: hours === null ? 'none' : hours < 24 ? 'ok' : hours < 48 ? 'due' : 'overdue',
    thisWeek: [...sessionDays].filter((d) => inWeek(d, week)).length,
    last7: [...sessionDays].filter((d) => daysBetween(d, today) >= 0 && daysBetween(d, today) < 7).length,
  };
}

// ----------------------------------------------------------------------------- run

export interface RunStats {
  doneToday: boolean;
  todayMinutes: number;
  todayKm: number;
  streak: number;
  thisWeek: number;
  weekMinutes: number;
  weekKm: number;
}

export function runStats(logs: LogEntry[], today: string): RunStats {
  const runs = logsOf(logs, 'run');
  const days = new Set(runs.map((l) => l.dayKey));
  const week = weekKey(today);
  const sum = (ls: LogEntry[], f: (l: LogEntry) => number | null) => Math.round(ls.reduce((s, l) => s + (f(l) ?? 0), 0) * 10) / 10;
  const todayRuns = runs.filter((l) => l.dayKey === today);
  const weekRuns = runs.filter((l) => inWeek(l.dayKey, week));
  return {
    doneToday: days.has(today),
    todayMinutes: sum(todayRuns, (l) => l.value),
    todayKm: sum(todayRuns, (l) => l.value2),
    streak: streakBack(today, (d) => days.has(d)),
    thisWeek: [...days].filter((d) => inWeek(d, week)).length,
    weekMinutes: sum(weekRuns, (l) => l.value),
    weekKm: sum(weekRuns, (l) => l.value2),
  };
}

// ----------------------------------------------------------------------------- sunlight

export interface SunStats {
  doneToday: boolean;
  todayMinutes: number;
  /** Minutes between waking and going out, when both times are known. */
  afterWakeMin: number | null;
  withinWindow: boolean | null;
  streak: number;
  thisWeek: number;
}

export function sunStats(logs: LogEntry[], settings: GoalSettings, today: string): SunStats {
  const sun = logsOf(logs, 'sun');
  const days = new Set(sun.map((l) => l.dayKey));
  const todaySun = sun.filter((l) => l.dayKey === today).sort((a, b) => a.ts.localeCompare(b.ts));
  const wake = logsOf(logs, 'wake').filter((l) => l.dayKey === today && l.value !== null)[0];
  const start = todaySun.find((l) => l.value2 !== null)?.value2 ?? null;
  const afterWake = wake && start !== null ? start - (wake.value as number) : null;
  const week = weekKey(today);
  return {
    doneToday: todaySun.length > 0,
    todayMinutes: todaySun.reduce((s, l) => s + (l.value ?? 0), 0),
    afterWakeMin: afterWake,
    withinWindow: afterWake === null ? null : afterWake >= 0 && afterWake <= settings.sunWindowMin,
    streak: streakBack(today, (d) => days.has(d)),
    thisWeek: [...days].filter((d) => inWeek(d, week)).length,
  };
}

// ----------------------------------------------------------------------------- meals

export interface MealSlotState {
  slot: MealSlot;
  target: string;
  time: number | null;
  healthy: boolean | null;
  onTime: boolean | null;
}

export interface MealStats {
  slots: MealSlotState[];
  qualifiesToday: boolean;
  streak: number;
  healthyThisWeek: number;
  loggedThisWeek: number;
}

export function mealQualifies(dayLogs: LogEntry[]): boolean {
  if (dayLogs.some((l) => l.tag === 'quest')) return true;
  return MEAL_SLOTS.every((slot) => {
    const l = dayLogs.filter((x) => x.tag === slot).at(-1);
    return Boolean(l && l.value2 === 1);
  });
}

export function mealStats(logs: LogEntry[], settings: GoalSettings, today: string): MealStats {
  const meals = byDay(logsOf(logs, 'meal'));
  const todayLogs = meals.get(today) ?? [];
  const slots = MEAL_SLOTS.map((slot): MealSlotState => {
    const l = todayLogs.filter((x) => x.tag === slot).at(-1) ?? null;
    const target = settings.meals[slot];
    return {
      slot,
      target,
      time: l?.value ?? null,
      healthy: l ? l.value2 === 1 : null,
      onTime: l?.value == null ? null : Math.abs(l.value - hhmmToMin(target)) <= settings.mealWindowMin,
    };
  });
  const week = weekKey(today);
  const weekLogs = [...meals.entries()].filter(([d]) => inWeek(d, week)).flatMap(([, ls]) => ls.filter((l) => l.tag !== 'quest'));
  return {
    slots,
    qualifiesToday: mealQualifies(todayLogs),
    streak: streakBack(today, (d) => mealQualifies(meals.get(d) ?? [])),
    healthyThisWeek: weekLogs.filter((l) => l.value2 === 1).length,
    loggedThisWeek: weekLogs.length,
  };
}

// ----------------------------------------------------------------------------- pomodoro

export interface PomodoroStats {
  today: number;
  target: number;
  week: number;
  total: number;
  byGoal: Record<number, { today: number; total: number }>;
  byTask: Record<number, number>;
  series: { day: string; count: number }[];
}

export function pomodoroStats(logs: LogEntry[], settings: GoalSettings, today: string): PomodoroStats {
  const p = logsOf(logs, 'pomodoro');
  const week = weekKey(today);
  const byGoal: PomodoroStats['byGoal'] = {};
  const byTask: PomodoroStats['byTask'] = {};
  for (const l of p) {
    if (l.goalId !== null) {
      byGoal[l.goalId] ??= { today: 0, total: 0 };
      byGoal[l.goalId].total++;
      if (l.dayKey === today) byGoal[l.goalId].today++;
    }
    if (l.taskId !== null) byTask[l.taskId] = (byTask[l.taskId] ?? 0) + 1;
  }
  return {
    today: p.filter((l) => l.dayKey === today).length,
    target: settings.pomodoroDailyTarget,
    week: p.filter((l) => inWeek(l.dayKey, week)).length,
    total: p.length,
    byGoal,
    byTask,
    series: lastDays(today, 14).map((d) => ({ day: d, count: p.filter((l) => l.dayKey === d).length })),
  };
}

// ----------------------------------------------------------------------------- protocols

export interface ProtocolState {
  key: ProtocolKey;
  label: string;
  idea: string;
  enabled: boolean;
  checked: boolean;
  /** Set when the check comes from a tracker log rather than a tick. */
  via: string | null;
}

export function protocolStates(data: ProtocolsData | null, logs: LogEntry[], settings: GoalSettings, today: string): ProtocolState[] {
  const todayLogs = logs.filter((l) => l.dayKey === today);
  const has = (k: LogKind) => todayLogs.some((l) => l.kind === k);
  return PROTOCOLS.map((p) => {
    let via: string | null = null;
    if (p.key === 'sunlight' && has('sun')) via = 'sunlight log';
    if (p.key === 'movement' && (has('run') || has('gym'))) via = has('run') ? 'run log' : 'gym log';
    return {
      key: p.key,
      label: p.key === 'sleep' ? `${p.label} (bed by ${settings.bedtime})` : p.label,
      idea: p.idea,
      enabled: settings.protocols[p.key],
      checked: via !== null || Boolean(data?.checked.includes(p.key)),
      via,
    };
  });
}

/** Local wall-clock minutes after midnight for an instant (for default "now" times). */
export function localMinutes(now: Date, timeZone: string): number {
  const p = localParts(now, timeZone);
  return p.hour * 60 + p.minute;
}
