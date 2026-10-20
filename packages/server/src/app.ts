import { Hono, type Context } from 'hono';
import { GameError, JOURNAL_KINDS, type JournalKind } from '@poq/core';
import { composeAvatar, scale } from '@poq/sprites';
import { encodePng } from '@poq/sprites/png';
import type { GameService, Result } from './service';
import { GoalService, type GoalResult } from './goals-service';
import * as repo from './repo';

/**
 * REST API. Every route lives under /api. Players are addressed by numeric id,
 * or by "local" for the single-player character created on first run.
 */
export function createApp(svc: GameService, goalSvc?: GoalService): Hono {
  const app = new Hono();
  const goals = goalSvc ?? new GoalService(svc);

  app.onError((err, c) => {
    if (err instanceof GameError) {
      return c.json({ ok: false, error: { code: err.code, message: err.message } }, err.code === 'not_found' ? 404 : 400);
    }
    console.error(err);
    return c.json({ ok: false, error: { code: 'internal', message: 'Something went wrong on the server' } }, 500);
  });

  app.use('/api/*', async (c, next) => {
    const started = Date.now();
    await next();
    if (process.env.LOG_REQUESTS !== '0') console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - started}ms`);
  });

  const api = new Hono();

  const pid = (c: Context): number => {
    const raw = c.req.param('pid');
    if (raw === 'local') return svc.localPlayerId();
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new GameError('invalid', 'player id must be a positive integer or "local"');
    return n;
  };
  const num = (c: Context, name: string): number => {
    const n = Number(c.req.param(name));
    if (!Number.isInteger(n) || n < 1) throw new GameError('invalid', `${name} must be a positive integer`);
    return n;
  };
  const body = async (c: Context): Promise<Record<string, unknown>> => {
    const text = await c.req.text();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* fall through */
    }
    throw new GameError('invalid', 'request body must be a JSON object');
  };
  const ok = (c: Context, r: Result, status: 200 | 201 = 200) => c.json({ ok: true, notices: r.notices, state: r.state }, status);

  api.get('/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

  // Players
  api.get('/players', (c) => c.json({ ok: true, players: svc.listPlayers() }));
  api.post('/players', async (c) => {
    const p = svc.createPlayer(String((await body(c)).name ?? ''));
    return c.json({ ok: true, player: { id: p.id, name: p.name } }, 201);
  });
  api.post('/players/resolve', async (c) => {
    const b = await body(c);
    const out = svc.resolveDiscord(String(b.discordId ?? ''), String(b.name ?? ''), Boolean(b.claimLocal));
    return c.json({ ok: true, player: { id: out.player.id, name: out.player.name }, created: out.created, linked: out.linked });
  });
  api.get('/players/:pid/state', (c) => ok(c, svc.state(pid(c))));
  api.patch('/players/:pid', async (c) => ok(c, svc.updatePlayer(pid(c), await body(c))));
  api.post('/players/:pid/reset', async (c) => ok(c, svc.reset(pid(c), Boolean((await body(c)).force))));

  // Tasks
  api.post('/players/:pid/tasks', async (c) => ok(c, svc.createTask(pid(c), await body(c)), 201));
  api.patch('/players/:pid/tasks/:tid', async (c) => ok(c, svc.updateTask(pid(c), num(c, 'tid'), await body(c))));
  api.delete('/players/:pid/tasks/:tid', (c) => ok(c, svc.deleteTask(pid(c), num(c, 'tid'))));
  api.post('/players/:pid/tasks/:tid/complete', (c) => ok(c, svc.complete(pid(c), num(c, 'tid'))));
  api.post('/players/:pid/tasks/:tid/uncomplete', (c) => ok(c, svc.uncomplete(pid(c), num(c, 'tid'))));
  api.post('/players/:pid/tasks/:tid/score', async (c) => ok(c, svc.score(pid(c), num(c, 'tid'), (await body(c)).direction)));

  // Rewards and shop
  api.post('/players/:pid/rewards', async (c) => ok(c, svc.createReward(pid(c), await body(c)), 201));
  api.patch('/players/:pid/rewards/:rid', async (c) => ok(c, svc.updateReward(pid(c), num(c, 'rid'), await body(c))));
  api.delete('/players/:pid/rewards/:rid', (c) => ok(c, svc.deleteReward(pid(c), num(c, 'rid'))));
  api.post('/players/:pid/buy', async (c) => {
    const b = await body(c);
    return ok(c, svc.buy(pid(c), b.kind, b.id));
  });
  api.post('/players/:pid/equip', async (c) => ok(c, svc.equip(pid(c), (await body(c)).itemId)));

  // Goals module (same player, same DB). Responses carry both the RPG state and the goals state.
  const gok = (c: Context, r: GoalResult, status: 200 | 201 = 200) => c.json({ ok: true, notices: r.notices, state: r.state, goals: r.goals }, status);
  const jkind = (c: Context): JournalKind => {
    const k = c.req.param('kind') as JournalKind;
    if (!JOURNAL_KINDS.includes(k)) throw new GameError('invalid', `unknown journal kind "${k}"`);
    return k;
  };
  api.get('/players/:pid/goals', (c) => gok(c, goals.state(pid(c))));
  api.post('/players/:pid/goals', async (c) => gok(c, goals.createGoal(pid(c), await body(c)), 201));
  api.post('/players/:pid/goals/plan-next-week', (c) => gok(c, goals.planNextWeek(pid(c))));
  api.patch('/players/:pid/goals/:gid', async (c) => gok(c, goals.updateGoal(pid(c), num(c, 'gid'), await body(c))));
  api.delete('/players/:pid/goals/:gid', (c) => gok(c, goals.deleteGoal(pid(c), num(c, 'gid'))));
  api.post('/players/:pid/goal-tasks', async (c) => gok(c, goals.createTask(pid(c), await body(c)), 201));
  api.patch('/players/:pid/goal-tasks/:id', async (c) => gok(c, goals.updateTask(pid(c), num(c, 'id'), await body(c))));
  api.delete('/players/:pid/goal-tasks/:id', (c) => gok(c, goals.deleteTask(pid(c), num(c, 'id'))));
  api.post('/players/:pid/goal-tasks/:id/complete', (c) => gok(c, goals.completeTask(pid(c), num(c, 'id'))));
  api.post('/players/:pid/goal-tasks/:id/uncomplete', (c) => gok(c, goals.uncompleteTask(pid(c), num(c, 'id'))));
  api.post('/players/:pid/goal-tasks/:id/push', (c) => gok(c, goals.pushTask(pid(c), num(c, 'id'))));
  api.post('/players/:pid/logs', async (c) => gok(c, goals.addLog(pid(c), await body(c)), 201));
  api.delete('/players/:pid/logs/:id', (c) => gok(c, goals.deleteLog(pid(c), num(c, 'id'))));
  api.put('/players/:pid/journal/:kind/:period', async (c) => gok(c, goals.putJournal(pid(c), jkind(c), c.req.param('period'), (await body(c)).data)));
  api.delete('/players/:pid/journal/:kind/:period', (c) => gok(c, goals.deleteJournal(pid(c), jkind(c), c.req.param('period'))));

  // Avatar as a PNG (used by the Discord bot)
  api.get('/players/:pid/avatar.png', (c) => {
    const player = repo.getPlayer(svc.db, pid(c));
    if (!player) throw new GameError('not_found', 'No such player');
    const k = Math.min(16, Math.max(1, Number(c.req.query('scale') ?? 8) || 8));
    const png = encodePng(scale(composeAvatar(player.equipped), k));
    return c.body(new Uint8Array(png), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
  });

  app.route('/api', api);
  app.notFound((c) =>
    c.req.path.startsWith('/api')
      ? c.json({ ok: false, error: { code: 'not_found', message: `No route ${c.req.method} ${c.req.path}` } }, 404)
      : c.text('Not found', 404),
  );
  return app;
}
