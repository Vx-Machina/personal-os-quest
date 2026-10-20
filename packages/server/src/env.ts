import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (two levels above packages/<name>/src). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Loads ROOT/.env if present. Existing environment variables win. */
export function loadEnv(): void {
  const file = join(ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function config() {
  const dbPath = process.env.DB_PATH || './data/quest.db';
  return {
    port: Number(process.env.PORT || 8787),
    host: process.env.HOST || '127.0.0.1',
    dbPath: dbPath === ':memory:' || isAbsolute(dbPath) ? dbPath : join(ROOT, dbPath),
    timezone: process.env.DEFAULT_TIMEZONE || 'Europe/Paris',
    resetTime: process.env.DEFAULT_RESET_TIME || '04:00',
    playerName: process.env.PLAYER_NAME || 'Example Hero',
    webDist: join(ROOT, 'packages/web/dist'),
  };
}
