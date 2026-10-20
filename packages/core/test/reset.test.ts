import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeTask, runDayReset, newPlayer } from '../src/game';
import { dayKey, nextResetAt, weekdayOf, addDays, daysBetween } from '../src/time';
import { makePlayer, makeTask, NOON_TUE, at } from './helpers';

// Paris is UTC+2 until 2026-10-25 03:00 local, then UTC+1.

test('game day honours the 04:00 Europe/Paris reset', () => {
  assert.equal(dayKey(at('2026-10-21T01:59:00Z'), 'Europe/Paris', '04:00'), '2026-10-20'); // 03:59 Paris
  assert.equal(dayKey(at('2026-10-21T02:00:00Z'), 'Europe/Paris', '04:00'), '2026-10-21'); // 04:00 Paris
  assert.equal(dayKey(at('2026-10-20T22:30:00Z'), 'Europe/Paris', '04:00'), '2026-10-20'); // 00:30 Paris next day
});

test('next reset instant is DST-aware', () => {
  assert.equal(nextResetAt(NOON_TUE, 'Europe/Paris', '04:00').toISOString(), '2026-10-21T02:00:00.000Z');
  // After the switch to winter time, 04:00 Paris is 03:00Z.
  assert.equal(nextResetAt(at('2026-10-25T12:00:00Z'), 'Europe/Paris', '04:00').toISOString(), '2026-10-26T03:00:00.000Z');
  // The night of the switch itself: clocks go back at 03:00, so 04:00 on 25 Oct is already UTC+1.
  assert.equal(nextResetAt(at('2026-10-24T12:00:00Z'), 'Europe/Paris', '04:00').toISOString(), '2026-10-25T03:00:00.000Z');
});

test('reset time and time zone are configurable', () => {
  // 23:30 New York on 20 Oct = 03:30Z on 21 Oct
  assert.equal(dayKey(at('2026-10-21T03:30:00Z'), 'America/New_York', '00:00'), '2026-10-20');
  assert.equal(dayKey(at('2026-10-21T04:00:00Z'), 'America/New_York', '00:00'), '2026-10-21');
  assert.equal(nextResetAt(at('2026-10-20T10:00:00Z'), 'Asia/Tokyo', '06:30').toISOString(), '2026-10-20T21:30:00.000Z');
});

test('calendar helpers', () => {
  assert.equal(weekdayOf('2026-10-19'), 0); // Monday
  assert.equal(weekdayOf('2026-10-20'), 1); // Tuesday
  assert.equal(weekdayOf('2026-10-25'), 6); // Sunday
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-20', '2026-10-23'), 3);
});

test('no reset within the same game day unless forced', () => {
  const p = makePlayer();
  const tasks = [makeTask('daily')];
  const out = runDayReset(p, tasks, at('2026-10-21T01:00:00Z'));
  assert.equal(out.ran, false);
  assert.equal(out.player, p);
});

test('day reset: missed dailies cost HP, done ones keep their streak, boxes clear', () => {
  const p0 = makePlayer({ hp: 50 });
  const a = makeTask('daily', { title: 'A', difficulty: 'medium', streak: 3, bestStreak: 3 });
  const b = makeTask('daily', { title: 'B', difficulty: 'hard', streak: 5, bestStreak: 5 });
  const c = makeTask('daily', { title: 'C', difficulty: 'easy', streak: 1, bestStreak: 1 });
  const habit = makeTask('habit', { counterUp: 4, counterDown: 2 });
  const todo = makeTask('todo');

  const doneA = completeTask(p0, a, NOON_TUE);
  const p1 = doneA.player;
  const tasks = [doneA.task!, b, c, habit, todo];

  const out = runDayReset(p1, tasks, at('2026-10-21T02:00:00Z'));
  assert.equal(out.ran, true);
  assert.equal(out.report!.endedDay, '2026-10-20');
  assert.equal(out.report!.newDay, '2026-10-21');
  assert.equal(out.report!.damage, 4 + 2); // hard + easy missed
  assert.equal(out.player.hp, 44);
  assert.equal(out.player.lastDayKey, '2026-10-21');

  const [ra, rb, rc, rh, rt] = out.tasks;
  assert.equal(ra.streak, 4, 'completed daily keeps the streak it earned');
  assert.equal(ra.completed, false, 'checkbox cleared for the new day');
  assert.equal(rb.streak, 0, 'missed daily loses its streak');
  assert.equal(rb.bestStreak, 5, 'best streak is kept');
  assert.equal(rc.streak, 0);
  assert.equal(rh.counterUp, 0);
  assert.equal(rh.counterDown, 0);
  assert.equal(rt, todo, 'to-dos are untouched');
  assert.equal(out.events[0].type, 'reset');
  assert.equal(out.events[0].hp, -6);
});

