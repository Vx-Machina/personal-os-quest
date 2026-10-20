import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import { GameService } from '../src/service';

/** Fresh in-memory game with a controllable clock. */
function setup(startIso = '2026-10-20T10:00:00Z') {
  let now = new Date(startIso);
  const svc = new GameService(openDb(':memory:'), {
    now: () => now,
    defaults: { timezone: 'Europe/Paris', resetTime: '04:00', playerName: 'Example Hero' },
  });
  svc.ensureLocalPlayer();
  const app = createApp(svc);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get('content-type') ?? '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = type.includes('json') ? await res.json() : null;
    return { status: res.status, json, res };
  };
  return { svc, app, call, setNow: (iso: string) => (now = new Date(iso)) };
}

process.env.LOG_REQUESTS = '0';

test('first run seeds the local player with the schedule, essentials, samples and rewards', async () => {
  const { call } = setup();
  const { status, json } = await call('GET', '/players/local/state');
  assert.equal(status, 200);
  const { player, tasks, rewards } = json.state;
  assert.equal(player.name, 'Example Hero');
  assert.equal(player.level, 1);
  assert.equal(player.hp, 50);
  assert.equal(player.settings.timezone, 'Europe/Paris');
  assert.equal(player.settings.resetTime, '04:00');
  assert.equal(player.nextResetAt, '2026-10-21T02:00:00.000Z');
  assert.equal(tasks.filter((t: { type: string }) => t.type === 'daily').length, 13);
  assert.ok(tasks.some((t: { title: string; timeLabel: string }) => t.title === 'Work block' && t.timeLabel === '10:00-12:00'));
  assert.ok(tasks.some((t: { title: string }) => t.title === 'Example: help one community member'));
  assert.equal(rewards.length, 3);
});

test('complete, undo and habit scoring persist and feed the 7-day wheel', async () => {
  const { call } = setup();
  const state = (await call('GET', '/players/local/state')).json.state;
  const work = state.tasks.find((t: { title: string }) => t.title === 'Work block');

  const done = await call('POST', `/players/local/tasks/${work.id}/complete`);
  assert.equal(done.status, 200);
  assert.equal(done.json.state.player.totalXp, 15);
  assert.equal(done.json.state.player.stats.career, 2);
  assert.equal(done.json.state.stats7d.career, 2);

  const again = await call('POST', `/players/local/tasks/${work.id}/complete`);
  assert.equal(again.status, 400);
  assert.equal(again.json.error.code, 'already_completed');

  const undo = await call('POST', `/players/local/tasks/${work.id}/uncomplete`);
  assert.equal(undo.json.state.player.totalXp, 0);
  assert.equal(undo.json.state.stats7d.career, 0);

  const habit = state.tasks.find((t: { title: string }) => t.title === 'Doomscrolling');
  const down = await call('POST', `/players/local/tasks/${habit.id}/score`, { direction: 'down' });
  assert.equal(down.json.state.player.hp, 48);
  const bad = await call('POST', `/players/local/tasks/${habit.id}/score`, { direction: 'up' });
  assert.equal(bad.status, 400);
});

test('the day rolls over lazily on the next request after 04:00 Paris', async () => {
  const { call, setNow } = setup();
  const state = (await call('GET', '/players/local/state')).json.state;
  const morning = state.tasks.find((t: { title: string }) => t.title === 'Morning routine');
  await call('POST', `/players/local/tasks/${morning.id}/complete`);

  setNow('2026-10-21T01:59:00Z'); // 03:59 Paris: same game day
  const before = await call('GET', '/players/local/state');
  assert.equal(before.json.notices.length, 0);

  setNow('2026-10-21T02:00:30Z'); // 04:00 Paris: new day
  const after = await call('GET', '/players/local/state');
  assert.equal(after.json.notices[0].kind, 'reset');
  const s = after.json.state;
  assert.equal(s.player.dayKey, '2026-10-21');
  assert.equal(s.lastReset.done, 1);
  assert.equal(s.lastReset.due, 13);
  assert.equal(s.player.hp, 50 - s.lastReset.damage);
  const m = s.tasks.find((t: { id: number }) => t.id === morning.id);
  assert.equal(m.completed, false);
  assert.equal(m.streak, 1);
});

test('background tick resets every player whose day ended', async () => {
  const { svc, setNow } = setup();
  svc.resolveDiscord('111111111111', 'Friend', false);
  setNow('2026-10-21T03:00:00Z');
  assert.equal(svc.tickAll(), 2);
  assert.equal(svc.tickAll(), 0);
});

test('manual reset: refuses early without force, runs with force', async () => {
  const { call } = setup();
  const soft = await call('POST', '/players/local/reset');
  assert.match(soft.json.notices[0].text, /Not time yet/);
  const hard = await call('POST', '/players/local/reset', { force: true });
  assert.equal(hard.json.notices[0].kind, 'reset');
  assert.equal(hard.json.state.lastReset.forced, true);
});

