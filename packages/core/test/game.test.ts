import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDamage,
  buyItem,
  buyReward,
  completeTask,
  GameError,
  scoreHabit,
  toggleEquip,
  uncompleteTask,
  validateTaskDraft,
  validateSettings,
  defaultSettings,
} from '../src/game';
import { levelInfo, totalXpForLevel } from '../src/level';
import { PERSONAL_TEMPLATE, STARTER_TEMPLATE } from '../src/seed';
import { makePlayer, makeTask, NOON_TUE } from './helpers';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof GameError) return e.code;
    throw e;
  }
  return undefined;
}

// --- Completing tasks -------------------------------------------------------

test('completing a daily grants XP, gold and its domain stat, and grows the streak', () => {
  const p = makePlayer();
  const t = makeTask('daily', { domain: 'career', difficulty: 'medium', streak: 4, bestStreak: 4 });
  const out = completeTask(p, t, NOON_TUE);
  // medium = 15 XP / 6 gold at streak 0; streak 4 gives +10% -> 16.5 -> 17 XP, 6.6 -> 7 gold
  assert.equal(out.player.totalXp, 17);
  assert.equal(out.player.gold, 7);
  assert.equal(out.player.stats.career, 2);
  assert.equal(out.player.stats.health, 0);
  assert.equal(out.task!.completed, true);
  assert.equal(out.task!.streak, 5);
  assert.equal(out.task!.bestStreak, 5);
  assert.equal(out.events[0].type, 'complete');
  assert.equal(out.events[0].stat, 2);
});

test('a daily cannot be completed twice, habits cannot be completed', () => {
  const p = makePlayer();
  const done = completeTask(p, makeTask('daily'), NOON_TUE).task!;
  assert.equal(code(() => completeTask(p, done, NOON_TUE)), 'already_completed');
  assert.equal(code(() => completeTask(p, makeTask('habit'), NOON_TUE)), 'wrong_type');
});

test('completing a daily that is not due today rewards but does not grow the streak', () => {
  // 2026-10-20 is a Tuesday (weekday 1). Task due only on Mondays.
  const t = makeTask('daily', { days: [0], streak: 3, bestStreak: 3 });
  const out = completeTask(makePlayer(), t, NOON_TUE);
  assert.equal(out.task!.streak, 3);
  assert.ok(out.player.totalXp > 0);
});

test('unchecking reverses exactly what was granted, including streaks and a level-up', () => {
  const p = makePlayer({ totalXp: 95, gold: 3, hp: 40 });
  const t = makeTask('daily', { domain: 'fun', difficulty: 'easy', streak: 2, bestStreak: 9 });
  const done = completeTask(p, t, NOON_TUE);
  assert.equal(levelInfo(done.player.totalXp).level, 2);
  const undone = uncompleteTask(done.player, done.task!, NOON_TUE);
  assert.equal(undone.player.totalXp, 95);
  assert.equal(undone.player.gold, 3);
  assert.equal(undone.player.stats.fun, 0);
  assert.equal(undone.task!.completed, false);
  assert.equal(undone.task!.streak, 2);
  assert.equal(undone.task!.bestStreak, 9);
  assert.equal(levelInfo(undone.player.totalXp).level, 1);
  assert.equal(code(() => uncompleteTask(undone.player, undone.task!, NOON_TUE)), 'not_completed');
});

test('to-dos complete once and can be unchecked', () => {
  const p = makePlayer();
  const t = makeTask('todo', { domain: 'environment', difficulty: 'hard' });
  const out = completeTask(p, t, NOON_TUE);
  assert.equal(out.player.totalXp, 20);
  assert.equal(out.player.stats.environment, 3);
  const back = uncompleteTask(out.player, out.task!, NOON_TUE);
  assert.equal(back.player.totalXp, 0);
});

// --- Habits -------------------------------------------------------------------

test('habit + rewards, habit - costs HP, and disabled buttons are refused', () => {
  const p = makePlayer();
  const h = makeTask('habit', { domain: 'family', difficulty: 'easy', allowUp: true, allowDown: true });
  const up = scoreHabit(p, h, 'up', NOON_TUE);
  assert.equal(up.player.totalXp, 10);
  assert.equal(up.player.stats.family, 1);
  assert.equal(up.task!.counterUp, 1);
  const down = scoreHabit(up.player, up.task!, 'down', NOON_TUE);
  assert.equal(down.player.hp, 48);
  assert.equal(down.task!.counterDown, 1);
  assert.equal(down.events[0].hp, -2);

  const plusOnly = makeTask('habit', { allowUp: true, allowDown: false });
  assert.equal(code(() => scoreHabit(p, plusOnly, 'down', NOON_TUE)), 'invalid');
  assert.equal(code(() => scoreHabit(p, makeTask('daily'), 'up', NOON_TUE)), 'wrong_type');
});

// --- HP damage and fainting ---------------------------------------------------

