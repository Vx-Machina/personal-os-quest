import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONAL_GOALS,
  badgeGrant,
  completeGoalTask,
  computeProgress,
  defaultGoalSettings,
  dueBadges,
  effectOfQuestToggle,
  goalGrant,
  gymStats,
  mealStats,
  mirrorQuest,
  pomodoroStats,
  questActionForLog,
  questDraftFromGoalTask,
  seedWindows,
  smokingStats,
  sunStats,
  uncompleteGoalTask,
  validateGoalDraft,
  validateLogDraft,
  validatePeriod,
  wakeStats,
  weekKey,
  type Goal,
  type GoalSettings,
  type GoalTask,
  type LogEntry,
  type LogDraft,
} from '../src/goals';
import { completeTask, runDayReset, GameError } from '../src/game';
import { levelInfo } from '../src/level';
import { addDays } from '../src/time';
import { makePlayer, makeTask, NOON_TUE } from './helpers';

const TODAY = '2026-10-20'; // a Tuesday; NOON_TUE is noon Paris on this day

let id = 1000;
function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: id++,
    playerId: 1,
    parentId: null,
    level: 'season',
    title: 'Goal',
    domain: 'health',
    result: '',
    purpose: '',
    easy: '',
    identity: '',
    woop: { wish: '', outcome: '', obstacle: '', plan: '' },
    ifThen: [],
    metric: null,
    questId: null,
    startDay: TODAY,
    endDay: addDays(TODAY, 89),
    status: 'active',
    badges: [],
    sortOrder: 0,
    createdAt: NOON_TUE.toISOString(),
    ...over,
  };
}

function gtask(goalId: number, over: Partial<GoalTask> = {}): GoalTask {
  return {
    id: id++,
    playerId: 1,
    goalId,
    title: 'Task',
    notes: '',
    difficulty: 'easy',
    due: null,
    done: false,
    doneAt: null,
    questId: null,
    top3Day: null,
    leverage: false,
    easy: '',
    pomodoros: 0,
    sortOrder: 0,
    createdAt: NOON_TUE.toISOString(),
    ...over,
  };
}

function log(kind: LogEntry['kind'], dayKey: string, over: Partial<LogEntry> = {}): LogEntry {
  return { id: id++, playerId: 1, kind, dayKey, ts: `${dayKey}T08:00:00.000Z`, goalId: null, taskId: null, value: null, value2: null, tag: '', note: '', ...over };
}

function settings(over: Partial<GoalSettings> = {}): GoalSettings {
  return { ...defaultGoalSettings(), ...over };
}

// ----------------------------------------------------------------------------- progress roll-up

test('roll-up: a tracker goal is measured by its tracker over its own window', () => {
  const s = settings({ smoking: { ...defaultGoalSettings().smoking, quitDay: addDays(TODAY, -9) } });
  const g = goal({ metric: { tracker: 'smoking' }, startDay: addDays(TODAY, -9), endDay: addDays(TODAY, 80) });
  const logs = [log('smoke', addDays(TODAY, -4), { value: 2 })];
  const p = computeProgress([g], [], logs, s, TODAY).get(g.id)!;
  // 10 days elapsed, one slip day -> 9 smoke-free days out of a 90-day window
  assert.equal(p.metric!.done, 9);
  assert.equal(p.metric!.target, 90);
  assert.equal(p.progress, 9 / 90);
  assert.ok(Math.abs(p.metric!.pace! - 0.9) < 1e-9, 'pace = done / expected-so-far');
});

test('roll-up: default targets (gym every 2 days, pomodoros per day) and explicit targets', () => {
  const s = settings({ pomodoroDailyTarget: 4 });
  const gym = goal({ metric: { tracker: 'gym' }, startDay: TODAY, endDay: addDays(TODAY, 5) });
  const pomo = goal({ metric: { tracker: 'pomodoro' }, startDay: TODAY, endDay: addDays(TODAY, 5) });
  const custom = goal({ metric: { tracker: 'run', target: 3 }, startDay: TODAY, endDay: addDays(TODAY, 5) });
  const logs = [log('gym', TODAY), log('gym', TODAY), log('pomodoro', TODAY), log('pomodoro', TODAY), log('run', TODAY)];
  const p = computeProgress([gym, pomo, custom], [], logs, s, TODAY);
  assert.equal(p.get(gym.id)!.metric!.target, 3, '6-day window -> 3 sessions');
  assert.equal(p.get(gym.id)!.metric!.done, 1, 'two sessions on the same day count once');
  assert.equal(p.get(pomo.id)!.metric!.target, 24);
  assert.equal(p.get(pomo.id)!.metric!.done, 2);
  assert.equal(p.get(custom.id)!.progress, 1 / 3);
});

