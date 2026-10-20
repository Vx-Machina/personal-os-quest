import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { isValidResetTime, isValidTimeZone } from '@poq/core';
import { createApp } from './app';
import { openDb } from './db';
import { config, loadEnv } from './env';
import { GameService } from './service';
import { GoalService } from './goals-service';

loadEnv();
const cfg = config();
if (!isValidTimeZone(cfg.timezone)) throw new Error(`DEFAULT_TIMEZONE "${cfg.timezone}" is not a valid IANA time zone`);
if (!isValidResetTime(cfg.resetTime)) throw new Error(`DEFAULT_RESET_TIME "${cfg.resetTime}" must be HH:MM`);

const db = openDb(cfg.dbPath);
const svc = new GameService(db, { defaults: { timezone: cfg.timezone, resetTime: cfg.resetTime, playerName: cfg.playerName } });
const local = svc.ensureLocalPlayer();
const goals = new GoalService(svc);
goals.ensureSeeded(local.id);
const app = createApp(svc, goals);

// Production: serve the built web app from the same port (npm run build && npm start).
if (existsSync(join(cfg.webDist, 'index.html'))) {
  const root = relative(process.cwd(), cfg.webDist) || '.';
  const indexHtml = readFileSync(join(cfg.webDist, 'index.html'), 'utf8');
  app.use('/*', serveStatic({ root }));
  app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.notFound() : c.html(indexHtml)));
}

// Roll the day over for every player when their reset time passes.
const tick = () => {
  try {
    const n = svc.tickAll();
    if (n) console.log(`Day reset ran for ${n} player(s)`);
  } catch (e) {
    console.error('Day reset tick failed', e);
  }
};
tick();
setInterval(tick, 60_000).unref();

serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.host }, (info) => {
  console.log(`Personal OS Quest API on http://${cfg.host}:${info.port}  (db: ${cfg.dbPath}, local player #${local.id} "${local.name}")`);
});
