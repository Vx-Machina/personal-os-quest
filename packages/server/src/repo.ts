/** Row <-> domain object mapping. All SQL lives here. */
import { DOMAINS, emptyStats, type Domain, type GameEvent, type Player, type Reward, type Task, type TaskDraft } from '@poq/core';
import type { Db, Row } from './db';

const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== 'string') return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

// ----------------------------------------------------------------------------- meta

export function getMeta(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as Row | undefined;
  return row ? String(row.value) : null;
}

export function setMeta(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

// ----------------------------------------------------------------------------- players

function toPlayer(r: Row): Player {
  const stats = { ...emptyStats(), ...json<Partial<Record<Domain, number>>>(r.stats, {}) };
  for (const d of DOMAINS) stats[d] = Number(stats[d] ?? 0);
  return {
    id: Number(r.id),
    name: String(r.name),
    discordId: r.discord_id == null ? null : String(r.discord_id),
    hp: Number(r.hp),
    totalXp: Number(r.total_xp),
    gold: Number(r.gold),
    stats,
    inventory: json<string[]>(r.inventory, []),
    equipped: { hat: null, weapon: null, pet: null, ...json(r.equipped, {}) },
    dayStreak: Number(r.day_streak),
    bestDayStreak: Number(r.best_day_streak),
    peakLevel: Number(r.peak_level ?? 1),
    lastDayKey: String(r.last_day_key),
    settings: json(r.settings, {} as Player['settings']),
    createdAt: String(r.created_at),
  };
}

export function listPlayers(db: Db): Player[] {
  return (db.prepare('SELECT * FROM players ORDER BY id').all() as Row[]).map(toPlayer);
}

export function getPlayer(db: Db, id: number): Player | null {
  const r = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as Row | undefined;
  return r ? toPlayer(r) : null;
}

export function getPlayerByDiscord(db: Db, discordId: string): Player | null {
  const r = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId) as Row | undefined;
  return r ? toPlayer(r) : null;
}

