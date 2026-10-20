import type { Domain } from '../domains';
import type { Difficulty } from '../types';

export type GoalLevel = 'season' | 'month' | 'week';
export type GoalStatus = 'active' | 'done' | 'dropped';

/** Built-in trackers. A goal with a tracker is measured by its log stream. */
export type TrackerKind = 'smoking' | 'wake' | 'gym' | 'run' | 'sun' | 'pomodoro' | 'meals';

export interface Metric {
  tracker: TrackerKind;
  /** Optional absolute target for the goal window. Defaults depend on the tracker (see progress.ts). */
  target?: number;
}

export interface IfThen {
  if: string;
  then: string;
}

export interface Woop {
  wish: string;
  outcome: string;
  obstacle: string;
  plan: string;
}

export interface Goal {
  id: number;
  playerId: number;
  parentId: number | null;
  level: GoalLevel;
  title: string;
  domain: Domain;
  /** RPM: the Result you want. */
  result: string;
  /** RPM: your Purpose (why it matters). The Massive action plan is the goal's tasks. */
  purpose: string;
  /** Ferriss: what would this look like if it were easy? */
  easy: string;
  /** Identity-based habit: "I am someone who…" */
  identity: string;
  woop: Woop;
  ifThen: IfThen[];
  metric: Metric | null;
  /** RPG daily or habit that mirrors this goal's tracker. */
  questId: number | null;
  startDay: string;
  endDay: string;
  status: GoalStatus;
  /** Smoke-free milestone badges already awarded (in days). */
  badges: number[];
  sortOrder: number;
  createdAt: string;
}

export interface GoalTask {
  id: number;
  playerId: number;
  goalId: number;
  title: string;
  notes: string;
  difficulty: Difficulty;
  due: string | null;
  done: boolean;
  doneAt: string | null;
  /** RPG to-do created when the task is pushed to the quest board. */
  questId: number | null;
  /** Game day on which this task is pinned to the "top 3". */
  top3Day: string | null;
  /** 80/20: one of the few tasks that drive most of the result. */
  leverage: boolean;
  /** Ferriss: the easy version of this task. */
  easy: string;
  pomodoros: number;
  sortOrder: number;
  createdAt: string;
}

export type LogKind = 'smoke' | 'craving' | 'wake' | 'gym' | 'run' | 'sun' | 'meal' | 'pomodoro';

/**
 * One tracker entry. Field meaning by kind:
 *   smoke    value = cigarettes
 *   craving  value = intensity 1-5, value2 = resisted (1/0), note = trigger
 *   wake     value = wake time in minutes after midnight (null when checked from the quest board)
 *   gym      value = minutes (optional)
 *   run      value = minutes, value2 = km (both optional)
 *   sun      value = minutes outside, value2 = start time in minutes after midnight
 *   meal     value = time eaten in minutes after midnight, value2 = healthy (1/0), tag = slot
 *   pomodoro value = focus minutes, goalId/taskId optional
 * tag "quest" marks an entry created by checking the linked quest in the RPG.
 */
export interface LogEntry {
  id: number;
  playerId: number;
  kind: LogKind;
  dayKey: string;
  ts: string;
  goalId: number | null;
  taskId: number | null;
  value: number | null;
  value2: number | null;
  tag: string;
  note: string;
}

export type ProtocolKey = 'sunlight' | 'focus' | 'movement' | 'exposure' | 'caffeine' | 'winddown' | 'sleep';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface GoalSettings {
  wakeTarget: string;
  wakeGraceMin: number;
  /** Ideal: sunlight within this many minutes of waking. */
  sunWindowMin: number;
  pomodoroWorkMin: number;
  pomodoroBreakMin: number;
  pomodoroDailyTarget: number;
  meals: Record<MealSlot, string>;
  mealWindowMin: number;
  bedtime: string;
  smoking: {
    quitDay: string | null;
    /** Unknown until you set them: money saved stays hidden rather than showing 0. */
    baselinePerDay: number | null;
    packPrice: number | null;
    packSize: number | null;
    currency: string;
  };
  protocols: Record<ProtocolKey, boolean>;
}

export type JournalKind =
  | 'checkin'
  | 'gratitude'
  | 'kaizen'
  | 'protocols'
  | 'hansei'
  | 'pareto'
  | 'lead'
  | 'yearReview'
  | 'ikigai'
  | 'identity'
  | 'fear'
  | 'settings';

export interface CheckinData {
  mood: number;
  energy: number;
  note: string;
}
export interface TextData {
  text: string;
}
export interface ProtocolsData {
  checked: ProtocolKey[];
  focusMin: number | null;
  exposure: 'cold' | 'heat' | null;
  /** Keys that already earned XP today (re-checking does not pay twice). */
  granted: ProtocolKey[];
}
export interface HanseiData {
  wentWell: string;
  didnt: string;
  change: string;
}
export interface ParetoData {
  top20: string;
  drains: string;
  eliminate: string;
}
export interface LeadData {
  taskId: number | null;
  text: string;
}
export interface YearReviewData {
  ratings: Partial<Record<Domain, number>>;
  notes: Partial<Record<Domain, string>>;
}
export interface IkigaiData {
  love: string[];
  good: string[];
  needs: string[];
  paid: string[];
  statement: string;
}
export interface IdentityData {
  statement: string;
  stacks: { after: string; will: string }[];
}
export interface FearData {
  title: string;
  define: string[];
  prevent: string[];
  repair: string[];
  benefits: string;
  inaction: string;
}

export interface JournalEntry<T = unknown> {
  kind: JournalKind;
  period: string;
  data: T;
  updatedAt: string;
}
