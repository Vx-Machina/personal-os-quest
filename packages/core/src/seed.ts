import type { TaskDraft } from './game';
import { ALL_DAYS } from './game';
import type { Domain } from './domains';
import type { Difficulty, TaskType } from './types';

export interface SeedTemplate {
  tasks: TaskDraft[];
  rewards: { title: string; notes: string; cost: number }[];
}

function t(
  type: TaskType,
  title: string,
  domain: Domain,
  difficulty: Difficulty,
  extra: Partial<TaskDraft> = {},
): TaskDraft {
  return {
    type,
    title,
    notes: '',
    domain,
    difficulty,
    timeLabel: '',
    days: [...ALL_DAYS],
    allowUp: true,
    allowDown: type === 'habit',
    ...extra,
  };
}

/**
 * The single-player seed: the example player's daily schedule plus daily essentials.
 * Domain tags are a first guess; edit them in the app.
 * Habits, to-dos and rewards are samples to show the mechanics.
 */
/** EXAMPLE DATA ONLY. */
export const PERSONAL_TEMPLATE: SeedTemplate = {
  tasks: [
    // Schedule
    t('daily', 'Morning routine', 'health', 'easy', { timeLabel: 'Morning' }),
    t('daily', 'Work block', 'career', 'medium', { timeLabel: '10:00-12:00' }),
    t('daily', 'Gym or work', 'health', 'medium', { timeLabel: '13:00-15:00', notes: 'Gym when possible, otherwise a third work block.' }),
    t('daily', 'Work block', 'career', 'medium', { timeLabel: '15:00-17:00' }),
    t('daily', 'Training / sports', 'health', 'hard', { timeLabel: '17:00-19:00' }),
    t('daily', 'Language practice', 'growth', 'easy', { timeLabel: '21:00-22:00' }),
    t('daily', 'Example: hobby practice', 'fun', 'easy', { timeLabel: '22:00-23:00' }),
    t('daily', 'Evening routine', 'environment', 'easy', { timeLabel: 'Evening' }),
    // Daily essentials
    t('daily', 'Example: outreach block', 'career', 'medium', { timeLabel: 'Essential' }),
    t('daily', 'Example: home admin', 'environment', 'easy', { timeLabel: 'Essential' }),
    t('daily', 'Example: share progress', 'social', 'easy', { timeLabel: 'Essential' }),
    t('daily', 'Example: portfolio update', 'career', 'medium', { timeLabel: 'Essential' }),
    t('daily', 'Example: help one community member', 'social', 'trivial', { timeLabel: 'Essential' }),
    // Sample habits
    t('habit', 'Drink a glass of water', 'health', 'trivial', { allowDown: false }),
    t('habit', 'Call or message family', 'family', 'easy', { allowDown: false }),
    t('habit', 'Quality time / message someone you love', 'love', 'easy', { allowDown: false }),
    t('habit', 'Log an expense', 'finance', 'trivial', { allowDown: false }),
    t('habit', 'Doomscrolling', 'growth', 'easy', { allowUp: false, allowDown: true }),
    // Sample one-off chores
    t('todo', 'Do the laundry', 'environment', 'easy'),
    t('todo', 'Update CV with latest project', 'career', 'medium'),
    t('todo', 'Review monthly budget', 'finance', 'medium'),
  ],
  rewards: [
    { title: 'Episode of a series', notes: 'Guilt-free.', cost: 20 },
    { title: 'Coffee out', notes: '', cost: 40 },
    { title: 'Lazy morning', notes: 'Skip the alarm once.', cost: 120 },
  ],
};

/** Generic starter set for any new player (e.g. a new Discord member). */
export const STARTER_TEMPLATE: SeedTemplate = {
  tasks: [
    t('daily', 'Morning routine', 'health', 'easy', { timeLabel: 'Morning' }),
    t('daily', 'Focused work block', 'career', 'medium'),
    t('daily', '20 minutes of learning', 'growth', 'easy'),
    t('daily', 'Tidy for 10 minutes', 'environment', 'trivial'),
    t('habit', 'Drink a glass of water', 'health', 'trivial', { allowDown: false }),
    t('habit', 'Reach out to a friend', 'social', 'easy', { allowDown: false }),
    t('habit', 'Doomscrolling', 'growth', 'easy', { allowUp: false, allowDown: true }),
    t('todo', 'Write down three goals for this month', 'growth', 'easy'),
  ],
  rewards: [
    { title: 'Episode of a series', notes: '', cost: 20 },
    { title: 'Treat yourself', notes: '', cost: 60 },
  ],
};