test('dailies not due on the day that ended deal no damage and keep their streak', () => {
  const p = makePlayer();
  // 2026-10-20 is a Tuesday (1). Only due at weekends.
  const weekend = makeTask('daily', { days: [5, 6], streak: 7, bestStreak: 7 });
  const out = runDayReset(p, [weekend], at('2026-10-21T02:00:00Z'));
  assert.equal(out.report!.due, 0);
  assert.equal(out.player.hp, 50);
  assert.equal(out.tasks[0].streak, 7);
});

test('day streak counts days at or above the completion threshold (default 75%)', () => {
  const tasks = [0, 1, 2, 3].map(() => makeTask('daily'));
  let p = makePlayer({ dayStreak: 2, bestDayStreak: 2 });
  let ts = tasks;
  for (const t of tasks.slice(0, 3)) {
    const out = completeTask(p, ts.find((x) => x.id === t.id)!, NOON_TUE);
    p = out.player;
    ts = ts.map((x) => (x.id === t.id ? out.task! : x));
  }
  const good = runDayReset(p, ts, at('2026-10-21T02:00:00Z'));
  assert.equal(good.player.dayStreak, 3);
  assert.equal(good.player.bestDayStreak, 3);

  // Next day: only 2/4 done -> streak breaks, best is kept.
  let p2 = good.player;
  let ts2 = good.tasks;
  for (const t of ts2.slice(0, 2)) {
    const out = completeTask(p2, t, at('2026-10-21T10:00:00Z'));
    p2 = out.player;
    ts2 = ts2.map((x) => (x.id === t.id ? out.task! : x));
  }
  const bad = runDayReset(p2, ts2, at('2026-10-22T02:00:00Z'));
  assert.equal(bad.player.dayStreak, 0);
  assert.equal(bad.player.bestDayStreak, 3);
});

test('away for several days: charged once (mercy rule) but streaks break', () => {
  const p0 = makePlayer({ dayStreak: 10, bestDayStreak: 10 });
  const a = makeTask('daily', { difficulty: 'medium', streak: 6, bestStreak: 6 });
  const b = makeTask('daily', { difficulty: 'medium', streak: 6, bestStreak: 6 });
  const doneA = completeTask(p0, a, NOON_TUE);
  // Next check happens three game days later (Friday 23 Oct, 09:00 Paris).
  const out = runDayReset(doneA.player, [doneA.task!, b], at('2026-10-23T07:00:00Z'));
  assert.equal(out.report!.skippedDays, 2);
  assert.equal(out.report!.damage, 3, 'only the last real day is charged');
  assert.equal(out.tasks[0].streak, 0, 'skipped days on which it was due break the streak');
  assert.equal(out.player.dayStreak, 0);
  assert.equal(out.player.bestDayStreak, 10);
  assert.equal(out.player.lastDayKey, '2026-10-23');
});

test('rest mode: no damage, streaks frozen, boxes still clear', () => {
  const p = makePlayer({ dayStreak: 4, settings: { ...newPlayer({ name: 'x', now: NOON_TUE }).settings, resting: true } });
  const t = makeTask('daily', { difficulty: 'hard', streak: 9, bestStreak: 9 });
  const out = runDayReset(p, [t], at('2026-10-24T02:00:00Z'));
  assert.equal(out.player.hp, 50);
  assert.equal(out.tasks[0].streak, 9);
  assert.equal(out.player.dayStreak, 4);
  assert.equal(out.report!.resting, true);
});

test('forced reset processes the current day immediately', () => {
  const p = makePlayer();
  const t = makeTask('daily', { difficulty: 'easy', streak: 2 });
  const out = runDayReset(p, [t], NOON_TUE, { force: true });
  assert.equal(out.ran, true);
  assert.equal(out.report!.forced, true);
  assert.equal(out.player.hp, 48);
  assert.equal(out.tasks[0].streak, 0);
  assert.equal(out.player.lastDayKey, '2026-10-20');
});

test('missing enough dailies at reset can make you faint', () => {
  const p = makePlayer({ hp: 5, totalXp: 120, gold: 40 });
  const tasks = [makeTask('daily', { difficulty: 'hard' }), makeTask('daily', { difficulty: 'hard' })];
  const out = runDayReset(p, tasks, at('2026-10-21T02:00:00Z'));
  assert.equal(out.report!.fainted, true);
  assert.equal(out.player.hp, 50);
  assert.equal(out.player.gold, 20);
  assert.equal(out.player.totalXp, 0);
});
