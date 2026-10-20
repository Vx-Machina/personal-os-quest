/**
 * Level curve. XP needed to go from level L to L+1 is 100 * L^1.5, rounded to the nearest 10:
 * L1 -> 100, L2 -> 280, L3 -> 520, L4 -> 800, L5 -> 1120, L10 -> 3160.
 * A day of ~13 dailies earns roughly 150-200 XP, so level 2 comes on day one and
 * level 5 after about two weeks of steady play.
 */
export const MAX_LEVEL = 999;

export function xpToNext(level: number): number {
  return Math.round((100 * Math.pow(Math.max(1, level), 1.5)) / 10) * 10;
}

/** Lifetime XP at which `level` starts. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpToNext: number;
}

export function levelInfo(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  while (level < MAX_LEVEL && remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level++;
  }
  return { level, xpIntoLevel: remaining, xpToNext: xpToNext(level) };
}

const TITLES: [number, string][] = [
  [1, 'Novice'],
  [2, 'Apprentice'],
  [3, 'Journeyman'],
  [5, 'Adept'],
  [7, 'Ranger'],
  [10, 'Champion'],
  [15, 'Hero'],
  [20, 'Legend'],
  [30, 'Mythic'],
];

export function titleForLevel(level: number): string {
  let title = TITLES[0][1];
  for (const [min, name] of TITLES) if (level >= min) title = name;
  return title;
}

const FLAVOUR = [
  'Your routines are turning into armour.',
  'Small wins, stacked daily. Keep stacking.',
  'The quest log bows to your consistency.',
  'Another level. The future you says thanks.',
  'Momentum is a superpower. You have it.',
];

export function levelUpMessage(level: number): string {
  const title = titleForLevel(level);
  const promoted = TITLES.some(([min]) => min === level);
  const flavour = FLAVOUR[level % FLAVOUR.length];
  const article = /^[aeiou]/i.test(title) ? 'an' : 'a';
  return promoted
    ? `Level ${level}! You are now ${article} ${title}. HP restored. ${flavour}`
    : `Level ${level}! HP restored. ${flavour}`;
}
