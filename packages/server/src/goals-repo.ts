/** SQL for the goals module: goals, goal tasks, tracker logs and the journal. */
import type { Domain, Goal, GoalDraft, GoalTask, GoalTaskDraft, JournalEntry, JournalKind, LogDraft, LogEntry } from '@poq/core';
import type { Db, Row } from './db';

const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== 'string') return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ----------------------------------------------------------------------------- goals

function toGoal(r: Row): Goal {
  return {
    id: Number(r.id),
    playerId: Number(r.player_id),
    parentId: numOrNull(r.parent_id),
    level: r.level as Goal['level'],
    title: String(r.title),
    domain: r.domain as Domain,
    result: String(r.result),
    purpose: String(r.purpose),
    easy: String(r.easy),
    identity: String(r.identity),
    woop: { wish: '', outcome: '', obstacle: '', plan: '', ...json(r.woop, {}) },
    ifThen: json(r.if_then, []),
    metric: json(r.metric, null),
    questId: numOrNull(r.quest_id),
    startDay: String(r.start_day),
    endDay: String(r.end_day),
    status: r.status as Goal['status'],
    badges: json(r.badges, []),
    sortOrder: Number(r.sort_order),
    createdAt: String(r.created_at),
  };
}

export function listGoals(db: Db, pid: number): Goal[] {
  return (db.prepare("SELECT * FROM goals WHERE player_id = ? ORDER BY CASE level WHEN 'season' THEN 0 WHEN 'month' THEN 1 ELSE 2 END, sort_order, id").all(pid) as Row[]).map(toGoal);
}

export function getGoal(db: Db, pid: number, id: number): Goal | null {
  const r = db.prepare('SELECT * FROM goals WHERE player_id = ? AND id = ?').get(pid, id) as Row | undefined;
  return r ? toGoal(r) : null;
}

