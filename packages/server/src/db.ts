/**
 * SQLite via Node's built-in `node:sqlite` (Node >= 22.13): no native build step.
 * The module still prints an "experimental" warning on some Node versions; we silence
 * just that one warning before loading it.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning: string | Error, ...rest: unknown[]) {
  const text = typeof warning === 'string' ? warning : warning?.message;
  if (text?.includes('SQLite is an experimental feature')) return;
  return (originalEmitWarning as (...a: unknown[]) => void).call(process, warning, ...rest);
} as typeof process.emitWarning;

// Loaded with require() (not a static import) so the warning filter above is already in place.
let sqlite: typeof import('node:sqlite');
try {
  sqlite = createRequire(import.meta.url)('node:sqlite');
} catch {
  throw new Error(`Personal OS Quest needs Node.js 22.13 or newer (built-in SQLite). You are on ${process.version}.`);
}

export type Db = InstanceType<typeof sqlite.DatabaseSync>;
export type Row = Record<string, unknown>;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    discord_id TEXT UNIQUE,
    hp INTEGER NOT NULL,
    total_xp INTEGER NOT NULL,
    gold INTEGER NOT NULL,
    stats TEXT NOT NULL,
    inventory TEXT NOT NULL,
    equipped TEXT NOT NULL,
    day_streak INTEGER NOT NULL DEFAULT 0,
    best_day_streak INTEGER NOT NULL DEFAULT 0,
    peak_level INTEGER NOT NULL DEFAULT 1,
    last_day_key TEXT NOT NULL,
    settings TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('daily', 'habit', 'todo')),
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    domain TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    time_label TEXT NOT NULL DEFAULT '',
    days TEXT NOT NULL,
    allow_up INTEGER NOT NULL,
    allow_down INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    counter_up INTEGER NOT NULL DEFAULT 0,
    counter_down INTEGER NOT NULL DEFAULT 0,
    last_grant TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX tasks_player ON tasks(player_id, type, sort_order);

  CREATE TABLE rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    cost INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    ts TEXT NOT NULL,
    type TEXT NOT NULL,
    task_id INTEGER,
    domain TEXT,
    xp INTEGER NOT NULL DEFAULT 0,
    gold INTEGER NOT NULL DEFAULT 0,
    hp INTEGER NOT NULL DEFAULT 0,
    stat INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX events_player_ts ON events(player_id, ts);
  `,
  // v2: goals module
  `
  ALTER TABLE tasks ADD COLUMN forgiving INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES goals(id) ON DELETE CASCADE,
    level TEXT NOT NULL CHECK (level IN ('season', 'month', 'week')),
    title TEXT NOT NULL,
    domain TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '',
    purpose TEXT NOT NULL DEFAULT '',
    easy TEXT NOT NULL DEFAULT '',
    identity TEXT NOT NULL DEFAULT '',
    woop TEXT NOT NULL DEFAULT '{}',
    if_then TEXT NOT NULL DEFAULT '[]',
    metric TEXT,
    quest_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    start_day TEXT NOT NULL,
    end_day TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    badges TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX goals_player ON goals(player_id, level, sort_order);

  CREATE TABLE goal_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    difficulty TEXT NOT NULL,
    due TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    done_at TEXT,
    quest_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    top3_day TEXT,
    leverage INTEGER NOT NULL DEFAULT 0,
    easy TEXT NOT NULL DEFAULT '',
    pomodoros INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX goal_tasks_player ON goal_tasks(player_id, goal_id);

  CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    day_key TEXT NOT NULL,
    ts TEXT NOT NULL,
    goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    task_id INTEGER REFERENCES goal_tasks(id) ON DELETE SET NULL,
    value REAL,
    value2 REAL,
    tag TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX logs_player_kind_day ON logs(player_id, kind, day_key);

  CREATE TABLE journal (
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    period TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (player_id, kind, period)
  );
  `,
];

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new sqlite.DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const row = db.prepare('PRAGMA user_version').get() as Row;
  let version = Number(row.user_version ?? 0);
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      version++;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Runs `fn` in a write transaction (serialised: node:sqlite is synchronous). */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