export function insertPlayer(db: Db, p: Player): number {
  const res = db
    .prepare(
      `INSERT INTO players (name, discord_id, hp, total_xp, gold, stats, inventory, equipped, day_streak, best_day_streak, peak_level, last_day_key, settings, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      p.name,
      p.discordId,
      p.hp,
      p.totalXp,
      p.gold,
      JSON.stringify(p.stats),
      JSON.stringify(p.inventory),
      JSON.stringify(p.equipped),
      p.dayStreak,
      p.bestDayStreak,
      p.peakLevel,
      p.lastDayKey,
      JSON.stringify(p.settings),
      p.createdAt,
    );
  return Number(res.lastInsertRowid);
}

export function updatePlayer(db: Db, p: Player): void {
  db.prepare(
    `UPDATE players SET name = ?, discord_id = ?, hp = ?, total_xp = ?, gold = ?, stats = ?, inventory = ?, equipped = ?,
       day_streak = ?, best_day_streak = ?, peak_level = ?, last_day_key = ?, settings = ? WHERE id = ?`,
  ).run(
    p.name,
    p.discordId,
    p.hp,
    p.totalXp,
    p.gold,
    JSON.stringify(p.stats),
    JSON.stringify(p.inventory),
    JSON.stringify(p.equipped),
    p.dayStreak,
    p.bestDayStreak,
    p.peakLevel,
    p.lastDayKey,
    JSON.stringify(p.settings),
    p.id,
  );
}

// ----------------------------------------------------------------------------- tasks

function toTask(r: Row): Task {
  return {
    id: Number(r.id),
    playerId: Number(r.player_id),
    type: r.type as Task['type'],
    title: String(r.title),
    notes: String(r.notes ?? ''),
    domain: r.domain as Domain,
    difficulty: r.difficulty as Task['difficulty'],
    timeLabel: String(r.time_label ?? ''),
    days: json<number[]>(r.days, [0, 1, 2, 3, 4, 5, 6]),
    allowUp: Boolean(r.allow_up),
    allowDown: Boolean(r.allow_down),
    forgiving: Boolean(r.forgiving),
    sortOrder: Number(r.sort_order),
    completed: Boolean(r.completed),
    completedAt: r.completed_at == null ? null : String(r.completed_at),
    streak: Number(r.streak),
    bestStreak: Number(r.best_streak),
    counterUp: Number(r.counter_up),
    counterDown: Number(r.counter_down),
    lastGrant: json(r.last_grant, null),
    createdAt: String(r.created_at),
  };
}

export function listTasks(db: Db, playerId: number): Task[] {
  return (
    db.prepare("SELECT * FROM tasks WHERE player_id = ? ORDER BY CASE type WHEN 'daily' THEN 0 WHEN 'habit' THEN 1 ELSE 2 END, sort_order, id").all(playerId) as Row[]
  ).map(toTask);
}

export function getTask(db: Db, playerId: number, id: number): Task | null {
  const r = db.prepare('SELECT * FROM tasks WHERE player_id = ? AND id = ?').get(playerId, id) as Row | undefined;
  return r ? toTask(r) : null;
}

export function nextSortOrder(db: Db, playerId: number, type: string): number {
  const r = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM tasks WHERE player_id = ? AND type = ?').get(playerId, type) as Row;
  return Number(r.n);
}

export function insertTask(db: Db, playerId: number, draft: TaskDraft, sortOrder: number, now: Date): number {
  const res = db
    .prepare(
      `INSERT INTO tasks (player_id, type, title, notes, domain, difficulty, time_label, days, allow_up, allow_down, forgiving, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      playerId,
      draft.type,
      draft.title,
      draft.notes,
      draft.domain,
      draft.difficulty,
      draft.timeLabel,
      JSON.stringify(draft.days),
      draft.allowUp ? 1 : 0,
      draft.allowDown ? 1 : 0,
      draft.forgiving ? 1 : 0,
      sortOrder,
      now.toISOString(),
    );
  return Number(res.lastInsertRowid);
}

export function updateTask(db: Db, t: Task): void {
  db.prepare(
    `UPDATE tasks SET title = ?, notes = ?, domain = ?, difficulty = ?, time_label = ?, days = ?, allow_up = ?, allow_down = ?, forgiving = ?,
       sort_order = ?, completed = ?, completed_at = ?, streak = ?, best_streak = ?, counter_up = ?, counter_down = ?, last_grant = ?
     WHERE id = ? AND player_id = ?`,
  ).run(
    t.title,
    t.notes,
    t.domain,
    t.difficulty,
    t.timeLabel,
    JSON.stringify(t.days),
    t.allowUp ? 1 : 0,
    t.allowDown ? 1 : 0,
    t.forgiving ? 1 : 0,
    t.sortOrder,
    t.completed ? 1 : 0,
    t.completedAt,
    t.streak,
    t.bestStreak,
    t.counterUp,
    t.counterDown,
    t.lastGrant ? JSON.stringify(t.lastGrant) : null,
    t.id,
    t.playerId,
  );
}

export function deleteTask(db: Db, playerId: number, id: number): boolean {
  return Number(db.prepare('DELETE FROM tasks WHERE player_id = ? AND id = ?').run(playerId, id).changes) > 0;
}

// ----------------------------------------------------------------------------- rewards

function toReward(r: Row): Reward {
  return { id: Number(r.id), playerId: Number(r.player_id), title: String(r.title), notes: String(r.notes ?? ''), cost: Number(r.cost) };
}

export function listRewards(db: Db, playerId: number): Reward[] {
  return (db.prepare('SELECT * FROM rewards WHERE player_id = ? ORDER BY cost, id').all(playerId) as Row[]).map(toReward);
}

export function getReward(db: Db, playerId: number, id: number): Reward | null {
  const r = db.prepare('SELECT * FROM rewards WHERE player_id = ? AND id = ?').get(playerId, id) as Row | undefined;
  return r ? toReward(r) : null;
}

export function insertReward(db: Db, playerId: number, d: { title: string; notes: string; cost: number }, now: Date): number {
  const res = db
    .prepare('INSERT INTO rewards (player_id, title, notes, cost, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(playerId, d.title, d.notes, d.cost, now.toISOString());
  return Number(res.lastInsertRowid);
}

export function updateReward(db: Db, r: Reward): void {
  db.prepare('UPDATE rewards SET title = ?, notes = ?, cost = ? WHERE id = ? AND player_id = ?').run(r.title, r.notes, r.cost, r.id, r.playerId);
}

export function deleteReward(db: Db, playerId: number, id: number): boolean {
  return Number(db.prepare('DELETE FROM rewards WHERE player_id = ? AND id = ?').run(playerId, id).changes) > 0;
}

// ----------------------------------------------------------------------------- events

export function insertEvents(db: Db, playerId: number, events: GameEvent[]): void {
  const stmt = db.prepare('INSERT INTO events (player_id, ts, type, task_id, domain, xp, gold, hp, stat, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const e of events) stmt.run(playerId, e.ts, e.type, e.taskId, e.domain, e.xp, e.gold, e.hp, e.stat, e.text);
}

export interface StoredEvent extends GameEvent {
  id: number;
}

function toEvent(r: Row): StoredEvent {
  return {
    id: Number(r.id),
    type: r.type as GameEvent['type'],
    ts: String(r.ts),
    taskId: r.task_id == null ? null : Number(r.task_id),
    domain: (r.domain ?? null) as Domain | null,
    xp: Number(r.xp),
    gold: Number(r.gold),
    hp: Number(r.hp),
    stat: Number(r.stat),
    text: String(r.text),
  };
}

export function recentEvents(db: Db, playerId: number, limit: number): StoredEvent[] {
  return (db.prepare('SELECT * FROM events WHERE player_id = ? ORDER BY id DESC LIMIT ?').all(playerId, limit) as Row[]).map(toEvent);
}

export function latestEventOfType(db: Db, playerId: number, type: string): StoredEvent | null {
  const r = db.prepare('SELECT * FROM events WHERE player_id = ? AND type = ? ORDER BY id DESC LIMIT 1').get(playerId, type) as Row | undefined;
  return r ? toEvent(r) : null;
}

/** Domain stat points gained since `sinceIso` (undo events subtract). */
export function statsSince(db: Db, playerId: number, sinceIso: string): Record<Domain, number> {
  const out = emptyStats();
  const rows = db
    .prepare('SELECT domain, SUM(stat) AS total FROM events WHERE player_id = ? AND ts >= ? AND domain IS NOT NULL GROUP BY domain')
    .all(playerId, sinceIso) as Row[];
  for (const r of rows) if ((DOMAINS as readonly string[]).includes(String(r.domain))) out[r.domain as Domain] = Math.max(0, Number(r.total));
  return out;
}