export function insertGoal(db: Db, pid: number, d: GoalDraft, questId: number | null, sortOrder: number, now: Date): number {
  const res = db
    .prepare(
      `INSERT INTO goals (player_id, parent_id, level, title, domain, result, purpose, easy, identity, woop, if_then, metric, quest_id, start_day, end_day, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      pid,
      d.parentId,
      d.level,
      d.title,
      d.domain,
      d.result,
      d.purpose,
      d.easy,
      d.identity,
      JSON.stringify(d.woop),
      JSON.stringify(d.ifThen),
      d.metric ? JSON.stringify(d.metric) : null,
      questId,
      d.startDay,
      d.endDay,
      sortOrder,
      now.toISOString(),
    );
  return Number(res.lastInsertRowid);
}

export function updateGoal(db: Db, g: Goal): void {
  db.prepare(
    `UPDATE goals SET parent_id = ?, level = ?, title = ?, domain = ?, result = ?, purpose = ?, easy = ?, identity = ?, woop = ?, if_then = ?, metric = ?,
       quest_id = ?, start_day = ?, end_day = ?, status = ?, badges = ?, sort_order = ? WHERE id = ? AND player_id = ?`,
  ).run(
    g.parentId,
    g.level,
    g.title,
    g.domain,
    g.result,
    g.purpose,
    g.easy,
    g.identity,
    JSON.stringify(g.woop),
    JSON.stringify(g.ifThen),
    g.metric ? JSON.stringify(g.metric) : null,
    g.questId,
    g.startDay,
    g.endDay,
    g.status,
    JSON.stringify(g.badges),
    g.sortOrder,
    g.id,
    g.playerId,
  );
}

export function deleteGoal(db: Db, pid: number, id: number): boolean {
  return Number(db.prepare('DELETE FROM goals WHERE player_id = ? AND id = ?').run(pid, id).changes) > 0;
}

export function nextGoalOrder(db: Db, pid: number): number {
  const r = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM goals WHERE player_id = ?').get(pid) as Row;
  return Number(r.n);
}

// ----------------------------------------------------------------------------- goal tasks

function toGoalTask(r: Row): GoalTask {
  return {
    id: Number(r.id),
    playerId: Number(r.player_id),
    goalId: Number(r.goal_id),
    title: String(r.title),
    notes: String(r.notes),
    difficulty: r.difficulty as GoalTask['difficulty'],
    due: r.due == null ? null : String(r.due),
    done: Boolean(r.done),
    doneAt: r.done_at == null ? null : String(r.done_at),
    questId: numOrNull(r.quest_id),
    top3Day: r.top3_day == null ? null : String(r.top3_day),
    leverage: Boolean(r.leverage),
    easy: String(r.easy),
    pomodoros: Number(r.pomodoros),
    sortOrder: Number(r.sort_order),
    createdAt: String(r.created_at),
  };
}

export function listGoalTasks(db: Db, pid: number): GoalTask[] {
  return (db.prepare('SELECT * FROM goal_tasks WHERE player_id = ? ORDER BY done, leverage DESC, COALESCE(due, \'9999\'), sort_order, id').all(pid) as Row[]).map(toGoalTask);
}

export function getGoalTask(db: Db, pid: number, id: number): GoalTask | null {
  const r = db.prepare('SELECT * FROM goal_tasks WHERE player_id = ? AND id = ?').get(pid, id) as Row | undefined;
  return r ? toGoalTask(r) : null;
}

export function goalTasksByQuest(db: Db, pid: number, questId: number): GoalTask[] {
  return (db.prepare('SELECT * FROM goal_tasks WHERE player_id = ? AND quest_id = ?').all(pid, questId) as Row[]).map(toGoalTask);
}

export function insertGoalTask(db: Db, pid: number, d: GoalTaskDraft, now: Date): number {
  const order = Number((db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM goal_tasks WHERE player_id = ? AND goal_id = ?').get(pid, d.goalId) as Row).n);
  const res = db
    .prepare('INSERT INTO goal_tasks (player_id, goal_id, title, notes, difficulty, due, leverage, easy, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(pid, d.goalId, d.title, d.notes, d.difficulty, d.due, d.leverage ? 1 : 0, d.easy, order, now.toISOString());
  return Number(res.lastInsertRowid);
}

export function updateGoalTask(db: Db, t: GoalTask): void {
  db.prepare(
    `UPDATE goal_tasks SET goal_id = ?, title = ?, notes = ?, difficulty = ?, due = ?, done = ?, done_at = ?, quest_id = ?, top3_day = ?, leverage = ?, easy = ?,
       pomodoros = ?, sort_order = ? WHERE id = ? AND player_id = ?`,
  ).run(t.goalId, t.title, t.notes, t.difficulty, t.due, t.done ? 1 : 0, t.doneAt, t.questId, t.top3Day, t.leverage ? 1 : 0, t.easy, t.pomodoros, t.sortOrder, t.id, t.playerId);
}

export function deleteGoalTask(db: Db, pid: number, id: number): boolean {
  return Number(db.prepare('DELETE FROM goal_tasks WHERE player_id = ? AND id = ?').run(pid, id).changes) > 0;
}

// ----------------------------------------------------------------------------- logs

function toLog(r: Row): LogEntry {
  return {
    id: Number(r.id),
    playerId: Number(r.player_id),
    kind: r.kind as LogEntry['kind'],
    dayKey: String(r.day_key),
    ts: String(r.ts),
    goalId: numOrNull(r.goal_id),
    taskId: numOrNull(r.task_id),
    value: numOrNull(r.value),
    value2: numOrNull(r.value2),
    tag: String(r.tag),
    note: String(r.note),
  };
}

/** All logs from `sinceDay` on (inclusive). */
export function listLogs(db: Db, pid: number, sinceDay = '0000-00-00'): LogEntry[] {
  return (db.prepare('SELECT * FROM logs WHERE player_id = ? AND day_key >= ? ORDER BY day_key, ts, id').all(pid, sinceDay) as Row[]).map(toLog);
}

export function getLog(db: Db, pid: number, id: number): LogEntry | null {
  const r = db.prepare('SELECT * FROM logs WHERE player_id = ? AND id = ?').get(pid, id) as Row | undefined;
  return r ? toLog(r) : null;
}

export function insertLog(db: Db, pid: number, d: LogDraft, now: Date): number {
  const res = db
    .prepare('INSERT INTO logs (player_id, kind, day_key, ts, goal_id, task_id, value, value2, tag, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(pid, d.kind, d.dayKey, now.toISOString(), d.goalId, d.taskId, d.value, d.value2, d.tag, d.note);
  return Number(res.lastInsertRowid);
}

export function deleteLog(db: Db, pid: number, id: number): boolean {
  return Number(db.prepare('DELETE FROM logs WHERE player_id = ? AND id = ?').run(pid, id).changes) > 0;
}

export function deleteQuestLog(db: Db, pid: number, kind: string, dayKey: string): number {
  return Number(db.prepare("DELETE FROM logs WHERE player_id = ? AND kind = ? AND day_key = ? AND tag = 'quest'").run(pid, kind, dayKey).changes);
}

// ----------------------------------------------------------------------------- journal

export function getJournal<T>(db: Db, pid: number, kind: JournalKind, period: string): JournalEntry<T> | null {
  const r = db.prepare('SELECT * FROM journal WHERE player_id = ? AND kind = ? AND period = ?').get(pid, kind, period) as Row | undefined;
  return r ? { kind, period, data: json(r.data, null) as T, updatedAt: String(r.updated_at) } : null;
}

export function listJournal<T>(db: Db, pid: number, kind: JournalKind, sincePeriod = ''): JournalEntry<T>[] {
  return (db.prepare('SELECT * FROM journal WHERE player_id = ? AND kind = ? AND period >= ? ORDER BY period').all(pid, kind, sincePeriod) as Row[]).map((r) => ({
    kind,
    period: String(r.period),
    data: json(r.data, null) as T,
    updatedAt: String(r.updated_at),
  }));
}

export function putJournal(db: Db, pid: number, kind: JournalKind, period: string, data: unknown, now: Date): void {
  db.prepare(
    'INSERT INTO journal (player_id, kind, period, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(player_id, kind, period) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  ).run(pid, kind, period, JSON.stringify(data), now.toISOString());
}

export function deleteJournal(db: Db, pid: number, kind: JournalKind, period: string): boolean {
  return Number(db.prepare('DELETE FROM journal WHERE player_id = ? AND kind = ? AND period = ?').run(pid, kind, period).changes) > 0;
}

/** Stat points per domain from the RPG event log since an instant (for the wheel over time). */
export function statEventsSince(db: Db, pid: number, sinceIso: string): { ts: string; domain: Domain; stat: number }[] {
  return (db.prepare('SELECT ts, domain, stat FROM events WHERE player_id = ? AND ts >= ? AND domain IS NOT NULL AND stat != 0').all(pid, sinceIso) as Row[]).map((r) => ({
    ts: String(r.ts),
    domain: r.domain as Domain,
    stat: Number(r.stat),
  }));
}

export function eventsSince(db: Db, pid: number, sinceIso: string): { ts: string; type: string; xp: number; taskId: number | null }[] {
  return (db.prepare('SELECT ts, type, xp, task_id FROM events WHERE player_id = ? AND ts >= ?').all(pid, sinceIso) as Row[]).map((r) => ({
    ts: String(r.ts),
    type: String(r.type),
    xp: Number(r.xp),
    taskId: numOrNull(r.task_id),
  }));
}