test('roll-up: goals without a tracker average their milestones, targets and tasks', () => {
  const season = goal({ title: 'Launch portfolio' });
  const month = goal({ parentId: season.id, level: 'month', endDay: addDays(TODAY, 29), metric: { tracker: 'run' } });
  const week = goal({ parentId: season.id, level: 'week', endDay: addDays(TODAY, 5) });
  const dropped = goal({ parentId: season.id, level: 'week', status: 'dropped' });
  const runs = Array.from({ length: 15 }, (_, i) => log('run', addDays(TODAY, -i)));
  // month window starts today, so only today's run is inside it: 1 / 30
  const tasks = [gtask(week.id, { done: true }), gtask(week.id), gtask(season.id, { done: true }), gtask(season.id)];
  const p = computeProgress([season, month, week, dropped], tasks, runs, settings(), TODAY);
  assert.equal(p.get(month.id)!.progress, 1 / 30);
  assert.equal(p.get(week.id)!.progress, 0.5);
  assert.deepEqual(p.get(season.id)!.childIds, [month.id, week.id], 'dropped children are ignored');
  const expected = (1 / 30 + 0.5 + 1 + 0) / 4;
  assert.ok(Math.abs(p.get(season.id)!.progress - expected) < 1e-12);
  assert.equal(p.get(season.id)!.tasksDone, 1);
  assert.equal(p.get(season.id)!.tasksTotal, 2);
});

test('roll-up: three levels deep, done goals count 100%, empty goals 0%', () => {
  const season = goal();
  const month = goal({ parentId: season.id, level: 'month' });
  const week = goal({ parentId: month.id, level: 'week', status: 'done' });
  const empty = goal();
  const p = computeProgress([season, month, week, empty], [gtask(month.id)], [], settings(), TODAY);
  assert.equal(p.get(week.id)!.progress, 1);
  assert.equal(p.get(month.id)!.progress, 0.5, 'done week (1) + open task (0)');
  assert.equal(p.get(season.id)!.progress, 0.5);
  assert.equal(p.get(empty.id)!.progress, 0);
});

// ----------------------------------------------------------------------------- trackers

test('smoking: counter, best streak, badges, and money saved stays unknown until set', () => {
  const quit = addDays(TODAY, -6);
  const s = settings({ smoking: { quitDay: quit, baselinePerDay: null, packPrice: null, packSize: null, currency: '€' } });
  const logs = [log('smoke', addDays(TODAY, -3), { value: 3 }), log('craving', TODAY, { value: 4, value2: 1 }), log('craving', TODAY, { value: 2, value2: 0 })];
  const st = smokingStats(logs, s, TODAY);
  assert.equal(st.streak, 3, 'day -2, day -1, today');
  assert.equal(st.best, 3);
  assert.equal(st.smokeFreeDays, 6);
  assert.equal(st.lastSlip, addDays(TODAY, -3));
  assert.equal(st.money, null);
  assert.deepEqual(st.moneyMissing, ['cigarettes per day before quitting', 'price per pack', 'cigarettes per pack']);
  assert.deepEqual(st.badges.filter((b) => b.earned).map((b) => b.days), [1, 3]);
  assert.deepEqual(st.next, { days: 7, label: '1 week', inDays: 4 });
  assert.deepEqual(st.cravings, { today: 2, resistedToday: 1, week: 2, resistedWeek: 1 });

  const priced = smokingStats(logs, { ...s, smoking: { ...s.smoking, baselinePerDay: 10, packPrice: 12, packSize: 20 } }, TODAY);
  // 7 days since quit, 70 avoided minus the 3 smoked = 67 cigarettes x 0.60
  assert.equal(priced.money!.saved, 40.2);
  assert.equal(priced.money!.perDay, 6);
});

