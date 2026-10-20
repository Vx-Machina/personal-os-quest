import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import { GameService } from '../src/service';
import { GoalService } from '../src/goals-service';

process.env.LOG_REQUESTS = '0';

/** Tuesday 20 Oct 2026, 08:00 in Paris. */
function setup(startIso = '2026-10-20T06:00:00Z') {
  let now = new Date(startIso);
  const svc = new GameService(openDb(':memory:'), { now: () => now, defaults: { timezone: 'Europe/Paris', resetTime: '04:00', playerName: 'Example Hero' } });
  svc.ensureLocalPlayer();
  const goalSvc = new GoalService(svc);
  goalSvc.ensureSeeded(1);
  const app = createApp(svc, goalSvc);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api/players/local${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    return { status: res.status, json };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quest = (state: any, title: string) => state.tasks.find((t: { title: string }) => t.title === title);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goal = (goals: any, title: string) => goals.goals.find((g: { title: string }) => g.title === title);
  return { call, quest, goal, setNow: (iso: string) => (now = new Date(iso)) };
}

test('seed: seven season goals with Month 1 and this-week targets, each linked to a quest', async () => {
  const { call, quest, goal } = setup();
  const r = await call('GET', '/goals');
  assert.equal(r.status, 200);
  const g = r.json.goals;
  assert.equal(g.goals.filter((x: { level: string }) => x.level === 'season').length, 7);
  assert.equal(g.goals.filter((x: { level: string }) => x.level === 'month').length, 7);
  assert.equal(g.goals.filter((x: { level: string }) => x.level === 'week').length, 7);
  const smoking = goal(g, 'Example: quit a habit');
  assert.equal(smoking.domain, 'health');
  assert.equal(smoking.endDay, '2027-01-17');
  assert.deepEqual(smoking.ifThen, [{ if: 'I crave a cigarette', then: '10 deep breaths + a 5-minute walk' }]);
  assert.equal(smoking.questTitle, 'Smoke-free today');
  assert.equal(quest(r.json.state, 'Smoke-free today').forgiving, true);
  assert.equal(quest(r.json.state, 'Gym session').type, 'habit');
  assert.equal(quest(r.json.state, 'Run').goalLink.title, 'Run every day');
  assert.equal(goal(g, 'Pomodoro technique').domain, 'career');
  assert.equal(g.settings.meals.lunch, '12:30');
  assert.equal(g.trackers.smoking.money, null, 'money saved unknown until pack price is set');
});

test('roll-up through the API: milestones and tasks feed a season goal without a tracker', async () => {
  const { call, goal } = setup();
  const season = (await call('POST', '/goals', { title: 'Launch portfolio site', domain: 'career' })).json.goals;
  const sid = goal(season, 'Launch portfolio site').id;
  const month = (await call('POST', '/goals', { title: 'Case studies drafted', domain: 'career', level: 'month', parentId: sid })).json.goals;
  const mid = goal(month, 'Case studies drafted').id;
  await call('POST', '/goal-tasks', { goalId: mid, title: 'Write case study 1' });
  await call('POST', '/goal-tasks', { goalId: mid, title: 'Write case study 2' });
  const t3 = (await call('POST', '/goal-tasks', { goalId: sid, title: 'Buy domain' })).json.goals.tasks.find((t: { title: string }) => t.title === 'Buy domain');
  let g = (await call('POST', `/goal-tasks/${t3.id}/complete`)).json.goals;
  assert.equal(goal(g, 'Case studies drafted').progress, 0);
  assert.equal(goal(g, 'Launch portfolio site').progress, 0.5, 'month 0% + own task 100%');
  const cs1 = g.tasks.find((t: { title: string }) => t.title === 'Write case study 1');
  g = (await call('POST', `/goal-tasks/${cs1.id}/complete`)).json.goals;
  assert.equal(goal(g, 'Case studies drafted').progress, 0.5);
  assert.equal(goal(g, 'Launch portfolio site').progress, 0.75);
  assert.equal((await call('POST', '/goals', { title: 'x', domain: 'career', level: 'week' })).status, 400, 'weekly targets need a parent');
});

test('quest sync: a pushed task completed on the quest board completes the goal task and pays XP', async () => {
  const { call, quest, goal } = setup();
  const sid = goal((await call('GET', '/goals')).json.goals, 'Pomodoro technique').id;
  const created = await call('POST', '/goal-tasks', { goalId: sid, title: 'Finish robot reel edit', difficulty: 'hard', push: true });
  const task = created.json.goals.tasks.find((t: { title: string }) => t.title === 'Finish robot reel edit');
  const q = quest(created.json.state, 'Finish robot reel edit');
  assert.equal(task.questId, q.id);
  assert.equal(q.goalLink.title, 'Pomodoro technique');

  const xp0 = created.json.state.player.totalXp;
  const done = await call('POST', `/tasks/${q.id}/complete`);
  assert.equal(done.json.state.player.totalXp, xp0 + 20);
  const after = (await call('GET', '/goals')).json.goals;
  assert.equal(after.tasks.find((t: { id: number }) => t.id === task.id).done, true);

  const undo = await call('POST', `/goal-tasks/${task.id}/uncomplete`);
  assert.equal(undo.json.state.player.totalXp, xp0);
  assert.equal(quest(undo.json.state, 'Finish robot reel edit').completed, false);

  const local = (await call('POST', '/goal-tasks', { goalId: sid, title: 'Plan the week' })).json.goals.tasks.find((t: { title: string }) => t.title === 'Plan the week');
  const pushed = await call('POST', `/goal-tasks/${local.id}/push`);
  assert.ok(quest(pushed.json.state, 'Plan the week'));
  assert.equal((await call('POST', `/goal-tasks/${local.id}/push`)).status, 400, 'cannot push twice');
  const del = await call('DELETE', `/goal-tasks/${local.id}`);
  assert.equal(quest(del.json.state, 'Plan the week'), undefined, 'deleting the task removes its quest');
});

test('tracker sync: logging completes linked quests; checking the quest logs the tracker', async () => {
  const { call, quest } = setup();
  const run = await call('POST', '/logs', { kind: 'run', value: 30, value2: 5 });
  assert.equal(run.status, 201);
  assert.equal(quest(run.json.state, 'Run').completed, true);
  assert.equal(run.json.goals.trackers.run.todayKm, 5);

  const late = await call('POST', '/logs', { kind: 'wake', value: 9 * 60 + 30 });
  assert.equal(quest(late.json.state, 'Wake up by 08:00').completed, false, 'late wake is logged but does not complete');
  assert.equal(late.json.goals.trackers.wake.onTimeToday, false);

  const checked = await call('POST', `/tasks/${quest(late.json.state, 'Morning sunlight').id}/complete`);
  const g = (await call('GET', '/goals')).json.goals;
  assert.equal(g.trackers.sun.doneToday, true, 'checking the quest logged sunlight');
  await call('POST', `/tasks/${quest(checked.json.state, 'Morning sunlight').id}/uncomplete`);
  assert.equal((await call('GET', '/goals')).json.goals.trackers.sun.doneToday, false, 'unchecking removed it');
});

test('smoking: first tick starts the counter; a slip unchecks the day with no HP loss; cravings pay when resisted', async () => {
  const { call, quest } = setup();
  const s0 = (await call('GET', '/goals')).json;
  const q = quest(s0.state, 'Smoke-free today');
  const tick = await call('POST', `/tasks/${q.id}/complete`);
  assert.ok(tick.json.notices.some((n: { text: string }) => /counter started/.test(n.text)));
  const g1 = (await call('GET', '/goals')).json.goals;
  assert.equal(g1.settings.smoking.quitDay, '2026-10-20');
  assert.equal(g1.trackers.smoking.streak, 1);

  const hp = tick.json.state.player.hp;
  const slip = await call('POST', '/logs', { kind: 'smoke', value: 2 });
  assert.equal(quest(slip.json.state, 'Smoke-free today').completed, false);
  assert.equal(slip.json.state.player.hp, hp, 'no HP lost for a slip');
  assert.ok(slip.json.notices.some((n: { text: string }) => /Reset and keep going/.test(n.text)));
  assert.equal(slip.json.goals.trackers.smoking.streak, 0);

  const xp = slip.json.state.player.totalXp;
  const craving = await call('POST', '/logs', { kind: 'craving', value: 4, value2: true, note: 'after coffee' });
  assert.ok(craving.json.state.player.totalXp > xp);
  assert.ok(craving.json.notices.some((n: { text: string }) => /10 deep breaths/.test(n.text)));

  const money = await call('PUT', '/journal/settings/main', { data: { smoking: { baselinePerDay: 15, packPrice: 12.5, packSize: 20 } } });
  assert.equal(money.json.goals.trackers.smoking.money.perDay, 9.38);
});

test('smoking badges are awarded once, for full smoke-free days', async () => {
  const { call, setNow } = setup();
  await call('PUT', '/journal/settings/main', { data: { smoking: { quitDay: '2026-10-12' } } });
  setNow('2026-10-20T10:00:00Z');
  const r = await call('GET', '/goals');
  const smoking = r.json.goals.goals.find((g: { title: string }) => g.title === 'Example: quit a habit');
  assert.deepEqual(smoking.badges, [1, 3, 7], '8 full days since 12 Oct');
  const again = await call('GET', '/goals');
  assert.equal(again.json.state.player.totalXp, r.json.state.player.totalXp, 'no double payout');
});

test('gym: scoring the habit logs a session; after 48 hours the quest shows overdue', async () => {
  const { call, quest, setNow } = setup();
  const s = (await call('GET', '/goals')).json.state;
  const scored = await call('POST', `/tasks/${quest(s, 'Gym session').id}/score`, { direction: 'up' });
  assert.equal(quest(scored.json.state, 'Gym session').goalLink.alert, null);
  setNow('2026-10-22T07:00:00Z');
  const later = await call('GET', '/state');
  assert.equal(quest(later.json.state, 'Gym session').goalLink.alert, 'overdue');
  assert.equal((await call('GET', '/goals')).json.goals.trackers.gym.status, 'overdue');
});

test('pomodoros pay XP each, complete the daily at the target, and deleting one takes it back', async () => {
  const { call, quest, goal } = setup();
  const pomo = goal((await call('GET', '/goals')).json.goals, 'Pomodoro technique');
  let r;
  for (let i = 0; i < 4; i++) r = await call('POST', '/logs', { kind: 'pomodoro', value: 25, goalId: pomo.id });
  assert.equal(quest(r!.json.state, 'Deep work: pomodoros').completed, true);
  assert.equal(r!.json.goals.trackers.pomodoro.today, 4);
  assert.equal(goal(r!.json.goals, 'Pomodoro technique').pomodorosToday, 4);
  const xp = r!.json.state.player.totalXp;
  const fifth = await call('POST', '/logs', { kind: 'pomodoro', value: 25 });
  assert.equal(fifth.json.state.player.totalXp, xp + 10);
  const logId = fifth.json.goals.recentLogs.find((l: { kind: string }) => l.kind === 'pomodoro').id;
  const removed = await call('DELETE', `/logs/${logId}`);
  assert.equal(removed.json.state.player.totalXp, xp);
  assert.equal(removed.json.goals.trackers.pomodoro.today, 4);
});

test('journal: rituals pay once per period; protocols pay once per key per day', async () => {
  const { call } = setup();
  const xp0 = (await call('GET', '/state')).json.state.player.totalXp;
  await call('PUT', '/journal/checkin/2026-10-20', { data: { mood: 4, energy: 3, note: '' } });
  await call('PUT', '/journal/checkin/2026-10-20', { data: { mood: 5, energy: 3, note: 'better' } });
  const p1 = await call('PUT', '/journal/protocols/2026-10-20', { data: { checked: ['caffeine', 'winddown'] } });
  const p2 = await call('PUT', '/journal/protocols/2026-10-20', { data: { checked: ['caffeine'] } });
  const p3 = await call('PUT', '/journal/protocols/2026-10-20', { data: { checked: ['caffeine', 'winddown'] } });
  assert.equal(p3.json.state.player.totalXp, p1.json.state.player.totalXp, 're-checking does not pay twice');
  assert.equal(p2.json.goals.protocols.find((p: { key: string }) => p.key === 'winddown').checked, false);
  assert.equal(p1.json.state.player.totalXp, xp0 + 5 + 10, 'check-in 5 XP + two protocols 5 XP each');
  const hansei = await call('PUT', '/journal/hansei/2026-10-19', { data: { wentWell: 'Ran 3 times', didnt: '', change: 'Earlier bedtime' } });
  assert.ok(hansei.json.notices.some((n: { text: string }) => /Hansei/.test(n.text)));
  assert.equal(hansei.json.goals.journal.hansei.thisWeek.change, 'Earlier bedtime');
  assert.equal((await call('PUT', '/journal/hansei/2026-10-20', { data: {} })).status, 400, 'weeks start on Monday');
  assert.equal((await call('PUT', '/journal/nope/main', { data: {} })).status, 400);
  const fear = await call('PUT', '/journal/fear/quit-job', { data: { title: 'Go full-time on the studio', define: ['Run out of money'], prevent: ['6 months runway'], repair: ['Contract work'] } });
  assert.equal(fear.json.goals.journal.fears[0].data.title, 'Go full-time on the studio');
  assert.equal((await call('DELETE', '/journal/fear/quit-job')).json.goals.journal.fears.length, 0);
});

test('forgiving dailies: missing "Smoke-free today" at reset costs no HP; next week can be planned', async () => {
  const { call, setNow } = setup();
  const before = (await call('GET', '/state')).json.state.player.hp;
  setNow('2026-10-21T02:30:00Z');
  const r = await call('GET', '/state');
  const missed = r.json.state.lastReset.missed;
  assert.equal(missed.find((m: { title: string }) => m.title === 'Smoke-free today').damage, 0);
  assert.equal(r.json.state.player.hp, before - r.json.state.lastReset.damage);

  const plan = await call('POST', '/goals/plan-next-week');
  const weeks = plan.json.goals.goals.filter((g: { level: string; startDay: string }) => g.level === 'week' && g.startDay === '2026-10-26');
  assert.equal(weeks.length, 7);
  assert.match((await call('POST', '/goals/plan-next-week')).json.notices[0].text, /already planned/);
});

test("top 3: at most three tasks pinned for today", async () => {
  const { call, goal } = setup();
  const sid = goal((await call('GET', '/goals')).json.goals, 'Run every day').id;
  const ids: number[] = [];
  for (const title of ['A', 'B', 'C', 'D']) {
    const g = (await call('POST', '/goal-tasks', { goalId: sid, title })).json.goals;
    ids.push(g.tasks.find((t: { title: string }) => t.title === title).id);
  }
  for (const id of ids.slice(0, 3)) await call('PATCH', `/goal-tasks/${id}`, { top3: true });
  const full = await call('PATCH', `/goal-tasks/${ids[3]}`, { top3: true });
  assert.equal(full.status, 400);
  const g = (await call('GET', '/goals')).json.goals;
  assert.deepEqual(g.top3.map((t: { title: string }) => t.title).sort(), ['A', 'B', 'C']);
});