test('damage lowers HP; reaching 0 faints: -1 level, half gold, full HP', () => {
  const p = makePlayer({ totalXp: totalXpForLevel(3) + 200, gold: 101, hp: 10 });
  const hit = applyDamage(p, 4, NOON_TUE);
  assert.equal(hit.player.hp, 6);
  assert.equal(hit.fainted, false);

  const ko = applyDamage(p, 10, NOON_TUE);
  assert.equal(ko.fainted, true);
  assert.equal(levelInfo(ko.player.totalXp).level, 2);
  assert.equal(levelInfo(ko.player.totalXp).xpIntoLevel, 0);
  assert.equal(ko.player.gold, 50);
  assert.equal(ko.player.hp, 50);
  assert.equal(ko.notices[0].kind, 'faint');
});

test('fainting at level 1 keeps level 1 and resets progress', () => {
  const ko = applyDamage(makePlayer({ totalXp: 60, gold: 9, hp: 1 }), 3, NOON_TUE);
  assert.equal(levelInfo(ko.player.totalXp).level, 1);
  assert.equal(ko.player.totalXp, 0);
  assert.equal(ko.player.gold, 4);
});

test('a "-" habit click can make you faint', () => {
  const p = makePlayer({ hp: 2, totalXp: 150, gold: 20 });
  const h = makeTask('habit', { difficulty: 'medium', allowDown: true });
  const out = scoreHabit(p, h, 'down', NOON_TUE);
  assert.equal(out.player.hp, 50);
  assert.ok(out.notices.some((n) => n.kind === 'faint'));
  assert.ok(out.events.some((e) => e.type === 'faint'));
});

// --- Shop ---------------------------------------------------------------------

test('gear is level-locked, costs gold, is owned once and auto-equips', () => {
  const poor = makePlayer({ gold: 10 });
  assert.equal(code(() => buyItem(poor, 'hat-beanie', NOON_TUE)), 'not_enough_gold');
  assert.equal(code(() => buyItem(makePlayer({ gold: 999 }), 'hat-wizard', NOON_TUE)), 'locked');
  assert.equal(code(() => buyItem(poor, 'nope', NOON_TUE)), 'not_found');

  const rich = makePlayer({ gold: 100 });
  const out = buyItem(rich, 'hat-beanie', NOON_TUE);
  assert.equal(out.player.gold, 70);
  assert.deepEqual(out.player.inventory, ['hat-beanie']);
  assert.equal(out.player.equipped.hat, 'hat-beanie');
  assert.equal(code(() => buyItem(out.player, 'hat-beanie', NOON_TUE)), 'owned');

  const off = toggleEquip(out.player, 'hat-beanie');
  assert.equal(off.equipped.hat, null);
  assert.equal(toggleEquip(off, 'hat-beanie').equipped.hat, 'hat-beanie');
  assert.equal(code(() => toggleEquip(rich, 'pet-slime')), 'not_owned');
});

test('potions heal up to max HP and are refused at full HP', () => {
  const out = buyItem(makePlayer({ gold: 30, hp: 40 }), 'potion', NOON_TUE);
  assert.equal(out.player.hp, 50);
  assert.equal(out.player.gold, 5);
  assert.equal(code(() => buyItem(makePlayer({ gold: 30 }), 'potion', NOON_TUE)), 'hp_full');
});

test('custom rewards spend gold', () => {
  const reward = { id: 1, playerId: 1, title: 'Coffee out', notes: '', cost: 40 };
  assert.equal(code(() => buyReward(makePlayer({ gold: 39 }), reward, NOON_TUE)), 'not_enough_gold');
  const out = buyReward(makePlayer({ gold: 45 }), reward, NOON_TUE);
  assert.equal(out.player.gold, 5);
  assert.equal(out.events[0].gold, -40);
});

// --- Validation and seed ------------------------------------------------------

test('task validation applies defaults and rejects bad input', () => {
  const d = validateTaskDraft({ type: 'habit', title: '  Stretch ', domain: 'health' });
  assert.equal(d.title, 'Stretch');
  assert.equal(d.difficulty, 'easy');
  assert.equal(d.allowDown, true);
  assert.deepEqual(d.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(code(() => validateTaskDraft({ type: 'daily', title: 'x', domain: 'money' })), 'invalid');
  assert.equal(code(() => validateTaskDraft({ type: 'daily', title: '', domain: 'fun' })), 'invalid');
  assert.equal(code(() => validateTaskDraft({ type: 'daily', title: 'x', domain: 'fun', days: [7] })), 'invalid');
});

test('settings validation checks time zone and reset time', () => {
  const s = defaultSettings();
  assert.equal(validateSettings({ resetTime: '05:30' }, s).resetTime, '05:30');
  assert.equal(validateSettings({ timezone: 'America/New_York' }, s).timezone, 'America/New_York');
  assert.equal(code(() => validateSettings({ resetTime: '25:00' }, s)), 'invalid');
  assert.equal(code(() => validateSettings({ timezone: 'Mars/Olympus' }, s)), 'invalid');
});

test('seed templates are valid; personal seed has the 8 schedule dailies + 5 essentials', () => {
  for (const tpl of [PERSONAL_TEMPLATE, STARTER_TEMPLATE]) {
    for (const draft of tpl.tasks) validateTaskDraft({ ...draft });
  }
  assert.equal(PERSONAL_TEMPLATE.tasks.filter((t) => t.type === 'daily').length, 13);
});