test('smoking: a slip today resets the counter without erasing badges', () => {
  const s = settings({ smoking: { ...defaultGoalSettings().smoking, quitDay: addDays(TODAY, -10) } });
  const st = smokingStats([log('smoke', TODAY, { value: 1 })], s, TODAY);
  assert.equal(st.streak, 0);
  assert.equal(st.slipToday, 1);
  assert.equal(st.best, 10);
  assert.ok(st.badges.find((b) => b.days === 7)!.earned);
  const notStarted = smokingStats([], settings(), TODAY);
  assert.equal(notStarted.started, false);
  assert.equal(notStarted.streak, 0);
});

test('wake: on-time streak (today pending), weekly averages', () => {
  const s = settings();
  const logs = [
    log('wake', addDays(TODAY, -1), { value: 7 * 60 + 50 }), // Mon 07:50
    log('wake', addDays(TODAY, -2), { value: 8 * 60 + 10 }), // Sun 08:10 (within 15 min grace)
    log('wake', addDays(TODAY, -3), { value: 9 * 60 }), // Sat 09:00 late
  ];
  const st = wakeStats(logs, s, TODAY);
  assert.equal(st.checkedToday, false);
  assert.equal(st.streak, 2, 'today not checked yet does not break the streak');
  assert.equal(st.weekAvg, '07:50', 'this week (Mon-) only has Monday');
  assert.equal(st.lastWeekAvg, '08:35', 'Sat 09:00 and Sun 08:10');
  const withToday = wakeStats([...logs, log('wake', TODAY, { value: 8 * 60 + 40 })], s, TODAY);
  assert.equal(withToday.onTimeToday, false);
  assert.equal(withToday.streak, 2);
});

test('gym: rolling 48-hour rule turns due after 24h and overdue (red) after 48h', () => {
  const logs = [log('gym', '2026-10-18', { ts: '2026-10-18T10:00:00.000Z' })];
  assert.equal(gymStats(logs, TODAY, new Date('2026-10-18T20:00:00Z')).status, 'ok');
  assert.equal(gymStats(logs, TODAY, new Date('2026-10-19T12:00:00Z')).status, 'due');
  const late = gymStats(logs, TODAY, new Date('2026-10-20T10:00:00Z'));
  assert.equal(late.status, 'overdue');
  assert.equal(late.hoursSince, 48);
  assert.equal(gymStats([], TODAY, NOON_TUE).status, 'none');
});

test('meals: a day counts when breakfast, lunch and dinner are logged and healthy', () => {
  const s = settings();
  const meal = (slot: string, min: number, healthy: number) => log('meal', TODAY, { tag: slot, value: min, value2: healthy });
  const st = mealStats([meal('breakfast', 9 * 60 + 20, 1), meal('lunch', 14 * 60, 1)], s, TODAY);
  assert.equal(st.qualifiesToday, false);
  assert.equal(st.slots[0].onTime, true);
  assert.equal(st.slots[1].onTime, false, '14:00 is more than 60 min after 12:30');
  assert.equal(st.slots[2].time, null);
  const full = mealStats([meal('breakfast', 540, 1), meal('lunch', 750, 1), meal('dinner', 1170, 1)], s, TODAY);
  assert.equal(full.qualifiesToday, true);
  const unhealthy = mealStats([meal('breakfast', 540, 1), meal('lunch', 750, 0), meal('dinner', 1170, 1)], s, TODAY);
  assert.equal(unhealthy.qualifiesToday, false);
  assert.equal(mealStats([log('meal', TODAY, { tag: 'quest', value2: 1 })], s, TODAY).qualifiesToday, true);
});

test('sunlight: minutes after waking and the 30-60 minute window', () => {
  const s = settings();
  const logs = [log('wake', TODAY, { value: 480 }), log('sun', TODAY, { value: 15, value2: 520 })];
  const st = sunStats(logs, s, TODAY);
  assert.equal(st.afterWakeMin, 40);
  assert.equal(st.withinWindow, true);
  assert.equal(st.todayMinutes, 15);
});

test('pomodoros are counted per day, per goal and per task', () => {
  const logs = [log('pomodoro', TODAY, { goalId: 7, taskId: 70 }), log('pomodoro', TODAY, { goalId: 7 }), log('pomodoro', addDays(TODAY, -1), { goalId: 8 })];
  const st = pomodoroStats(logs, settings(), TODAY);
  assert.equal(st.today, 2);
  assert.equal(st.total, 3);
  assert.deepEqual(st.byGoal[7], { today: 2, total: 2 });
  assert.equal(st.byTask[70], 1);
  assert.equal(st.week, 3, 'Monday counts in the same week');
});

