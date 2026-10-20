/**
 * Goal progress.
 *
 * Rule (deliberately simple, so a ring always means something you can explain):
 *  - A finished goal is 100%. Dropped goals are ignored by their parent.
 *  - A goal with a tracker (metric) is measured by that tracker over its own window
 *    (e.g. smoke-free days / 90). Its milestones and tasks are shown but don't change its number.
 *  - A goal without a tracker rolls up from its children (monthly milestones, weekly targets)
 *    and its own tasks, each weighing the same: average of child progress and task done (1/0).
 *  - Nothing to measure yet = 0%.
 */
import { addDays, daysBetween } from '../time';
import { mealQualifies } from './trackers';
import type { Goal, GoalSettings, GoalTask, LogEntry, TrackerKind } from './types';
import { hhmmToMin } from './validate';

export interface MetricResult {
  tracker: TrackerKind;
  done: number;
  target: number;
  progress: number;
  /** done vs. what was expected by today (1 = on pace). null before the window starts. */
  pace: number | null;
  unit: string;
}

export function windowDays(goal: Pick<Goal, 'startDay' | 'endDay'>): number {
  return daysBetween(goal.startDay, goal.endDay) + 1;
}

export function elapsedDays(goal: Pick<Goal, 'startDay' | 'endDay'>, today: string): number {
  return Math.max(0, Math.min(windowDays(goal), daysBetween(goal.startDay, today) + 1));
}

function daysIn(goal: Pick<Goal, 'startDay' | 'endDay'>, today: string): string[] {
  const out: string[] = [];
  const n = elapsedDays(goal, today);
  for (let i = 0; i < n; i++) out.push(addDays(goal.startDay, i));
  return out;
}

const UNITS: Record<TrackerKind, string> = {
  smoking: 'smoke-free days',
  wake: 'days up on time',
  gym: 'sessions',
  run: 'run days',
  sun: 'sunlight days',
  pomodoro: 'pomodoros',
  meals: 'healthy-meal days',
};

export function defaultTarget(tracker: TrackerKind, days: number, settings: GoalSettings): number {
  if (tracker === 'gym') return Math.ceil(days / 2);
  if (tracker === 'pomodoro') return settings.pomodoroDailyTarget * days;
  return days;
}

export function metricResult(goal: Goal, logs: LogEntry[], settings: GoalSettings, today: string): MetricResult | null {
  if (!goal.metric) return null;
  const tracker = goal.metric.tracker;
  const days = daysIn(goal, today);
  const inWindow = (l: LogEntry) => daysBetween(goal.startDay, l.dayKey) >= 0 && daysBetween(l.dayKey, goal.endDay) >= 0 && daysBetween(l.dayKey, today) >= 0;
  const ofKind = (k: LogEntry['kind']) => logs.filter((l) => l.kind === k && inWindow(l));
  const distinctDays = (ls: LogEntry[]) => new Set(ls.map((l) => l.dayKey)).size;

  let done = 0;
  switch (tracker) {
    case 'smoking': {
      const quit = settings.smoking.quitDay;
      const smoked = new Set(ofKind('smoke').filter((l) => (l.value ?? 0) > 0).map((l) => l.dayKey));
      done = quit ? days.filter((d) => daysBetween(quit, d) >= 0 && !smoked.has(d)).length : 0;
      break;
    }
    case 'wake': {
      const limit = hhmmToMin(settings.wakeTarget) + settings.wakeGraceMin;
      const firstByDay = new Map<string, LogEntry>();
      for (const l of ofKind('wake').sort((a, b) => a.ts.localeCompare(b.ts))) if (!firstByDay.has(l.dayKey)) firstByDay.set(l.dayKey, l);
      done = [...firstByDay.values()].filter((l) => l.value === null || l.value <= limit).length;
      break;
    }
    case 'gym':
      done = distinctDays(ofKind('gym'));
      break;
    case 'run':
      done = distinctDays(ofKind('run'));
      break;
    case 'sun':
      done = distinctDays(ofKind('sun'));
      break;
    case 'pomodoro':
      done = ofKind('pomodoro').length;
      break;
    case 'meals': {
      const meals = ofKind('meal');
      done = days.filter((d) => mealQualifies(meals.filter((l) => l.dayKey === d))).length;
      break;
    }
  }
  const total = windowDays(goal);
  const target = goal.metric.target ?? defaultTarget(tracker, total, settings);
  const elapsed = elapsedDays(goal, today);
  const expected = (target * elapsed) / total;
  return {
    tracker,
    done,
    target,
    progress: Math.min(1, done / target),
    pace: elapsed === 0 ? null : Math.min(2, done / Math.max(expected, 1e-9)),
    unit: UNITS[tracker],
  };
}

export interface GoalProgress {
  id: number;
  progress: number;
  metric: MetricResult | null;
  tasksDone: number;
  tasksTotal: number;
  childIds: number[];
}

export function computeProgress(goals: Goal[], tasks: GoalTask[], logs: LogEntry[], settings: GoalSettings, today: string): Map<number, GoalProgress> {
  const out = new Map<number, GoalProgress>();
  const byId = new Map(goals.map((g) => [g.id, g]));
  const visiting = new Set<number>();

  const calc = (g: Goal): GoalProgress => {
    const cached = out.get(g.id);
    if (cached) return cached;
    if (visiting.has(g.id)) throw new Error(`Goal hierarchy loop at #${g.id}`);
    visiting.add(g.id);
    const children = goals.filter((c) => c.parentId === g.id && c.status !== 'dropped');
    const own = tasks.filter((t) => t.goalId === g.id);
    const metric = metricResult(g, logs, settings, today);
    const childProgress = children.map((c) => calc(c).progress);
    let progress: number;
    if (g.status === 'done') progress = 1;
    else if (metric) progress = metric.progress;
    else {
      const parts = [...childProgress, ...own.map((t) => (t.done ? 1 : 0))];
      progress = parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : 0;
    }
    const result: GoalProgress = {
      id: g.id,
      progress,
      metric,
      tasksDone: own.filter((t) => t.done).length,
      tasksTotal: own.length,
      childIds: children.map((c) => c.id),
    };
    visiting.delete(g.id);
    out.set(g.id, result);
    return result;
  };

  for (const g of goals) if (byId.has(g.id)) calc(g);
  return out;
}

/** Overall progress of a set of goals (e.g. all active season goals). */
export function averageProgress(ids: number[], progress: Map<number, GoalProgress>): number {
  const vals = ids.map((id) => progress.get(id)?.progress ?? 0);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}
