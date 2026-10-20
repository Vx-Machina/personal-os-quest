/**
 * Quest sync: how the goals module and the RPG quest board stay in step.
 *
 * 1. Goal tasks can be pushed to the quest board as to-dos. From then on, checking either
 *    side checks the other, and XP/gold come from the RPG rules (so the character levels up).
 *    Tasks that were never pushed can still be ticked off, without XP.
 * 2. Tracker goals are linked to one RPG daily or habit. Logging the tracker completes (or, for
 *    a smoking slip, unchecks) the quest; checking the quest on the board adds a minimal log.
 * 3. Goal-module rituals (pomodoros, protocols, reviews, badges) pay small rewards directly.
 */
import { DOMAIN_INFO, type Domain } from '../domains';
import { applyXp, completeTask, GameError, uncompleteTask, type TaskDraft } from '../game';
import { rewardFor } from '../rules';
import type { Difficulty, GameEvent, Notice, Outcome, Player, Task } from '../types';
import { SMOKE_BADGES } from './trackers';
import type { Goal, GoalSettings, GoalTask, LogEntry, ProtocolKey, TrackerKind } from './types';
import type { LogDraft } from './validate';
import { hhmmToMin } from './validate';

// ----------------------------------------------------------------------------- goal tasks <-> to-dos

export function questDraftFromGoalTask(task: GoalTask, goal: Goal): TaskDraft {
  return {
    type: 'todo',
    title: task.title,
    notes: `Goal: ${goal.title}${task.notes ? `\n${task.notes}` : ''}`,
    domain: goal.domain,
    difficulty: task.difficulty,
    timeLabel: task.due ? `due ${task.due}` : '',
    days: [0, 1, 2, 3, 4, 5, 6],
    allowUp: true,
    allowDown: false,
  };
}

export function canPush(task: GoalTask): void {
  if (task.questId !== null) throw new GameError('invalid', `"${task.title}" is already on the quest board`);
  if (task.done) throw new GameError('invalid', `"${task.title}" is already done`);
}

export interface TaskSyncOutcome extends Outcome {
  goalTask: GoalTask;
  quest: Task | null;
}

/** Tick a goal task. If it was pushed, the linked quest completes too and pays XP and gold. */
export function completeGoalTask(player: Player, task: GoalTask, quest: Task | null, now: Date): TaskSyncOutcome {
  if (task.done) throw new GameError('already_completed', `"${task.title}" is already done`);
  const goalTask: GoalTask = { ...task, done: true, doneAt: now.toISOString() };
  if (quest && !quest.completed) {
    const out = completeTask(player, quest, now);
    return { ...out, goalTask, quest: out.task ?? quest };
  }
  return {
    player,
    goalTask,
    quest,
    notices: [{ kind: 'info', text: quest ? `Done: ${task.title}` : `Done: ${task.title}. Push tasks to the quest board to earn XP for them.` }],
    events: [],
  };
}

/** Untick a goal task (and its quest, reversing the reward). */
export function uncompleteGoalTask(player: Player, task: GoalTask, quest: Task | null, now: Date): TaskSyncOutcome {
  if (!task.done) throw new GameError('not_completed', `"${task.title}" is not done`);
  const goalTask: GoalTask = { ...task, done: false, doneAt: null };
  if (quest && quest.completed) {
    const out = uncompleteTask(player, quest, now);
    return { ...out, goalTask, quest: out.task ?? quest };
  }
  return { player, goalTask, quest, notices: [], events: [] };
}

/** After a quest changed on the board, mirror its state onto linked goal tasks. Returns changed tasks. */
export function mirrorQuest(quest: Task, tasks: GoalTask[], now: Date): GoalTask[] {
  return tasks
    .filter((t) => t.questId === quest.id && t.done !== quest.completed)
    .map((t) => ({ ...t, done: quest.completed, doneAt: quest.completed ? now.toISOString() : null }));
}

// ----------------------------------------------------------------------------- trackers <-> linked quest

export type QuestAction = 'complete' | 'uncomplete' | 'score_up' | 'none';

export interface LogContext {
  today: string;
  settings: GoalSettings;
  /** Today's logs of the same tracker, including the new one. */
  todayLogs: LogEntry[];
  /** Pomodoros today including the new one. */
  pomodorosToday: number;
  mealQualifiesToday: boolean;
}

/** What the linked quest should do after a tracker entry was logged. Backfilled days never touch the quest. */
export function questActionForLog(tracker: TrackerKind, quest: Task, log: LogDraft, ctx: LogContext): QuestAction {
  if (log.dayKey !== ctx.today) return 'none';
  if (quest.type === 'habit') return tracker === 'gym' && log.kind === 'gym' ? 'score_up' : 'none';
  switch (tracker) {
    case 'smoking':
      return log.kind === 'smoke' && quest.completed ? 'uncomplete' : 'none';
    case 'wake': {
      if (log.kind !== 'wake' || quest.completed) return 'none';
      const isFirst = ctx.todayLogs.filter((l) => l.kind === 'wake').length <= 1;
      const onTime = log.value === null || log.value <= hhmmToMin(ctx.settings.wakeTarget) + ctx.settings.wakeGraceMin;
      return isFirst && onTime ? 'complete' : 'none';
    }
    case 'gym':
    case 'run':
    case 'sun':
      return log.kind === trackerLogKind(tracker) && !quest.completed ? 'complete' : 'none';
    case 'meals':
      return log.kind === 'meal' && ctx.mealQualifiesToday && !quest.completed ? 'complete' : 'none';
    case 'pomodoro':
      return log.kind === 'pomodoro' && ctx.pomodorosToday >= ctx.settings.pomodoroDailyTarget && !quest.completed ? 'complete' : 'none';
  }
}

