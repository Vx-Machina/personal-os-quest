/**
 * the example player's starting season: seven goals, each linked to one quest on the board, with a
 * Month 1 milestone and a target for the current week. Purpose, WOOP, identity and
 * action plans are left blank on purpose: they are yours to write.
 */
import { addDays } from '../time';
import type { TaskDraft } from '../game';
import type { Domain } from '../domains';
import type { Difficulty } from '../types';
import type { GoalDraft } from './validate';
import { SEASON_DAYS, weekEnd, weekKey } from './validate';
import type { IfThen, TrackerKind } from './types';

export interface GoalSeedItem {
  season: Omit<GoalDraft, 'parentId' | 'startDay' | 'endDay' | 'level'>;
  quest: TaskDraft;
  month: string;
  week: string;
}

const ALL = [0, 1, 2, 3, 4, 5, 6];
const blankWoop = { wish: '', outcome: '', obstacle: '', plan: '' };

function item(
  title: string,
  domain: Domain,
  tracker: TrackerKind,
  result: string,
  quest: { type: 'daily' | 'habit'; title: string; difficulty: Difficulty; timeLabel?: string; forgiving?: boolean; notes?: string },
  month: string,
  week: string,
  ifThen: IfThen[] = [],
): GoalSeedItem {
  return {
    season: { title, domain, result, purpose: '', easy: '', identity: '', woop: blankWoop, ifThen, metric: { tracker } },
    quest: {
      type: quest.type,
      title: quest.title,
      notes: quest.notes ?? `Linked to the goal "${title}".`,
      domain,
      difficulty: quest.difficulty,
      timeLabel: quest.timeLabel ?? '',
      days: ALL,
      allowUp: true,
      allowDown: false,
      forgiving: quest.forgiving ?? false,
    },
    month,
    week,
  };
}

/** EXAMPLE DATA ONLY: generic sample goals, not a real person's. */
export const PERSONAL_GOALS: GoalSeedItem[] = [
  item(
    'Example: quit a habit',
    'health',
    'smoking',
    'Cigarettes per day down to 0, then smoke-free for the season.',
    { type: 'daily', title: 'Smoke-free today', difficulty: 'easy', timeLabel: 'All day', forgiving: true, notes: 'Forgiving: a slip costs no HP. Reset and keep going.' },
    'First smoke-free month',
    'Smoke-free week',
    [{ if: 'I crave a cigarette', then: '10 deep breaths + a 5-minute walk' }],
  ),
  item('Wake up at 08:00 every day', 'health', 'wake', 'Up by 08:00 every day, with a stable weekly average.', { type: 'daily', title: 'Wake up by 08:00', difficulty: 'easy', timeLabel: '08:00' }, 'Up by 08:00 for a month', 'Up by 08:00 every day this week'),
  item('Gym at least every 2 days', 'health', 'gym', 'Never more than 48 hours without a gym session.', { type: 'habit', title: 'Gym session', difficulty: 'hard' }, 'Month 1: a session every 2 days', 'Gym every 2 days this week'),
  item('Run every day', 'health', 'run', 'A run every day, any distance.', { type: 'daily', title: 'Run', difficulty: 'medium' }, 'Run every day for a month', 'Run every day this week'),
  item('Morning sunlight', 'health', 'sun', 'Outdoor daylight soon after waking, every day.', { type: 'daily', title: 'Morning sunlight', difficulty: 'easy', timeLabel: 'After waking' }, 'Morning sunlight for a month', 'Morning sunlight every day this week'),
  item('Pomodoro technique', 'career', 'pomodoro', 'Focused work in 25/5 pomodoros, counted every day.', { type: 'daily', title: 'Deep work: pomodoros', difficulty: 'medium', notes: 'Completes itself when you reach your daily pomodoro target.' }, 'Month 1 pomodoros', 'Pomodoros this week'),
  item('Healthy meals at regular times', 'health', 'meals', 'Breakfast, lunch and dinner at set times, healthy.', { type: 'daily', title: '3 healthy meals on time', difficulty: 'easy', timeLabel: '09:00 / 12:30 / 19:30' }, 'Regular healthy meals for a month', 'Regular healthy meals this week'),
];

/** Windows for a season starting `today`: the season, its first 30 days, and the rest of this calendar week. */
export function seedWindows(today: string) {
  const seasonEnd = addDays(today, SEASON_DAYS - 1);
  return {
    season: { startDay: today, endDay: seasonEnd },
    month: { startDay: today, endDay: addDays(today, 29) },
    week: { startDay: today, endDay: weekEnd(today) },
  };
}

export const WEEK_TITLES: Record<TrackerKind, string> = {
  smoking: 'Smoke-free week',
  wake: 'Up on time every day',
  gym: 'Gym every 2 days',
  run: 'Run every day',
  sun: 'Morning sunlight every day',
  pomodoro: 'Pomodoros',
  meals: 'Regular healthy meals',
};

/** Week targets for next Monday-Sunday, one per active season goal with a tracker, clipped to the season. */
export function nextWeekWindows(today: string): { startDay: string; endDay: string } {
  const start = addDays(weekKey(today), 7);
  return { startDay: start, endDay: addDays(start, 6) };
}
