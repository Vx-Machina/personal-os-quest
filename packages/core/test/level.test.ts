import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelInfo, totalXpForLevel, xpToNext, titleForLevel, levelUpMessage } from '../src/level';
import { applyXp } from '../src/game';
import { rewardFor, damageFor, streakMultiplier } from '../src/rules';
import { makePlayer, NOON_TUE } from './helpers';

test('level curve: XP to next level follows 100 * L^1.5 rounded to 10', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 10].map(xpToNext), [100, 280, 520, 800, 1120, 3160]);
});

test('level curve: lifetime XP thresholds', () => {
  assert.equal(totalXpForLevel(1), 0);
  assert.equal(totalXpForLevel(2), 100);
  assert.equal(totalXpForLevel(3), 380);
  assert.equal(totalXpForLevel(4), 900);
});

test('levelInfo derives level and progress from lifetime XP', () => {
  assert.deepEqual(levelInfo(0), { level: 1, xpIntoLevel: 0, xpToNext: 100 });
  assert.deepEqual(levelInfo(99), { level: 1, xpIntoLevel: 99, xpToNext: 100 });
  assert.deepEqual(levelInfo(100), { level: 2, xpIntoLevel: 0, xpToNext: 280 });
  assert.deepEqual(levelInfo(379), { level: 2, xpIntoLevel: 279, xpToNext: 280 });
  assert.deepEqual(levelInfo(380), { level: 3, xpIntoLevel: 0, xpToNext: 520 });
  assert.equal(levelInfo(-50).level, 1);
});

test('titles and level-up messages', () => {
  assert.equal(titleForLevel(1), 'Novice');
  assert.equal(titleForLevel(4), 'Journeyman');
  assert.equal(titleForLevel(10), 'Champion');
  assert.match(levelUpMessage(3), /Level 3! You are now a Journeyman/);
  assert.match(levelUpMessage(4), /^Level 4! HP restored/);
});

test('XP rewards scale with difficulty and daily streak (capped at +50%)', () => {
  assert.deepEqual(rewardFor('trivial'), { xp: 5, gold: 2, stat: 1 });
  assert.deepEqual(rewardFor('easy'), { xp: 10, gold: 4, stat: 1 });
  assert.deepEqual(rewardFor('medium'), { xp: 15, gold: 6, stat: 2 });
  assert.deepEqual(rewardFor('hard'), { xp: 20, gold: 8, stat: 3 });
  assert.equal(streakMultiplier(10), 1.25);
  assert.deepEqual(rewardFor('medium', 10), { xp: 19, gold: 8, stat: 2 });
  assert.equal(streakMultiplier(1000), 1.5);
  assert.deepEqual(rewardFor('medium', 1000), { xp: 23, gold: 9, stat: 2 });
});

test('damage per missed daily or "-" habit scales with difficulty', () => {
  assert.deepEqual((['trivial', 'easy', 'medium', 'hard'] as const).map(damageFor), [1, 2, 3, 4]);
});

test('levelling up refills HP and announces every level crossed plus unlocks', () => {
  const p = makePlayer({ hp: 12 });
  const out = applyXp(p, 400, NOON_TUE);
  assert.equal(levelInfo(out.player.totalXp).level, 3);
  assert.equal(out.player.hp, 50);
  const levelUps = out.notices.filter((n) => n.kind === 'levelUp');
  assert.equal(levelUps.length, 2);
  const unlocks = out.notices.filter((n) => n.kind === 'unlock').map((n) => n.text);
  assert.ok(unlocks.some((t) => t.includes('Iron Sword')), 'level 2 unlock announced');
  assert.ok(unlocks.some((t) => t.includes('Wizard Hat')), 'level 3 unlock announced');
  assert.equal(out.events.filter((e) => e.type === 'level_up').length, 2);
});

test('losing XP can drop a level without touching HP', () => {
  const p = makePlayer({ totalXp: 105, hp: 30 });
  const out = applyXp(p, -10, NOON_TUE);
  assert.equal(levelInfo(out.player.totalXp).level, 1);
  assert.equal(out.player.hp, 30);
  assert.equal(out.notices[0].kind, 'levelDown');
});

test('re-crossing a level you already reached does not refill HP again (no undo/redo heal)', () => {
  const p = makePlayer({ totalXp: 95, hp: 20 });
  const up = applyXp(p, 10, NOON_TUE);
  assert.equal(up.player.hp, 50);
  assert.equal(up.player.peakLevel, 2);
  const down = applyXp({ ...up.player, hp: 20 }, -10, NOON_TUE);
  const again = applyXp(down.player, 10, NOON_TUE);
  assert.equal(levelInfo(again.player.totalXp).level, 2);
  assert.equal(again.player.hp, 20, 'no second refill');
  assert.equal(again.notices.filter((n) => n.kind === 'levelUp').length, 0);
  assert.match(again.notices[0].text, /regained/);
});

test('level-up message uses the right article', () => {
  assert.match(levelUpMessage(2), /You are now an Apprentice/);
  assert.match(levelUpMessage(5), /You are now an Adept/);
});
