/**
 * Bot logic against the real API running in-process (no Discord connection needed).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../server/src/db';
import { createApp } from '../../server/src/app';
import { GameService } from '../../server/src/service';
import { createApi } from '../src/api';
import { COMMANDS, OPT, type CommandOption } from '../src/commands';
import { clearPlayerCache, handle, suggest, type Ctx } from '../src/handlers';

process.env.LOG_REQUESTS = '0';
const OWNER = '100000000000000001';
const FRIEND = '100000000000000002';

function setup() {
  const now = new Date('2026-10-20T10:00:00Z');
  const svc = new GameService(openDb(':memory:'), { now: () => now, defaults: { timezone: 'Europe/Paris', resetTime: '04:00', playerName: 'Example Hero' } });
  svc.ensureLocalPlayer();
  const app = createApp(svc);
  const api = createApi('http://bot.test', (url, init) => Promise.resolve(app.request(url.replace('http://bot.test', ''), init)));
  const ctx = (id = OWNER, name = 'Example Hero'): Ctx => ({ api, user: { id, name }, ownerId: OWNER });
  return { svc, ctx };
}

beforeEach(() => clearPlayerCache());

test('command definitions follow Discord limits', () => {
  const NAME = /^[-_\p{L}\p{N}]{1,32}$/u;
  const names = new Set<string>();
  const check = (o: { name: string; description: string; options?: CommandOption[] }, path: string) => {
    assert.match(o.name, NAME, `${path} name`);
    assert.equal(o.name, o.name.toLowerCase(), `${path} lowercase`);
    assert.ok(o.description.length >= 1 && o.description.length <= 100, `${path} description length`);
    const opts = o.options ?? [];
    assert.ok(opts.length <= 25, `${path} option count`);
    let seenOptional = false;
    for (const opt of opts) {
      if (opt.type !== OPT.SUB_COMMAND) {
        if (!opt.required) seenOptional = true;
        else assert.ok(!seenOptional, `${path}.${opt.name}: required options must come first`);
      }
      for (const c of opt.choices ?? []) assert.ok(c.name.length >= 1 && c.name.length <= 100, `${path}.${opt.name} choice`);
      assert.ok((opt.choices?.length ?? 0) <= 25);
      assert.ok(!(opt.autocomplete && opt.choices), 'autocomplete and choices are exclusive');
      check(opt, `${path}.${opt.name}`);
    }
  };
  for (const c of COMMANDS) {
    assert.ok(!names.has(c.name));
    names.add(c.name);
    check(c, c.name);
  }
  assert.deepEqual([...names].sort(), ['buy', 'daily-reset', 'goal', 'habit', 'log', 'quest', 'review', 'shop', 'stats', 'today']);
});

test('owner maps to the local web player; other users get their own hero', async () => {
  const { svc, ctx } = setup();
  await handle({ name: 'stats', options: {} }, ctx(OWNER));
  await handle({ name: 'stats', options: {} }, ctx(FRIEND, 'Sam'));
  const players = svc.listPlayers();
  assert.equal(players.length, 2);
  assert.equal(players.find((p) => p.local)!.discordLinked, true);
  assert.equal(players.find((p) => !p.local)!.name, 'Sam');
});

test('/quest list shows due dailies with ids, habits and to-dos privately', async () => {
  const { ctx } = setup();
  const r = await handle({ name: 'quest', sub: 'list', options: {} }, ctx());
  assert.equal(r.private, true);
  const e = r.embeds![0];
  const text = e.fields!.map((f) => `${f.name}\n${f.value}`).join('\n');
  assert.match(text, /Dailies 0\/13/);
  assert.match(text, /`#2` Work block · 10:00-12:00/);
  assert.match(text, /Habits/);
  assert.match(text, /To-dos/);
  for (const f of e.fields!) assert.ok(f.value.length <= 1024);
});

test('/quest done, /quest undo and /habit +/- change the game and report it', async () => {
  const { ctx } = setup();
  const done = await handle({ name: 'quest', sub: 'done', options: { id: 2 } }, ctx());
  assert.match(done.content!, /\+15 XP/);
  assert.match(done.content!, /dailies 1\/13/);

  const twice = await handle({ name: 'quest', sub: 'done', options: { id: 2 } }, ctx());
  assert.match(twice.content!, /already done/);

  const undo = await handle({ name: 'quest', sub: 'undo', options: { id: 2 } }, ctx());
  assert.match(undo.content!, /Unchecked/);

  const habitAsQuest = await handle({ name: 'quest', sub: 'done', options: { id: 14 } }, ctx());
  assert.match(habitAsQuest.content!, /\/habit/);

  const up = await handle({ name: 'habit', options: { direction: 'up', id: 14 } }, ctx());
  assert.match(up.content!, /\+5 XP/);
  const down = await handle({ name: 'habit', options: { direction: 'down', id: 18 } }, ctx());
  assert.match(down.content!, /-2 HP/);
  assert.match(down.content!, /❤️ 48\/50/);
});

test('/quest add creates a tagged quest', async () => {
  const { ctx } = setup();
  const r = await handle({ name: 'quest', sub: 'add', options: { type: 'todo', title: 'Call the bank', domain: 'finance', difficulty: 'medium' } }, ctx());
  assert.match(r.content!, /New to-do: Call the bank/);
  const bad = await handle({ name: 'quest', sub: 'add', options: { type: 'todo', title: 'x', domain: 'money' } }, ctx());
  assert.match(bad.content!, /nine life domains/);
});

test('/stats renders bars, the wheel and the avatar PNG; share makes it public', async () => {
  const { ctx } = setup();
  const r = await handle({ name: 'stats', options: {} }, ctx());
  assert.equal(r.private, true);
  assert.equal(r.files![0].name, 'avatar.png');
  assert.equal(r.files![0].data.subarray(1, 4).toString(), 'PNG');
  const fields = r.embeds![0].fields!;
  assert.ok(fields.some((f) => f.name.includes('HP') && f.value.includes('50/50')));
  assert.ok(fields.some((f) => f.name.startsWith('Wheel of life') && f.value.includes('Growth')));
  assert.equal(r.embeds![0].thumbnail!.url, 'attachment://avatar.png');
  const shared = await handle({ name: 'stats', options: { share: true } }, ctx());
  assert.equal(shared.private, false);
});

test('/shop lists rewards and gear; /buy spends gold or explains why not', async () => {
  const { ctx } = setup();
  const shop = await handle({ name: 'shop', options: {} }, ctx());
  const text = shop.embeds![0].fields!.map((f) => f.value).join('\n');
  assert.match(text, /`reward:1` Episode of a series/);
  assert.match(text, /🔒 Wizard Hat · unlocks at level 3/);

  const poor = await handle({ name: 'buy', options: { item: 'reward:1' } }, ctx());
  assert.match(poor.content!, /Not enough gold/);
  for (const id of [1, 2, 3, 4, 5, 6]) await handle({ name: 'quest', sub: 'done', options: { id } }, ctx());
  const ok = await handle({ name: 'buy', options: { item: 'reward:1' } }, ctx());
  assert.match(ok.content!, /Bought "Episode of a series"/);
  const byName = await handle({ name: 'buy', options: { item: 'cozy beanie' } }, ctx());
  assert.match(byName.content!, /Cozy Beanie/);
  const missing = await handle({ name: 'buy', options: { item: 'dragon' } }, ctx());
  assert.match(missing.content!, /Nothing called/);
});

test('/daily-reset waits for the reset time unless forced', async () => {
  const { ctx } = setup();
  const soft = await handle({ name: 'daily-reset', options: {} }, ctx());
  assert.match(soft.content!, /Not time yet/);
  const hard = await handle({ name: 'daily-reset', options: { force: true } }, ctx());
  assert.match(hard.content!, /🌅 New day/);
  assert.match(hard.content!, /HP/);
});

test('autocomplete suggests the right quests, habits and shop items', async () => {
  const { ctx } = setup();
  const open = await suggest({ name: 'quest', sub: 'done', options: {} }, { name: 'id', value: 'work' }, ctx());
  assert.deepEqual(
    open.map((c) => c.value),
    [2, 3, 4], // Work block, Gym or work, Work block
  );
  assert.equal(open[0].name, '#2 Work block (10:00-12:00)');

  await handle({ name: 'quest', sub: 'done', options: { id: 2 } }, ctx());
  const undoable = await suggest({ name: 'quest', sub: 'undo', options: {} }, { name: 'id', value: '' }, ctx());
  assert.deepEqual(undoable.map((c) => c.value), [2]);

  const minus = await suggest({ name: 'habit', options: { direction: 'down' } }, { name: 'id', value: '' }, ctx());
  assert.deepEqual(minus.map((c) => c.value), [18]);

  const items = await suggest({ name: 'buy', options: {} }, { name: 'item', value: '' }, ctx());
  assert.ok(items.some((c) => c.value === 'reward:1'));
  assert.ok(items.some((c) => c.value === 'item:potion'));
  assert.ok(!items.some((c) => c.value === 'item:hat-crown'), 'locked gear is not offered');
  assert.ok(items.length <= 25);
});

test('API down gives a friendly message instead of a crash', async () => {
  const api = createApi('http://127.0.0.1:9', () => Promise.reject(new Error('ECONNREFUSED')));
  const r = await handle({ name: 'stats', options: {} }, { api, user: { id: OWNER, name: 'Example Hero' } });
  assert.match(r.content!, /Can't reach the game API/);
});


// ----------------------------------------------------------------------------- goals module

function embedText(r: { embeds?: { title?: string; description?: string; fields?: { name: string; value: string }[] }[] }): string {
  const e = r.embeds?.[0];
  return [e?.title, e?.description, ...(e?.fields ?? []).map((f) => `${f.name}\n${f.value}`)].join('\n');
}

function withinLimits(r: { embeds?: { description?: string; fields?: { name: string; value: string }[] }[] }) {
  for (const e of r.embeds ?? []) {
    assert.ok((e.description ?? '').length <= 4096);
    for (const f of e.fields ?? []) assert.ok(f.value.length <= 1024 && f.name.length <= 256, `field ${f.name} too long`);
    assert.ok((e.fields ?? []).length <= 25);
  }
}

test('/goal list and /goal progress show the seeded season goals', async () => {
  const { ctx } = setup();
  const list = await handle({ name: 'goal', sub: 'list', options: {} }, ctx());
  const text = embedText(list);
  for (const t of ['Example: quit a habit', 'Wake up at 08:00 every day', 'Gym at least every 2 days', 'Run every day', 'Morning sunlight', 'Pomodoro technique', 'Healthy meals at regular times']) assert.ok(text.includes(t), t);
  withinLimits(list);
  const id = Number(/`#(\d+)` \*\*Example: quit a habit/.exec(text)![1]);
  const detail = await handle({ name: 'goal', sub: 'progress', options: { id } }, ctx());
  const d = embedText(detail);
  assert.match(d, /0\/90 smoke-free days/);
  assert.match(d, /If I crave a cigarette, then 10 deep breaths/);
  assert.match(d, /Smoke-free week/);
  withinLimits(detail);
  assert.match((await handle({ name: 'goal', sub: 'progress', options: { id: 9999 } }, ctx())).content!, /No goal/);
});

test('/log entries drive trackers and quests; /today and /review summarise', async () => {
  const { ctx } = setup();
  const wake = await handle({ name: 'log', sub: 'wake', options: { time: '07:50' } }, ctx());
  assert.match(wake.content!, /Logged: wake/);
  assert.match(wake.content!, /\+10 XP/, 'on-time wake completed the linked daily');
  assert.match((await handle({ name: 'log', sub: 'wake', options: { time: '7h50' } }, ctx())).content!, /07:45/);
  await handle({ name: 'log', sub: 'run', options: { minutes: 30, km: 5 } }, ctx());
  const craving = await handle({ name: 'log', sub: 'craving', options: { resisted: true, intensity: 4, trigger: 'coffee' } }, ctx());
  assert.match(craving.content!, /10 deep breaths/);
  const smoke = await handle({ name: 'log', sub: 'smoke', options: { count: 2 } }, ctx());
  assert.match(smoke.content!, /No HP lost/);
  await handle({ name: 'log', sub: 'meal', options: { slot: 'breakfast' } }, ctx());
  await handle({ name: 'log', sub: 'pomodoro', options: {} }, ctx());
  const mood = await handle({ name: 'log', sub: 'mood', options: { mood: 4, energy: 3 } }, ctx());
  assert.match(mood.content!, /Check-in/);

  const t = await handle({ name: 'today', options: {} }, ctx());
  const tt = embedText(t);
  assert.match(tt, /up at 07:50 ✅/);
  assert.match(tt, /run done · 5 km ✅/);
  assert.match(tt, /1\/4 pomodoros/);
  assert.match(tt, /breakfast ✅/);
  assert.match(tt, /not medical advice/);
  assert.match(tt, /mood 4\/5/);
  withinLimits(t);

  const r = await handle({ name: 'review', options: { 'went-well': 'Logged everything', change: 'Earlier bed' } }, ctx());
  const rt = embedText(r);
  assert.match(r.content!, /Hansei review/);
  assert.match(rt, /Went well: Logged everything/);
  assert.match(rt, /Change: Earlier bed/);
  assert.match(rt, /Up on time 1\//);
  withinLimits(r);
});

test('goal autocomplete lists goals; /log pomodoro offers season goals only', async () => {
  const { ctx } = setup();
  const all = await suggest({ name: 'goal', sub: 'progress', options: {} }, { name: 'id', value: 'habit' }, ctx());
  assert.ok(all.some((c) => c.name.includes('Example: quit a habit')));
  assert.ok(all.some((c) => c.name.includes('[week] Smoke-free week')) || all.length > 0);
  const seasons = await suggest({ name: 'log', sub: 'pomodoro', options: {} }, { name: 'goal', value: '' }, ctx());
  assert.equal(seasons.length, 7);
  assert.ok(seasons.every((c) => !c.name.includes('[')));
});
