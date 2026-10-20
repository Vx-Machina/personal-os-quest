import { DOMAIN_INFO, emptyStats, isDomain, type Domain } from './domains';
import { levelInfo, levelUpMessage, totalXpForLevel, titleForLevel } from './level';
import { RULES, damageFor, isDifficulty, rewardFor } from './rules';
import { CATALOG, findItem } from './shop';
import { addDays, dayKey, daysBetween, isValidResetTime, isValidTimeZone, nextResetAt, weekdayOf } from './time';
import type {
  Difficulty,
  GameEvent,
  Notice,
  Outcome,
  Player,
  ResetOutcome,
  ResetReport,
  Reward,
  Settings,
  Task,
  TaskType,
} from './types';

export type GameErrorCode =
  | 'invalid'
  | 'not_found'
  | 'already_completed'
  | 'not_completed'
  | 'wrong_type'
  | 'not_enough_gold'
  | 'locked'
  | 'owned'
  | 'not_owned'
  | 'hp_full';

export class GameError extends Error {
  constructor(
    public readonly code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------------
// Construction

export function defaultSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    timezone: 'Europe/Paris',
    resetTime: '04:00',
    streakThreshold: RULES.defaultStreakThreshold,
    resting: false,
    ...overrides,
  };
}

export function newPlayer(input: { id?: number; name: string; discordId?: string | null; settings?: Partial<Settings>; now: Date }): Player {
  const settings = defaultSettings(input.settings);
  return {
    id: input.id ?? 0,
    name: input.name,
    discordId: input.discordId ?? null,
    hp: RULES.maxHp,
    totalXp: 0,
    gold: 0,
    stats: emptyStats(),
    inventory: [],
    equipped: { hat: null, weapon: null, pet: null },
    dayStreak: 0,
    bestDayStreak: 0,
    peakLevel: 1,
    lastDayKey: dayKey(input.now, settings.timezone, settings.resetTime),
    settings,
    createdAt: input.now.toISOString(),
  };
}

export interface TaskDraft {
  type: TaskType;
  title: string;
  notes: string;
  domain: Domain;
  difficulty: Difficulty;
  timeLabel: string;
  days: number[];
  allowUp: boolean;
  allowDown: boolean;
  forgiving?: boolean;
}