// ----------------------------------------------------------------------------- quest sync

test('sync: ticking a pushed goal task completes its quest and pays XP; untick reverses it', () => {
  const g = goal({ domain: 'career' });
  const quest = makeTask('todo', { ...questDraftFromGoalTask(gtask(g.id, { title: 'Ship it' }), g), difficulty: 'hard' });
  const t = gtask(g.id, { title: 'Ship it', difficulty: 'hard', questId: quest.id });
  const p0 = makePlayer();
  const done = completeGoalTask(p0, t, quest, NOON_TUE);
  assert.equal(done.goalTask.done, true);
  assert.equal(done.quest!.completed, true);
  assert.equal(done.player.totalXp, 20);
  assert.equal(done.player.stats.career, 3);
  const back = uncompleteGoalTask(done.player, done.goalTask, done.quest, NOON_TUE);
  assert.equal(back.player.totalXp, 0);
  assert.equal(back.quest!.completed, false);
  assert.throws(() => uncompleteGoalTask(back.player, back.goalTask, back.quest, NOON_TUE), GameError);
});

test('sync: a task that was never pushed can be ticked but pays no XP', () => {
  const out = completeGoalTask(makePlayer(), gtask(1), null, NOON_TUE);
  assert.equal(out.goalTask.done, true);
  assert.equal(out.player.totalXp, 0);
  assert.match(out.notices[0].text, /Push tasks/);
});

test('sync: checking the quest on the board mirrors onto the goal task', () => {
  const quest = makeTask('todo');
  const linked = gtask(1, { questId: quest.id });
  const other = gtask(1, { questId: 999 });
  const done = completeTask(makePlayer(), quest, NOON_TUE).task!;
  const changed = mirrorQuest(done, [linked, other], NOON_TUE);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].id, linked.id);
  assert.equal(changed[0].done, true);
  assert.equal(mirrorQuest(done, changed, NOON_TUE).length, 0, 'already in sync');
});

test('sync: tracker logs drive the linked quest', () => {
  const s = settings({ pomodoroDailyTarget: 2 });
  const ctx = { today: TODAY, settings: s, todayLogs: [] as LogEntry[], pomodorosToday: 1, mealQualifiesToday: false };
  const daily = makeTask('daily');
  const doneDaily = { ...daily, completed: true };
  const habit = makeTask('habit');
  const draft = (kind: LogDraft['kind'], over: Partial<LogDraft> = {}): LogDraft => ({ kind, dayKey: TODAY, goalId: null, taskId: null, value: null, value2: null, tag: '', note: '', ...over });

  assert.equal(questActionForLog('smoking', doneDaily, draft('smoke', { value: 1 }), ctx), 'uncomplete', 'a slip unchecks smoke-free today (no HP)');
  assert.equal(questActionForLog('smoking', daily, draft('craving'), ctx), 'none');
  assert.equal(questActionForLog('wake', daily, draft('wake', { value: 475 }), { ...ctx, todayLogs: [log('wake', TODAY)] }), 'complete');
  assert.equal(questActionForLog('wake', daily, draft('wake', { value: 540 }), ctx), 'none', 'late: logged, not completed');
  assert.equal(questActionForLog('gym', habit, draft('gym'), ctx), 'score_up');
  assert.equal(questActionForLog('run', daily, draft('run', { value: 30 }), ctx), 'complete');
  assert.equal(questActionForLog('run', daily, draft('run', { dayKey: addDays(TODAY, -1) }), ctx), 'none', 'backfill leaves the quest alone');
  assert.equal(questActionForLog('pomodoro', daily, draft('pomodoro'), ctx), 'none');
  assert.equal(questActionForLog('pomodoro', daily, draft('pomodoro'), { ...ctx, pomodorosToday: 2 }), 'complete');
  assert.equal(questActionForLog('meals', daily, draft('meal', { tag: 'dinner' }), { ...ctx, mealQualifiesToday: true }), 'complete');
});

