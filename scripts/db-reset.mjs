// `npm run db:reset -- --yes`: deletes the SQLite database so the next start re-seeds it.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let dbPath = './data/quest.db';
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  const m = /^DB_PATH=(.+)$/m.exec(readFileSync(envFile, 'utf8'));
  if (m && m[1].trim()) dbPath = m[1].trim();
}
if (process.env.DB_PATH) dbPath = process.env.DB_PATH;
const file = isAbsolute(dbPath) ? dbPath : join(root, dbPath);

if (!process.argv.includes('--yes')) {
  console.log(`This deletes all progress in ${file}.\nRun again with:  npm run db:reset -- --yes`);
  process.exit(1);
}
let removed = 0;
for (const f of [file, `${file}-wal`, `${file}-shm`]) {
  if (existsSync(f)) {
    rmSync(f);
    removed++;
  }
}
console.log(removed ? `Deleted ${file}. Stop the server first if it is running; it re-seeds on next start.` : `Nothing to delete at ${file}.`);