test('Discord users map to players; the owner can claim the local player', async () => {
  const { call } = setup();
  const friend = await call('POST', '/players/resolve', { discordId: '222222222222', name: 'Friend' });
  assert.equal(friend.json.created, true);
  assert.notEqual(friend.json.player.id, 1);
  const same = await call('POST', '/players/resolve', { discordId: '222222222222', name: 'Friend' });
  assert.equal(same.json.player.id, friend.json.player.id);
  assert.equal(same.json.created, false);

  const owner = await call('POST', '/players/resolve', { discordId: '333333333333', name: 'Example Hero', claimLocal: true });
  assert.equal(owner.json.player.id, 1);
  assert.equal(owner.json.linked, true);
  // A second claimant cannot take over an already-linked local player.
  const other = await call('POST', '/players/resolve', { discordId: '444444444444', name: 'Other', claimLocal: true });
  assert.notEqual(other.json.player.id, 1);

  const friendState = await call('GET', `/players/${friend.json.player.id}/state`);
  assert.equal(friendState.json.state.tasks.filter((t: { type: string }) => t.type === 'daily').length, 4);
  assert.equal((await call('POST', '/players/resolve', { discordId: 'abc' })).status, 400);
});

test('shop: rewards and gear spend gold, equip toggles, avatar renders as PNG', async () => {
  const { call, svc } = setup();
  // Give the player some gold the honest way: complete a few dailies.
  const state = (await call('GET', '/players/local/state')).json.state;
  for (const t of state.tasks.filter((x: { type: string }) => x.type === 'daily')) await call('POST', `/players/local/tasks/${t.id}/complete`);
  const rich = (await call('GET', '/players/local/state')).json.state.player;
  assert.ok(rich.gold >= 60, `gold ${rich.gold}`);
  assert.ok(rich.level >= 2);

  const bought = await call('POST', '/players/local/buy', { kind: 'item', id: 'hat-beanie' });
  assert.equal(bought.json.state.player.equipped.hat, 'hat-beanie');
  const owned = await call('POST', '/players/local/buy', { kind: 'item', id: 'hat-beanie' });
  assert.equal(owned.json.error.code, 'owned');
  const locked = await call('POST', '/players/local/buy', { kind: 'item', id: 'hat-crown' });
  assert.equal(locked.json.error.code, 'locked');
  const off = await call('POST', '/players/local/equip', { itemId: 'hat-beanie' });
  assert.equal(off.json.state.player.equipped.hat, null);

  const reward = await call('POST', '/players/local/rewards', { title: 'Cinema night', cost: 30 });
  assert.equal(reward.status, 201);
  const id = reward.json.state.rewards.find((r: { title: string }) => r.title === 'Cinema night').id;
  const spent = await call('POST', '/players/local/buy', { kind: 'reward', id });
  assert.equal(spent.json.state.player.gold, rich.gold - 30 - 30);

  const png = await call('GET', '/players/local/avatar.png?scale=4');
  assert.equal(png.res.headers.get('content-type'), 'image/png');
  const bytes = new Uint8Array(await png.res.arrayBuffer());
  assert.deepEqual([...bytes.slice(1, 4)], [0x50, 0x4e, 0x47]); // "PNG"
  assert.ok(svc.listPlayers().length === 1);
});

test('tasks: create, edit, delete with validation', async () => {
  const { call } = setup();
  const created = await call('POST', '/players/local/tasks', { type: 'daily', title: 'Stretch', domain: 'health', difficulty: 'trivial', days: [0, 2, 4] });
  assert.equal(created.status, 201);
  const t = created.json.state.tasks.find((x: { title: string }) => x.title === 'Stretch');
  assert.deepEqual(t.days, [0, 2, 4]);
  assert.equal(t.dueToday, false); // 2026-10-20 is a Tuesday (1)

  const edited = await call('PATCH', `/players/local/tasks/${t.id}`, { domain: 'fun', title: 'Stretch + music' });
  const e = edited.json.state.tasks.find((x: { id: number }) => x.id === t.id);
  assert.equal(e.domain, 'fun');
  assert.equal(e.type, 'daily');

  assert.equal((await call('PATCH', `/players/local/tasks/${t.id}`, { difficulty: 'legendary' })).status, 400);
  assert.equal((await call('DELETE', `/players/local/tasks/${t.id}`)).status, 200);
  assert.equal((await call('DELETE', `/players/local/tasks/${t.id}`)).status, 404);
  assert.equal((await call('GET', '/players/99/state')).status, 404);
  assert.equal((await call('GET', '/nope')).status, 404);

  const settings = await call('PATCH', '/players/local', { settings: { resetTime: '05:30', timezone: 'Europe/London' } });
  assert.equal(settings.json.state.player.settings.resetTime, '05:30');
  assert.equal((await call('PATCH', '/players/local', { settings: { timezone: 'Nowhere/City' } })).status, 400);
});
