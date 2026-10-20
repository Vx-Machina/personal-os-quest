/** Defaults and input validation for the goals module (shared by API, web and Discord). */
import { isDomain, type Domain } from '../domains';
import { GameError } from '../game';
import { isDifficulty } from '../rules';
import { addDays, daysBetween, isValidResetTime, weekdayOf } from '../time';
import type { Difficulty } from '../types';
import type {
  CheckinData,
  FearData,
  GoalLevel,
  GoalSettings,
  HanseiData,
  IdentityData,
  IfThen,
  IkigaiData,
  JournalKind,
  LeadData,
  LogKind,
  MealSlot,
  Metric,
  ParetoData,
  ProtocolKey,
  ProtocolsData,
  TextData,
  TrackerKind,
  Woop,
  YearReviewData,
} from './types';

export const TRACKERS: TrackerKind[] = ['smoking', 'wake', 'gym', 'run', 'sun', 'pomodoro', 'meals'];
export const LOG_KINDS: LogKind[] = ['smoke', 'craving', 'wake', 'gym', 'run', 'sun', 'meal', 'pomodoro'];
export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
export const PROTOCOL_KEYS: ProtocolKey[] = ['sunlight', 'focus', 'movement', 'exposure', 'caffeine', 'winddown', 'sleep'];
export const SEASON_DAYS = 90;

export function defaultGoalSettings(): GoalSettings {
  return {
    wakeTarget: '08:00',
    wakeGraceMin: 15,
    sunWindowMin: 60,
    pomodoroWorkMin: 25,
    pomodoroBreakMin: 5,
    pomodoroDailyTarget: 4,
    meals: { breakfast: '09:00', lunch: '12:30', dinner: '19:30' },
    mealWindowMin: 60,
    bedtime: '00:00',
    smoking: { quitDay: null, baselinePerDay: null, packPrice: null, packSize: null, currency: '€' },
    protocols: { sunlight: true, focus: true, movement: true, exposure: true, caffeine: true, winddown: true, sleep: true },
  };
}

// ----------------------------------------------------------------------------- primitives

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function hhmmToMin(v: string): number {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
}

