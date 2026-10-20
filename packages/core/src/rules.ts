import type { Difficulty } from './types';

/**
 * All balancing numbers in one place. Change them here and every front end follows.
 * Values are MVP guesses, meant to be tuned after a week of real use.
 */
export const RULES = {
  maxHp: 50,
  baseXp: 10,
  baseGold: 4,
  /** HP lost per missed daily (or per "-" habit click) before the difficulty multiplier. */
  baseDamage: 2,
  /** Dailies earn +2.5% XP/gold per streak day, capped at +50%. */
  streakBonusPerDay: 0.025,
  streakBonusCap: 0.5,
  difficulty: { trivial: 0.5, easy: 1, medium: 1.5, hard: 2 } as Record<Difficulty, number>,
  /** Points added to the task's life-domain stat. */
  statPoints: { trivial: 1, easy: 1, medium: 2, hard: 3 } as Record<Difficulty, number>,
  /** Fainting (HP hits 0): lose one level (never below 1), keep this share of gold, refill HP. */
  faintGoldKept: 0.5,
  defaultStreakThreshold: 0.75,
} as const;

export const DIFFICULTIES: Difficulty[] = ['trivial', 'easy', 'medium', 'hard'];

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as string[]).includes(value);
}

export function streakMultiplier(streak: number): number {
  return 1 + Math.min(Math.max(0, streak) * RULES.streakBonusPerDay, RULES.streakBonusCap);
}

/** XP, gold and stat points for completing a task once. `streak` is the streak before this completion. */
export function rewardFor(difficulty: Difficulty, streak = 0): { xp: number; gold: number; stat: number } {
  const mult = RULES.difficulty[difficulty] * streakMultiplier(streak);
  return {
    xp: Math.round(RULES.baseXp * mult),
    gold: Math.round(RULES.baseGold * mult),
    stat: RULES.statPoints[difficulty],
  };
}

/** HP lost for one missed daily or one "-" habit click. */
export function damageFor(difficulty: Difficulty): number {
  return Math.max(1, Math.round(RULES.baseDamage * RULES.difficulty[difficulty]));
}
