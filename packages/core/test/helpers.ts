import { newPlayer, newTask, ALL_DAYS, type TaskDraft } from '../src/game';
import type { Player, Task } from '../src/types';
import type { Domain } from '../src/domains';
import type { Difficulty, TaskType } from '../src/types';

/** 2026-10-20 12:00 in Paris (UTC+2 until the DST change on 25 Oct). */
export const NOON_TUE = new Date('2026-10-20T10:00:00Z');

export function at(iso: string): Date {
  return new Date(iso);
}

export function makePlayer(overrides: Partial<Player> = {}, now = NOON_TUE): Player {
  return { ...newPlayer({ id: 1, name: 'Tester', now }), ...overrides };
}

let nextId = 1;
export function makeTask(type: TaskType, opts: Partial<TaskDraft & Task> = {}, now = NOON_TUE): Task {
  const draft: TaskDraft = {
    type,
    title: opts.title ?? `${type} ${nextId}`,
    notes: '',
    domain: (opts.domain ?? 'health') as Domain,
    difficulty: (opts.difficulty ?? 'easy') as Difficulty,
    timeLabel: '',
    days: opts.days ?? [...ALL_DAYS],
    allowUp: opts.allowUp ?? true,
    allowDown: opts.allowDown ?? type === 'habit',
  };
  const task = newTask(draft, { id: nextId++, playerId: 1, now });
  return { ...task, ...opts, type };
}