export function minToHhmm(v: number): string {
  const m = ((Math.round(v) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function text(v: unknown, field: string, max: number, required = false): string {
  if (v === undefined || v === null) {
    if (required) throw new GameError('invalid', `${field} is required`);
    return '';
  }
  if (typeof v !== 'string') throw new GameError('invalid', `${field} must be text`);
  const s = v.trim();
  if (required && !s) throw new GameError('invalid', `${field} is required`);
  if (s.length > max) throw new GameError('invalid', `${field} is too long (max ${max})`);
  return s;
}

function list(v: unknown, field: string, maxItems = 20, maxLen = 300): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new GameError('invalid', `${field} must be a list`);
  return v
    .slice(0, maxItems)
    .map((x, i) => text(x, `${field}[${i}]`, maxLen))
    .filter(Boolean);
}

function num(v: unknown, field: string, min: number, max: number, nullable = false): number | null {
  if (v === undefined || v === null || v === '') {
    if (nullable) return null;
    throw new GameError('invalid', `${field} is required`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new GameError('invalid', `${field} must be between ${min} and ${max}`);
  return n;
}

function int(v: unknown, field: string, min: number, max: number, nullable = false): number | null {
  const n = num(v, field, min, max, nullable);
  if (n !== null && !Number.isInteger(n)) throw new GameError('invalid', `${field} must be a whole number`);
  return n;
}

function time(v: unknown, field: string): string {
  if (!isValidResetTime(v)) throw new GameError('invalid', `${field} must be HH:MM`);
  return v;
}

// ----------------------------------------------------------------------------- goals

export interface GoalDraft {
  parentId: number | null;
  level: GoalLevel;
  title: string;
  domain: Domain;
  result: string;
  purpose: string;
  easy: string;
  identity: string;
  woop: Woop;
  ifThen: IfThen[];
  metric: Metric | null;
  startDay: string;
  endDay: string;
}

const LEVELS: GoalLevel[] = ['season', 'month', 'week'];

export function validateMetric(v: unknown): Metric | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object') throw new GameError('invalid', 'metric must be an object');
  const m = v as Record<string, unknown>;
  if (!TRACKERS.includes(m.tracker as TrackerKind)) throw new GameError('invalid', `metric.tracker must be one of ${TRACKERS.join(', ')}`);
  const target = int(m.target, 'metric.target', 1, 100_000, true);
  return target === null ? { tracker: m.tracker as TrackerKind } : { tracker: m.tracker as TrackerKind, target };
}

export function validateWoop(v: unknown): Woop {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    wish: text(o.wish, 'woop.wish', 300),
    outcome: text(o.outcome, 'woop.outcome', 300),
    obstacle: text(o.obstacle, 'woop.obstacle', 300),
    plan: text(o.plan, 'woop.plan', 300),
  };
}

export function validateIfThen(v: unknown): IfThen[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new GameError('invalid', 'ifThen must be a list');
  return v
    .slice(0, 10)
    .map((x, i) => {
      const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      return { if: text(o.if, `ifThen[${i}].if`, 200), then: text(o.then, `ifThen[${i}].then`, 200) };
    })
    .filter((x) => x.if || x.then);
}

/** Validates a full goal (create) or a goal merged with a patch (update). */
export function validateGoalDraft(input: Record<string, unknown>, today: string): GoalDraft {
  const level = (input.level ?? 'season') as GoalLevel;
  if (!LEVELS.includes(level)) throw new GameError('invalid', 'level must be season, month or week');
  if (!isDomain(input.domain)) throw new GameError('invalid', 'domain must be one of the nine life domains');
  const parentId = input.parentId === undefined || input.parentId === null ? null : Number(input.parentId);
  if (parentId !== null && !(Number.isInteger(parentId) && parentId > 0)) throw new GameError('invalid', 'parentId must be a goal id');
  if (level === 'season' && parentId !== null) throw new GameError('invalid', 'season goals have no parent');
  const window = defaultWindow(level, today);
  const startDay = input.startDay === undefined ? window.startDay : input.startDay;
  const endDay = input.endDay === undefined ? window.endDay : input.endDay;
  if (!isDayKey(startDay) || !isDayKey(endDay)) throw new GameError('invalid', 'startDay and endDay must be YYYY-MM-DD');
  if (daysBetween(startDay, endDay) < 0) throw new GameError('invalid', 'endDay must not be before startDay');
  if (daysBetween(startDay, endDay) > 400) throw new GameError('invalid', 'a goal window can be at most about a year');
  return {
    parentId,
    level,
    title: text(input.title, 'title', 120, true),
    domain: input.domain,
    result: text(input.result, 'result', 500),
    purpose: text(input.purpose, 'purpose', 1000),
    easy: text(input.easy, 'easy', 500),
    identity: text(input.identity, 'identity', 300),
    woop: validateWoop(input.woop),
    ifThen: validateIfThen(input.ifThen),
    metric: validateMetric(input.metric),
    startDay,
    endDay,
  };
}

/** Default window for a new goal: 90-day season, 30-day month, the rest of this calendar week. */
export function defaultWindow(level: GoalLevel, today: string): { startDay: string; endDay: string } {
  if (level === 'season') return { startDay: today, endDay: addDays(today, SEASON_DAYS - 1) };
  if (level === 'month') return { startDay: today, endDay: addDays(today, 29) };
  return { startDay: today, endDay: weekEnd(today) };
}

/** Monday of the week containing `day`. */
export function weekKey(day: string): string {
  return addDays(day, -weekdayOf(day));
}

export function weekEnd(day: string): string {
  return addDays(weekKey(day), 6);
}

// ----------------------------------------------------------------------------- goal tasks

export interface GoalTaskDraft {
  goalId: number;
  title: string;
  notes: string;
  difficulty: Difficulty;
  due: string | null;
  leverage: boolean;
  easy: string;
}

export function validateGoalTaskDraft(input: Record<string, unknown>): GoalTaskDraft {
  const goalId = Number(input.goalId);
  if (!Number.isInteger(goalId) || goalId < 1) throw new GameError('invalid', 'goalId is required');
  const difficulty = input.difficulty ?? 'easy';
  if (!isDifficulty(difficulty)) throw new GameError('invalid', 'difficulty must be trivial, easy, medium or hard');
  const due = input.due === undefined || input.due === null || input.due === '' ? null : input.due;
  if (due !== null && !isDayKey(due)) throw new GameError('invalid', 'due must be YYYY-MM-DD');
  return {
    goalId,
    title: text(input.title, 'title', 160, true),
    notes: text(input.notes, 'notes', 1000),
    difficulty,
    due: due as string | null,
    leverage: Boolean(input.leverage),
    easy: text(input.easy, 'easy', 500),
  };
}

// ----------------------------------------------------------------------------- logs

export interface LogDraft {
  kind: LogKind;
  dayKey: string;
  goalId: number | null;
  taskId: number | null;
  value: number | null;
  value2: number | null;
  tag: string;
  note: string;
}

/** Validates a tracker entry. `dayKey` may be today or up to 14 days back (backfill). */
export function validateLogDraft(input: Record<string, unknown>, today: string): LogDraft {
  const kind = input.kind as LogKind;
  if (!LOG_KINDS.includes(kind)) throw new GameError('invalid', `kind must be one of ${LOG_KINDS.join(', ')}`);
  const dayKey = input.dayKey ?? today;
  if (!isDayKey(dayKey)) throw new GameError('invalid', 'dayKey must be YYYY-MM-DD');
  const back = daysBetween(dayKey, today);
  if (back < 0 || back > 14) throw new GameError('invalid', 'you can log today or up to 14 days back');
  const id = (v: unknown, f: string) => (v === undefined || v === null || v === '' ? null : (int(v, f, 1, 1e9) as number));
  const d: LogDraft = { kind, dayKey, goalId: id(input.goalId, 'goalId'), taskId: id(input.taskId, 'taskId'), value: null, value2: null, tag: '', note: text(input.note, 'note', 500) };
  switch (kind) {
    case 'smoke':
      d.value = int(input.value ?? 1, 'cigarettes', 1, 100);
      break;
    case 'craving':
      d.value = int(input.value ?? 3, 'intensity', 1, 5);
      d.value2 = input.value2 === undefined ? 1 : input.value2 ? 1 : 0;
      break;
    case 'wake':
      d.value = int(input.value, 'wake time (minutes after midnight)', 0, 1439);
      break;
    case 'gym':
      d.value = int(input.value, 'minutes', 1, 600, true);
      break;
    case 'run':
      d.value = int(input.value, 'minutes', 1, 600, true);
      d.value2 = num(input.value2, 'km', 0.1, 200, true);
      break;
    case 'sun':
      d.value = int(input.value ?? 10, 'minutes', 1, 600);
      d.value2 = int(input.value2, 'start time (minutes after midnight)', 0, 1439, true);
      break;
    case 'meal': {
      const slot = input.tag as MealSlot;
      if (!MEAL_SLOTS.includes(slot)) throw new GameError('invalid', 'meal tag must be breakfast, lunch or dinner');
      d.tag = slot;
      d.value = int(input.value, 'meal time (minutes after midnight)', 0, 1439);
      d.value2 = input.value2 === undefined ? 1 : input.value2 ? 1 : 0;
      break;
    }
    case 'pomodoro':
      d.value = int(input.value ?? 25, 'minutes', 1, 120);
      break;
  }
  return d;
}

// ----------------------------------------------------------------------------- journal

export const JOURNAL_KINDS: JournalKind[] = ['checkin', 'gratitude', 'kaizen', 'protocols', 'hansei', 'pareto', 'lead', 'yearReview', 'ikigai', 'identity', 'fear', 'settings'];

/** Which period format each journal kind uses. */
export function journalPeriodType(kind: JournalKind): 'day' | 'week' | 'year' | 'main' | 'id' {
  switch (kind) {
    case 'checkin':
    case 'gratitude':
    case 'kaizen':
    case 'protocols':
      return 'day';
    case 'hansei':
    case 'pareto':
    case 'lead':
      return 'week';
    case 'yearReview':
      return 'year';
    case 'fear':
      return 'id';
    default:
      return 'main';
  }
}

export function validatePeriod(kind: JournalKind, period: string): string {
  const type = journalPeriodType(kind);
  const ok =
    (type === 'day' && isDayKey(period)) ||
    (type === 'week' && isDayKey(period) && weekKey(period) === period) ||
    (type === 'year' && /^\d{4}$/.test(period)) ||
    (type === 'main' && period === 'main') ||
    (type === 'id' && /^[a-z0-9-]{1,40}$/.test(period));
  if (!ok) throw new GameError('invalid', `period "${period}" is not valid for ${kind}`);
  return period;
}

export function validateJournal(kind: JournalKind, raw: unknown, current: GoalSettings = defaultGoalSettings()): unknown {
  if (!JOURNAL_KINDS.includes(kind)) throw new GameError('invalid', `unknown journal kind "${kind}"`);
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  switch (kind) {
    case 'checkin':
      return { mood: int(o.mood, 'mood', 1, 5) as number, energy: int(o.energy, 'energy', 1, 5) as number, note: text(o.note, 'note', 500) } satisfies CheckinData;
    case 'gratitude':
    case 'kaizen':
      return { text: text(o.text, 'text', 500, true) } satisfies TextData;
    case 'protocols': {
      const checked = Array.isArray(o.checked) ? [...new Set(o.checked.filter((k): k is ProtocolKey => PROTOCOL_KEYS.includes(k as ProtocolKey)))] : [];
      const exposure = o.exposure === 'cold' || o.exposure === 'heat' ? o.exposure : null;
      return { checked, focusMin: int(o.focusMin, 'focusMin', 1, 90, true), exposure, granted: [] } satisfies ProtocolsData;
    }
    case 'hansei':
      return { wentWell: text(o.wentWell, 'wentWell', 2000), didnt: text(o.didnt, 'didnt', 2000), change: text(o.change, 'change', 2000) } satisfies HanseiData;
    case 'pareto':
      return { top20: text(o.top20, 'top20', 2000), drains: text(o.drains, 'drains', 2000), eliminate: text(o.eliminate, 'eliminate', 2000) } satisfies ParetoData;
    case 'lead':
      return { taskId: o.taskId == null || o.taskId === '' ? null : (int(o.taskId, 'taskId', 1, 1e9) as number), text: text(o.text, 'text', 300) } satisfies LeadData;
    case 'yearReview': {
      const ratings: YearReviewData['ratings'] = {};
      const notes: YearReviewData['notes'] = {};
      const r = (o.ratings && typeof o.ratings === 'object' ? o.ratings : {}) as Record<string, unknown>;
      const n = (o.notes && typeof o.notes === 'object' ? o.notes : {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(r)) if (isDomain(k) && v !== null && v !== '') ratings[k] = int(v, `ratings.${k}`, 1, 10) as number;
      for (const [k, v] of Object.entries(n)) if (isDomain(k)) notes[k] = text(v, `notes.${k}`, 500);
      return { ratings, notes } satisfies YearReviewData;
    }
    case 'ikigai':
      return { love: list(o.love, 'love'), good: list(o.good, 'good'), needs: list(o.needs, 'needs'), paid: list(o.paid, 'paid'), statement: text(o.statement, 'statement', 500) } satisfies IkigaiData;
    case 'identity': {
      const stacks = Array.isArray(o.stacks)
        ? o.stacks.slice(0, 15).map((s, i) => {
            const x = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
            return { after: text(x.after, `stacks[${i}].after`, 200), will: text(x.will, `stacks[${i}].will`, 200) };
          })
        : [];
      return { statement: text(o.statement, 'statement', 500), stacks: stacks.filter((s) => s.after || s.will) } satisfies IdentityData;
    }
    case 'fear':
      return {
        title: text(o.title, 'title', 200, true),
        define: list(o.define, 'define'),
        prevent: list(o.prevent, 'prevent'),
        repair: list(o.repair, 'repair'),
        benefits: text(o.benefits, 'benefits', 2000),
        inaction: text(o.inaction, 'inaction', 2000),
      } satisfies FearData;
    case 'settings':
      return validateGoalSettings(o, current);
  }
}

export function validateGoalSettings(o: Record<string, unknown>, current: GoalSettings): GoalSettings {
  const next: GoalSettings = JSON.parse(JSON.stringify(current)) as GoalSettings;
  if (o.wakeTarget !== undefined) next.wakeTarget = time(o.wakeTarget, 'wakeTarget');
  if (o.wakeGraceMin !== undefined) next.wakeGraceMin = int(o.wakeGraceMin, 'wakeGraceMin', 0, 120) as number;
  if (o.sunWindowMin !== undefined) next.sunWindowMin = int(o.sunWindowMin, 'sunWindowMin', 10, 240) as number;
  if (o.pomodoroWorkMin !== undefined) next.pomodoroWorkMin = int(o.pomodoroWorkMin, 'pomodoroWorkMin', 5, 90) as number;
  if (o.pomodoroBreakMin !== undefined) next.pomodoroBreakMin = int(o.pomodoroBreakMin, 'pomodoroBreakMin', 1, 60) as number;
  if (o.pomodoroDailyTarget !== undefined) next.pomodoroDailyTarget = int(o.pomodoroDailyTarget, 'pomodoroDailyTarget', 1, 20) as number;
  if (o.mealWindowMin !== undefined) next.mealWindowMin = int(o.mealWindowMin, 'mealWindowMin', 10, 180) as number;
  if (o.bedtime !== undefined) next.bedtime = time(o.bedtime, 'bedtime');
  if (o.meals && typeof o.meals === 'object') {
    const m = o.meals as Record<string, unknown>;
    for (const slot of MEAL_SLOTS) if (m[slot] !== undefined) next.meals[slot] = time(m[slot], `meals.${slot}`);
  }
  if (o.smoking && typeof o.smoking === 'object') {
    const s = o.smoking as Record<string, unknown>;
    if (s.quitDay !== undefined) {
      if (s.quitDay !== null && s.quitDay !== '' && !isDayKey(s.quitDay)) throw new GameError('invalid', 'smoking.quitDay must be YYYY-MM-DD');
      next.smoking.quitDay = s.quitDay ? (s.quitDay as string) : null;
    }
    if (s.baselinePerDay !== undefined) next.smoking.baselinePerDay = num(s.baselinePerDay, 'baselinePerDay', 0, 100, true);
    if (s.packPrice !== undefined) next.smoking.packPrice = num(s.packPrice, 'packPrice', 0.01, 1000, true);
    if (s.packSize !== undefined) next.smoking.packSize = int(s.packSize, 'packSize', 1, 100, true);
    if (s.currency !== undefined) next.smoking.currency = text(s.currency, 'currency', 4) || '€';
  }
  if (o.protocols && typeof o.protocols === 'object') {
    const p = o.protocols as Record<string, unknown>;
    for (const k of PROTOCOL_KEYS) if (p[k] !== undefined) next.protocols[k] = Boolean(p[k]);
  }
  return next;
}