export function newTask(draft: TaskDraft, input: { id?: number; playerId: number; sortOrder?: number; now: Date }): Task {
  return {
    id: input.id ?? 0,
    playerId: input.playerId,
    ...draft,
    forgiving: draft.forgiving ?? false,
    sortOrder: input.sortOrder ?? 0,
    completed: false,
    completedAt: null,
    streak: 0,
    bestStreak: 0,
    counterUp: 0,
    counterDown: 0,
    lastGrant: null,
    createdAt: input.now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Validation (shared so the API, web forms and Discord agree)

const TYPES: TaskType[] = ['daily', 'habit', 'todo'];

function str(v: unknown, field: string, max: number, required: boolean): string {
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

function days(v: unknown): number[] {
  if (v === undefined || v === null) return [...ALL_DAYS];
  if (!Array.isArray(v) || !v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    throw new GameError('invalid', 'days must be a list of weekday numbers 0 (Mon) to 6 (Sun)');
  }
  return [...new Set(v as number[])].sort((a, b) => a - b);
}

export function validateTaskDraft(input: Record<string, unknown>): TaskDraft {
  if (!TYPES.includes(input.type as TaskType)) throw new GameError('invalid', 'type must be daily, habit or todo');
  if (!isDomain(input.domain)) throw new GameError('invalid', 'domain must be one of the nine life domains');
  const difficulty = input.difficulty ?? 'easy';
  if (!isDifficulty(difficulty)) throw new GameError('invalid', 'difficulty must be trivial, easy, medium or hard');
  const allowUp = input.allowUp === undefined ? true : Boolean(input.allowUp);
  const allowDown = input.allowDown === undefined ? input.type === 'habit' : Boolean(input.allowDown);
  if (input.type === 'habit' && !allowUp && !allowDown) throw new GameError('invalid', 'a habit needs a + or a - button');
  return {
    type: input.type as TaskType,
    title: str(input.title, 'title', 120, true),
    notes: str(input.notes, 'notes', 1000, false),
    domain: input.domain,
    difficulty,
    timeLabel: str(input.timeLabel, 'timeLabel', 40, false),
    days: days(input.days),
    allowUp,
    allowDown,
    forgiving: input.type === 'daily' && Boolean(input.forgiving),
  };
}

/** Partial update: only the provided fields are validated and applied. Type is immutable. */
export function applyTaskPatch(task: Task, patch: Record<string, unknown>): Task {
  const merged = validateTaskDraft({ ...task, ...patch, type: task.type });
  return { ...task, ...merged };
}

export function validateRewardDraft(input: Record<string, unknown>): { title: string; notes: string; cost: number } {
  const cost = Number(input.cost);
  if (!Number.isInteger(cost) || cost < 1 || cost > 100_000) throw new GameError('invalid', 'cost must be a whole number of gold, 1 or more');
  return { title: str(input.title, 'title', 120, true), notes: str(input.notes, 'notes', 500, false), cost };
}

export function validateSettings(input: Record<string, unknown>, current: Settings): Settings {
  const next = { ...current };
  if (input.timezone !== undefined) {
    if (!isValidTimeZone(input.timezone)) throw new GameError('invalid', 'timezone must be an IANA zone like Europe/Paris');
    next.timezone = input.timezone;
  }
  if (input.resetTime !== undefined) {
    if (!isValidResetTime(input.resetTime)) throw new GameError('invalid', 'resetTime must be HH:MM (24h)');
    next.resetTime = input.resetTime;
  }
  if (input.streakThreshold !== undefined) {
    const t = Number(input.streakThreshold);
    if (!(t > 0 && t <= 1)) throw new GameError('invalid', 'streakThreshold must be between 0 and 1');
    next.streakThreshold = t;
  }
  if (input.resting !== undefined) next.resting = Boolean(input.resting);
  return next;
}

// ---------------------------------------------------------------------------
// Helpers

export function isDue(task: Task, weekday: number): boolean {
  return task.type === 'daily' && task.days.includes(weekday);
}

export function currentDayKey(player: Player, now: Date): string {
  return dayKey(now, player.settings.timezone, player.settings.resetTime);
}

function event(now: Date, partial: Partial<GameEvent> & Pick<GameEvent, 'type' | 'text'>): GameEvent {
  return { ts: now.toISOString(), taskId: null, domain: null, xp: 0, gold: 0, hp: 0, stat: 0, ...partial };
}

/**
 * Adds (or removes) XP and announces level changes and newly unlocked gear.
 * Only levels above the player's peak refill HP, so unchecking and re-checking a task
 * around a level boundary can't be used as a free heal.
 */
export function applyXp(player: Player, delta: number, now: Date): Outcome {
  const before = levelInfo(player.totalXp).level;
  const totalXp = Math.max(0, player.totalXp + delta);
  const after = levelInfo(totalXp).level;
  const peak = Math.max(player.peakLevel ?? 1, before);
  let next: Player = { ...player, totalXp, peakLevel: Math.max(peak, after) };
  const notices: Notice[] = [];
  const events: GameEvent[] = [];
  if (after > peak) {
    next = { ...next, hp: RULES.maxHp };
    for (let l = peak + 1; l <= after; l++) {
      notices.push({ kind: 'levelUp', text: levelUpMessage(l) });
      events.push(event(now, { type: 'level_up', text: `Reached level ${l}` }));
      for (const item of CATALOG) {
        if (item.unlockLevel === l) notices.push({ kind: 'unlock', text: `Unlocked in the shop: ${item.name}` });
      }
    }
  } else if (after > before) {
    notices.push({ kind: 'info', text: `Level ${after} regained.` });
  } else if (after < before) {
    notices.push({ kind: 'levelDown', text: `Back to level ${after}.` });
  }
  return { player: next, notices, events };
}

/** Removes HP; at 0 the player faints (loses a level and half their gold, HP refills). */
export function applyDamage(player: Player, amount: number, now: Date): Outcome & { fainted: boolean } {
  if (amount <= 0) return { player, notices: [], events: [], fainted: false };
  const hp = player.hp - amount;
  if (hp > 0) return { player: { ...player, hp }, notices: [], events: [], fainted: false };

  const level = levelInfo(player.totalXp).level;
  const newLevel = Math.max(1, level - 1);
  const goldKept = player.gold > 0 ? Math.floor(player.gold * RULES.faintGoldKept) : player.gold;
  const next: Player = { ...player, hp: RULES.maxHp, totalXp: totalXpForLevel(newLevel), gold: goldKept };
  const text =
    level > 1
      ? `You fainted! Dropped to level ${newLevel} and lost ${player.gold - goldKept} gold. HP refilled. Get back up.`
      : `You fainted! Lost ${player.gold - goldKept} gold and your level progress. HP refilled. Get back up.`;
  return {
    player: next,
    notices: [{ kind: 'faint', text }],
    events: [event(now, { type: 'faint', text, gold: goldKept - player.gold, xp: next.totalXp - player.totalXp })],
    fainted: true,
  };
}

function merge(a: Outcome, b: Outcome): Outcome {
  return { player: b.player, task: b.task ?? a.task, notices: [...a.notices, ...b.notices], events: [...a.events, ...b.events] };
}

function addStat(player: Player, domain: Domain, delta: number): Player {
  return { ...player, stats: { ...player.stats, [domain]: Math.max(0, (player.stats[domain] ?? 0) + delta) } };
}

// ---------------------------------------------------------------------------
// Scoring

/** Check a daily or a to-do. */
export function completeTask(player: Player, task: Task, now: Date): Outcome {
  if (task.type === 'habit') throw new GameError('wrong_type', 'Habits are scored with + or -, not completed');
  if (task.completed) throw new GameError('already_completed', `"${task.title}" is already done`);

  const today = currentDayKey(player, now);
  const due = task.type === 'daily' && isDue(task, weekdayOf(today));
  const grant = rewardFor(task.difficulty, task.type === 'daily' ? task.streak : 0);
  const streak = due ? task.streak + 1 : task.streak;
  const nextTask: Task = {
    ...task,
    completed: true,
    completedAt: now.toISOString(),
    streak,
    bestStreak: Math.max(task.bestStreak, streak),
    lastGrant: { ...grant, dayKey: today, streakBefore: task.streak, bestStreakBefore: task.bestStreak },
  };

  let p = addStat({ ...player, gold: player.gold + grant.gold }, task.domain, grant.stat);
  const notices: Notice[] = [
    { kind: 'gain', text: `+${grant.xp} XP  +${grant.gold} gold  +${grant.stat} ${DOMAIN_INFO[task.domain].label}` },
  ];
  if (due && streak > 1 && streak % 7 === 0) notices.push({ kind: 'streak', text: `${streak}-day streak on "${task.title}"!` });
  const base: Outcome = {
    player: p,
    task: nextTask,
    notices,
    events: [event(now, { type: 'complete', taskId: task.id, domain: task.domain, xp: grant.xp, gold: grant.gold, stat: grant.stat, text: task.title })],
  };
  const xp = applyXp(p, grant.xp, now);
  p = xp.player;
  return merge(base, xp);
}

/** Uncheck a daily (same game day only) or a to-do, reversing exactly what was granted. */
export function uncompleteTask(player: Player, task: Task, now: Date): Outcome {
  if (task.type === 'habit') throw new GameError('wrong_type', 'Habits cannot be unchecked');
  if (!task.completed) throw new GameError('not_completed', `"${task.title}" is not checked`);

  const g = task.lastGrant;
  const nextTask: Task = { ...task, completed: false, completedAt: null, lastGrant: null };
  if (!g) return { player, task: nextTask, notices: [], events: [] };

  if (task.type === 'daily') {
    nextTask.streak = g.streakBefore;
    nextTask.bestStreak = g.bestStreakBefore;
  }
  const p = addStat({ ...player, gold: player.gold - g.gold }, task.domain, -g.stat);
  const base: Outcome = {
    player: p,
    task: nextTask,
    notices: [{ kind: 'loss', text: `Unchecked: -${g.xp} XP  -${g.gold} gold` }],
    events: [event(now, { type: 'undo', taskId: task.id, domain: task.domain, xp: -g.xp, gold: -g.gold, stat: -g.stat, text: task.title })],
  };
  return merge(base, applyXp(p, -g.xp, now));
}

/** Click + or - on a habit. */
export function scoreHabit(player: Player, task: Task, direction: 'up' | 'down', now: Date): Outcome {
  if (task.type !== 'habit') throw new GameError('wrong_type', `"${task.title}" is not a habit`);
  if (direction === 'up') {
    if (!task.allowUp) throw new GameError('invalid', `"${task.title}" has no + button`);
    const grant = rewardFor(task.difficulty, 0);
    const p = addStat({ ...player, gold: player.gold + grant.gold }, task.domain, grant.stat);
    const base: Outcome = {
      player: p,
      task: { ...task, counterUp: task.counterUp + 1 },
      notices: [{ kind: 'gain', text: `+${grant.xp} XP  +${grant.gold} gold  +${grant.stat} ${DOMAIN_INFO[task.domain].label}` }],
      events: [event(now, { type: 'habit_up', taskId: task.id, domain: task.domain, xp: grant.xp, gold: grant.gold, stat: grant.stat, text: task.title })],
    };
    return merge(base, applyXp(p, grant.xp, now));
  }
  if (!task.allowDown) throw new GameError('invalid', `"${task.title}" has no - button`);
  const dmg = damageFor(task.difficulty);
  const hurt = applyDamage(player, dmg, now);
  return {
    player: hurt.player,
    task: { ...task, counterDown: task.counterDown + 1 },
    notices: [{ kind: 'damage', text: `-${dmg} HP` }, ...hurt.notices],
    events: [event(now, { type: 'habit_down', taskId: task.id, domain: task.domain, hp: -dmg, text: task.title }), ...hurt.events],
  };
}

// ---------------------------------------------------------------------------
// Day reset ("cron")

/**
 * Rolls the game day over. Runs when the current game day differs from `player.lastDayKey`
 * (or always with `force`). Missed dailies from the day that ended cost HP once — if you were
 * away for several days you are only charged for the last one (mercy rule), but streaks still
 * break for any skipped day on which a daily was due.
 */
export function runDayReset(player: Player, tasks: Task[], now: Date, opts: { force?: boolean } = {}): ResetOutcome {
  const current = currentDayKey(player, now);
  const gap = daysBetween(player.lastDayKey, current);
  const force = Boolean(opts.force);
  if (!force && gap <= 0) return { ran: false, player, tasks, notices: [], events: [], report: null };

  const ended = player.lastDayKey;
  const endedWeekday = weekdayOf(ended);
  const skippedDays = Math.max(0, gap - 1);
  const skippedWeekdays = new Set<number>();
  for (let i = 1; i <= Math.min(skippedDays, 7); i++) skippedWeekdays.add(weekdayOf(addDays(ended, i)));
  const resting = player.settings.resting;

  const dailies = tasks.filter((t) => t.type === 'daily');
  const dueDailies = dailies.filter((t) => isDue(t, endedWeekday));
  const done = dueDailies.filter((t) => t.completed);
  const missed = dueDailies.filter((t) => !t.completed);
  const missedReport = missed.map((t) => ({ id: t.id, title: t.title, damage: resting || t.forgiving ? 0 : damageFor(t.difficulty) }));
  const damage = missedReport.reduce((s, m) => s + m.damage, 0);

  const nextTasks = tasks.map((t): Task => {
    if (t.type === 'habit') return { ...t, counterUp: 0, counterDown: 0 };
    if (t.type !== 'daily') return t;
    let streak = t.streak;
    if (!resting) {
      if (isDue(t, endedWeekday) && !t.completed) streak = 0;
      if (t.days.some((d) => skippedWeekdays.has(d))) streak = 0;
    }
    return { ...t, completed: false, completedAt: null, lastGrant: null, streak };
  });

  let p: Player = { ...player, lastDayKey: current };
  const notices: Notice[] = [];
  const events: GameEvent[] = [];

  // Day streak: share of due dailies done on the day that ended.
  if (!resting) {
    if (dueDailies.length > 0) {
      const ratio = done.length / dueDailies.length;
      if (ratio >= player.settings.streakThreshold) {
        const dayStreak = player.dayStreak + 1;
        p = { ...p, dayStreak, bestDayStreak: Math.max(player.bestDayStreak, dayStreak) };
      } else {
        p = { ...p, dayStreak: 0 };
      }
    }
    if (skippedDays > 0 && dailies.some((t) => t.days.some((d) => skippedWeekdays.has(d)))) p = { ...p, dayStreak: 0 };
  }

  const hurt = applyDamage(p, damage, now);
  p = hurt.player;

  const pct = dueDailies.length ? Math.round((done.length / dueDailies.length) * 100) : 100;
  if (resting) {
    notices.push({ kind: 'reset', text: `New day. Rest mode is on: no damage, streaks frozen.` });
  } else if (missed.length === 0 && dueDailies.length > 0) {
    notices.push({ kind: 'reset', text: `Perfect day (${done.length}/${dueDailies.length})! Day streak: ${p.dayStreak}.` });
  } else {
    notices.push({
      kind: 'reset',
      text: `New day. Day closed with ${done.length}/${dueDailies.length} dailies (${pct}%). Missed ${missed.length}: -${damage} HP. Day streak: ${p.dayStreak}.`,
    });
  }
  if (skippedDays > 0) notices.push({ kind: 'info', text: `${skippedDays} day(s) skipped while away. Only the last day was charged.` });
  const gentle = missed.filter((t) => t.forgiving);
  if (gentle.length && !resting) notices.push({ kind: 'info', text: `${gentle.map((t) => t.title).join(', ')}: no HP lost. Reset and keep going.` });
  notices.push(...hurt.notices);

  const report: ResetReport = {
    endedDay: ended,
    newDay: current,
    due: dueDailies.length,
    done: done.length,
    missed: missedReport,
    damage,
    skippedDays,
    dayStreak: p.dayStreak,
    fainted: hurt.fainted,
    resting,
    forced: force,
  };
  events.push(event(now, { type: 'reset', hp: -damage, text: JSON.stringify(report) }), ...hurt.events);
  return { ran: true, player: p, tasks: nextTasks, notices, events, report };
}

// ---------------------------------------------------------------------------
// Shop

export function buyReward(player: Player, reward: Reward, now: Date): Outcome {
  if (player.gold < reward.cost) throw new GameError('not_enough_gold', `Not enough gold for "${reward.title}" (${player.gold}/${reward.cost})`);
  return {
    player: { ...player, gold: player.gold - reward.cost },
    notices: [{ kind: 'buy', text: `Bought "${reward.title}" for ${reward.cost} gold. Enjoy it, you earned it.` }],
    events: [event(now, { type: 'buy_reward', gold: -reward.cost, text: reward.title })],
  };
}

export function buyItem(player: Player, itemId: string, now: Date): Outcome {
  const item = findItem(itemId);
  if (!item) throw new GameError('not_found', `No shop item "${itemId}"`);
  const level = levelInfo(player.totalXp).level;
  if (level < item.unlockLevel) throw new GameError('locked', `${item.name} unlocks at level ${item.unlockLevel}`);
  if (item.slot !== 'consumable' && player.inventory.includes(item.id)) throw new GameError('owned', `You already own ${item.name}`);
  if (player.gold < item.cost) throw new GameError('not_enough_gold', `Not enough gold for ${item.name} (${player.gold}/${item.cost})`);

  if (item.slot === 'consumable') {
    if (player.hp >= RULES.maxHp) throw new GameError('hp_full', 'HP is already full');
    const heal = Math.min(item.heal ?? 0, RULES.maxHp - player.hp);
    return {
      player: { ...player, gold: player.gold - item.cost, hp: player.hp + heal },
      notices: [{ kind: 'heal', text: `Drank a ${item.name}: +${heal} HP.` }],
      events: [event(now, { type: 'potion', gold: -item.cost, hp: heal, text: item.name })],
    };
  }
  return {
    player: {
      ...player,
      gold: player.gold - item.cost,
      inventory: [...player.inventory, item.id],
      equipped: { ...player.equipped, [item.slot]: item.id },
    },
    notices: [{ kind: 'buy', text: `Got ${item.name}! Equipped.` }],
    events: [event(now, { type: 'buy_item', gold: -item.cost, text: item.name })],
  };
}

export function toggleEquip(player: Player, itemId: string): Player {
  const item = findItem(itemId);
  if (!item || item.slot === 'consumable') throw new GameError('not_found', `No equippable item "${itemId}"`);
  if (!player.inventory.includes(itemId)) throw new GameError('not_owned', `You don't own ${item.name}`);
  const slot = item.slot;
  return { ...player, equipped: { ...player.equipped, [slot]: player.equipped[slot] === itemId ? null : itemId } };
}

// ---------------------------------------------------------------------------
// Derived view for clients

export interface PlayerView extends Player {
  level: number;
  xpIntoLevel: number;
  xpToNext: number;
  maxHp: number;
  title: string;
  dayKey: string;
  nextResetAt: string;
}

export function playerView(player: Player, now: Date): PlayerView {
  const info = levelInfo(player.totalXp);
  return {
    ...player,
    ...info,
    maxHp: RULES.maxHp,
    title: titleForLevel(info.level),
    dayKey: currentDayKey(player, now),
    nextResetAt: nextResetAt(now, player.settings.timezone, player.settings.resetTime).toISOString(),
  };
}