export function trackerLogKind(tracker: TrackerKind): LogEntry['kind'] {
  const map: Record<TrackerKind, LogEntry['kind']> = { smoking: 'smoke', wake: 'wake', gym: 'gym', run: 'run', sun: 'sun', pomodoro: 'pomodoro', meals: 'meal' };
  return map[tracker];
}

export interface QuestToggleEffect {
  /** Minimal log to add (tag "quest") when the quest is checked on the board. */
  add: LogDraft | null;
  /** Remove today's quest-tagged log of this kind when the quest is unchecked. */
  remove: LogEntry['kind'] | null;
  /** Checking "smoke-free today" before a quit day is set starts the counter today. */
  startQuit: boolean;
}

/** What to log when a tracker-linked quest is toggled directly on the quest board. */
export function effectOfQuestToggle(tracker: TrackerKind, completed: boolean, today: string, settings: GoalSettings, alreadyLoggedToday: boolean): QuestToggleEffect {
  const none: QuestToggleEffect = { add: null, remove: null, startQuit: false };
  if (tracker === 'smoking') return { ...none, startQuit: completed && settings.smoking.quitDay === null };
  if (tracker === 'pomodoro') return none;
  const kind = trackerLogKind(tracker);
  if (!completed) return { ...none, remove: kind };
  if (alreadyLoggedToday) return none;
  return {
    ...none,
    add: { kind, dayKey: today, goalId: null, taskId: null, value: null, value2: tracker === 'meals' ? 1 : null, tag: 'quest', note: 'Checked on the quest board' },
  };
}

// ----------------------------------------------------------------------------- small rewards

export type GoalGrantKind = 'pomodoro' | 'protocol' | 'craving' | 'checkin' | 'gratitude' | 'kaizen' | 'hansei' | 'pareto' | 'lead' | 'yearReview' | 'fear';

export const GOAL_GRANTS: Record<GoalGrantKind, { difficulty: Difficulty; domain: Domain; label: string }> = {
  pomodoro: { difficulty: 'easy', domain: 'career', label: 'Pomodoro' },
  protocol: { difficulty: 'trivial', domain: 'health', label: 'Protocol' },
  craving: { difficulty: 'easy', domain: 'health', label: 'Craving resisted' },
  checkin: { difficulty: 'trivial', domain: 'health', label: 'Check-in' },
  gratitude: { difficulty: 'trivial', domain: 'growth', label: 'Ichigo ichie note' },
  kaizen: { difficulty: 'trivial', domain: 'growth', label: 'Kaizen 1%' },
  hansei: { difficulty: 'medium', domain: 'growth', label: 'Hansei review' },
  pareto: { difficulty: 'easy', domain: 'career', label: '80/20 review' },
  lead: { difficulty: 'trivial', domain: 'career', label: 'Lead domino chosen' },
  yearReview: { difficulty: 'hard', domain: 'growth', label: 'Wheel of life review' },
  fear: { difficulty: 'medium', domain: 'growth', label: 'Fear-setting' },
};

function grantEvent(now: Date, domain: Domain, xp: number, gold: number, stat: number, text: string): GameEvent {
  return { type: 'goal', ts: now.toISOString(), taskId: null, domain, xp, gold, hp: 0, stat, text };
}

/** Pay a small reward for a goal-module action. `domain` overrides the default (e.g. a pomodoro on a Fun goal). */
export function goalGrant(player: Player, kind: GoalGrantKind, now: Date, opts: { domain?: Domain; label?: string } = {}): Outcome {
  const g = GOAL_GRANTS[kind];
  const domain = opts.domain ?? g.domain;
  const r = rewardFor(g.difficulty);
  const label = opts.label ?? g.label;
  const p: Player = { ...player, gold: player.gold + r.gold, stats: { ...player.stats, [domain]: (player.stats[domain] ?? 0) + r.stat } };
  const xp = applyXp(p, r.xp, now);
  const notices: Notice[] = [{ kind: 'gain', text: `${label}: +${r.xp} XP  +${r.gold} gold  +${r.stat} ${DOMAIN_INFO[domain].label}` }, ...xp.notices];
  return { player: xp.player, notices, events: [grantEvent(now, domain, r.xp, r.gold, r.stat, label), ...xp.events] };
}

/** Smoke-free milestone badges not yet awarded, given the best streak so far. */
export function dueBadges(goal: Goal, bestStreak: number): (typeof SMOKE_BADGES)[number][] {
  return SMOKE_BADGES.filter((b) => bestStreak >= b.days && !goal.badges.includes(b.days));
}

export function badgeGrant(player: Player, badge: (typeof SMOKE_BADGES)[number], now: Date): Outcome {
  const p: Player = { ...player, gold: player.gold + badge.gold, stats: { ...player.stats, health: player.stats.health + 2 } };
  const xp = applyXp(p, badge.xp, now);
  const text = `Badge earned: ${badge.label} smoke-free! +${badge.xp} XP +${badge.gold} gold`;
  return { player: xp.player, notices: [{ kind: 'streak', text }, ...xp.notices], events: [grantEvent(now, 'health', badge.xp, badge.gold, 2, `Smoke-free badge: ${badge.label}`), ...xp.events] };
}

/** Protocol keys newly checked today that have not paid out yet. */
export function protocolsToPay(checked: ProtocolKey[], granted: ProtocolKey[]): ProtocolKey[] {
  return checked.filter((k) => !granted.includes(k));
}