test('sync: checking a tracker quest on the board logs a minimal entry; unchecking removes it', () => {
  const s = settings();
  const run = effectOfQuestToggle('run', true, TODAY, s, false);
  assert.equal(run.add!.kind, 'run');
  assert.equal(run.add!.tag, 'quest');
  assert.equal(effectOfQuestToggle('run', true, TODAY, s, true).add, null, 'already logged today');
  assert.equal(effectOfQuestToggle('run', false, TODAY, s, true).remove, 'run');
  assert.equal(effectOfQuestToggle('smoking', true, TODAY, s, false).startQuit, true, 'first smoke-free tick starts the counter');
  const started = settings({ smoking: { ...s.smoking, quitDay: TODAY } });
  assert.equal(effectOfQuestToggle('smoking', true, TODAY, started, false).startQuit, false);
  assert.equal(effectOfQuestToggle('meals', true, TODAY, s, false).add!.value2, 1);
});

test('rewards: pomodoros and rituals pay into the right domain; badges pay once', () => {
  const p = goalGrant(makePlayer(), 'pomodoro', NOON_TUE, { domain: 'fun', label: 'Pomodoro on Guitar' });
  assert.equal(p.player.totalXp, 10);
  assert.equal(p.player.stats.fun, 1);
  assert.equal(p.events[0].type, 'goal');
  const g = goal({ badges: [1] });
  assert.deepEqual(dueBadges(g, 7).map((b) => b.days), [3, 7]);
  const b = badgeGrant(makePlayer(), dueBadges(g, 7)[1], NOON_TUE);
  assert.equal(levelInfo(b.player.totalXp).xpIntoLevel, 40);
  assert.match(b.notices[0].text, /1 week smoke-free/);
});

test('forgiving dailies break the streak but cost no HP at reset', () => {
  const p = makePlayer();
  const smokeFree = makeTask('daily', { difficulty: 'hard', streak: 5, forgiving: true });
  const normal = makeTask('daily', { difficulty: 'easy' });
  const out = runDayReset(p, [smokeFree, normal], new Date('2026-10-21T02:00:00Z'));
  assert.equal(out.report!.damage, 2, 'only the normal daily costs HP');
  assert.equal(out.tasks[0].streak, 0);
  assert.ok(out.notices.some((n) => /Reset and keep going/.test(n.text)));
});

// ----------------------------------------------------------------------------- validation and seed

test('validation: season windows default to 90 days; logs allow 14 days of backfill', () => {
  const g = validateGoalDraft({ title: 'Season goal', domain: 'fun' }, TODAY);
  assert.equal(g.startDay, TODAY);
  assert.equal(g.endDay, '2027-01-17');
  assert.throws(() => validateGoalDraft({ title: 'x', domain: 'fun', parentId: 3 }, TODAY), /season goals have no parent/);
  assert.throws(() => validateGoalDraft({ title: 'x', domain: 'fun', level: 'week', startDay: TODAY, endDay: addDays(TODAY, -1) }, TODAY), /endDay/);
  assert.equal(validateLogDraft({ kind: 'smoke' }, TODAY).value, 1);
  assert.throws(() => validateLogDraft({ kind: 'run', dayKey: addDays(TODAY, -15) }, TODAY), /14 days/);
  assert.throws(() => validateLogDraft({ kind: 'meal', value: 540 }, TODAY), /breakfast, lunch or dinner/);
  assert.equal(validatePeriod('hansei', weekKey(TODAY)), '2026-10-19');
  assert.throws(() => validatePeriod('hansei', TODAY), /not valid/);
});

test('seed: seven season goals, each with a tracker and a linked quest', () => {
  assert.equal(PERSONAL_GOALS.length, 7);
  const titles = PERSONAL_GOALS.map((g) => g.season.title);
  assert.deepEqual(titles, ['Example: quit a habit', 'Wake up at 08:00 every day', 'Gym at least every 2 days', 'Run every day', 'Morning sunlight', 'Pomodoro technique', 'Healthy meals at regular times']);
  const smoking = PERSONAL_GOALS[0];
  assert.equal(smoking.quest.forgiving, true);
  assert.deepEqual(smoking.season.ifThen, [{ if: 'I crave a cigarette', then: '10 deep breaths + a 5-minute walk' }]);
  assert.equal(PERSONAL_GOALS[2].quest.type, 'habit', 'gym is a habit so the 48h rule decides, not a daily');
  const w = seedWindows(TODAY);
  assert.equal(w.week.endDay, '2026-10-25');
  assert.equal(w.month.endDay, '2026-11-18');
  for (const g of PERSONAL_GOALS) validateGoalDraft({ ...g.season, level: 'season' }, TODAY);
});
