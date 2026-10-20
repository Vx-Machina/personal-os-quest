import type { Domain } from './domains';

export type TaskType = 'daily' | 'habit' | 'todo';
export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard';
export type Slot = 'hat' | 'weapon' | 'pet';

export interface Settings {
  /** IANA time zone, e.g. "Europe/Paris". */
  timezone: string;
  /** Local wall-clock time when the game day rolls over, "HH:MM". */
  resetTime: string;
  /** Share of due dailies (0..1) needed for a day to count toward the day streak. */
  streakThreshold: number;
  /** Rest mode: day resets still clear checkboxes but deal no damage and break no streaks. */
  resting: boolean;
}

export interface Player {
  id: number;
  name: string;
  /** Discord user id when this player is linked to a Discord account. */
  discordId: string | null;
  hp: number;
  /** Lifetime XP. Level and XP-into-level are derived from it (see level.ts). */
  totalXp: number;
  /** Can go negative if a completion is undone after the gold was spent. */
  gold: number;
  stats: Record<Domain, number>;
  /** Owned non-consumable item ids. */
  inventory: string[];
  equipped: Record<Slot, string | null>;
  dayStreak: number;
  bestDayStreak: number;
  /** Highest level ever reached. Level-up rewards (HP refill, fanfare) only fire above it. */
  peakLevel: number;
  /** The game day ("YYYY-MM-DD") the current checkbox state belongs to. */
  lastDayKey: string;
  settings: Settings;
  createdAt: string;
}

/** What a completion granted, kept so it can be reversed exactly. */
export interface Grant {
  xp: number;
  gold: number;
  stat: number;
  dayKey: string;
  streakBefore: number;
  bestStreakBefore: number;
}

export interface Task {
  id: number;
  playerId: number;
  type: TaskType;
  title: string;
  notes: string;
  domain: Domain;
  difficulty: Difficulty;
  /** Free-text schedule hint shown in the UI, e.g. "10:00-12:00". */
  timeLabel: string;
  /** Weekdays a daily is due: 0 = Monday ... 6 = Sunday. */
  days: number[];
  /** Habits only: which buttons are shown. */
  allowUp: boolean;
  allowDown: boolean;
  /** Dailies only: a missed day breaks the streak but costs no HP ("reset and keep going"). */
  forgiving: boolean;
  sortOrder: number;
  completed: boolean;
  completedAt: string | null;
  streak: number;
  bestStreak: number;
  counterUp: number;
  counterDown: number;
  lastGrant: Grant | null;
  createdAt: string;
}

export interface Reward {
  id: number;
  playerId: number;
  title: string;
  notes: string;
  cost: number;
}

export type NoticeKind = 'gain' | 'loss' | 'levelUp' | 'levelDown' | 'damage' | 'heal' | 'faint' | 'unlock' | 'streak' | 'reset' | 'buy' | 'info';

/** Human-facing message produced by a rule, rendered as a toast (web) or a line (Discord). */
export interface Notice {
  kind: NoticeKind;
  text: string;
}

export type EventType =
  | 'complete'
  | 'undo'
  | 'habit_up'
  | 'habit_down'
  | 'reset'
  | 'level_up'
  | 'faint'
  | 'buy_reward'
  | 'buy_item'
  | 'potion'
  | 'goal';

/** Append-only log entry. Stat deltas per domain feed the "last 7 days" wheel. */
export interface GameEvent {
  type: EventType;
  ts: string;
  taskId: number | null;
  domain: Domain | null;
  xp: number;
  gold: number;
  hp: number;
  stat: number;
  text: string;
}

export interface Outcome {
  player: Player;
  task?: Task;
  notices: Notice[];
  events: GameEvent[];
}

export interface ResetReport {
  endedDay: string;
  newDay: string;
  due: number;
  done: number;
  missed: { id: number; title: string; damage: number }[];
  damage: number;
  skippedDays: number;
  dayStreak: number;
  fainted: boolean;
  resting: boolean;
  forced: boolean;
}

export interface ResetOutcome {
  ran: boolean;
  player: Player;
  tasks: Task[];
  notices: Notice[];
  events: GameEvent[];
  report: ResetReport | null;
}
