import type { Domain, GameEvent, GoalState, JournalKind, Notice, PlayerView, ResetReport, Reward, Task } from '@poq/core';

export interface TaskView extends Task {
  dueToday: boolean;
  goalLink: { goalId: number; title: string; alert: 'due' | 'overdue' | null } | null;
}

export interface GameState {
  player: PlayerView;
  tasks: TaskView[];
  rewards: Reward[];
  stats7d: Record<Domain, number>;
  events: (GameEvent & { id: number })[];
  lastReset: (ResetReport & { ts: string }) | null;
}

export interface PlayerSummary {
  id: number;
  name: string;
  level: number;
  discordLinked: boolean;
  local: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('offline', 'Cannot reach the API. Is `npm run dev` running?');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new ApiError(json?.error?.code ?? 'http', json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}

export type Mutation = { notices: Notice[]; state: GameState };
export type GoalMutation = Mutation & { goals: GoalState };

export const api = {
  players: () => request<{ players: PlayerSummary[] }>('GET', '/players').then((r) => r.players),
  createPlayer: (name: string) => request<{ player: { id: number } }>('POST', '/players', { name }).then((r) => r.player),
  state: (pid: string) => request<Mutation>('GET', `/players/${pid}/state`),
  complete: (pid: string, id: number) => request<Mutation>('POST', `/players/${pid}/tasks/${id}/complete`),
  uncomplete: (pid: string, id: number) => request<Mutation>('POST', `/players/${pid}/tasks/${id}/uncomplete`),
  score: (pid: string, id: number, direction: 'up' | 'down') => request<Mutation>('POST', `/players/${pid}/tasks/${id}/score`, { direction }),
  createTask: (pid: string, body: Record<string, unknown>) => request<Mutation>('POST', `/players/${pid}/tasks`, body),
  updateTask: (pid: string, id: number, body: Record<string, unknown>) => request<Mutation>('PATCH', `/players/${pid}/tasks/${id}`, body),
  deleteTask: (pid: string, id: number) => request<Mutation>('DELETE', `/players/${pid}/tasks/${id}`),
  createReward: (pid: string, body: Record<string, unknown>) => request<Mutation>('POST', `/players/${pid}/rewards`, body),
  deleteReward: (pid: string, id: number) => request<Mutation>('DELETE', `/players/${pid}/rewards/${id}`),
  buy: (pid: string, kind: 'reward' | 'item', id: number | string) => request<Mutation>('POST', `/players/${pid}/buy`, { kind, id }),
  equip: (pid: string, itemId: string) => request<Mutation>('POST', `/players/${pid}/equip`, { itemId }),
  updatePlayer: (pid: string, body: Record<string, unknown>) => request<Mutation>('PATCH', `/players/${pid}`, body),
  reset: (pid: string, force: boolean) => request<Mutation>('POST', `/players/${pid}/reset`, { force }),

  // Goals module
  goals: (pid: string) => request<GoalMutation>('GET', `/players/${pid}/goals`),
  createGoal: (pid: string, body: Record<string, unknown>) => request<GoalMutation>('POST', `/players/${pid}/goals`, body),
  updateGoal: (pid: string, id: number, body: Record<string, unknown>) => request<GoalMutation>('PATCH', `/players/${pid}/goals/${id}`, body),
  deleteGoal: (pid: string, id: number) => request<GoalMutation>('DELETE', `/players/${pid}/goals/${id}`),
  planNextWeek: (pid: string) => request<GoalMutation>('POST', `/players/${pid}/goals/plan-next-week`),
  createGoalTask: (pid: string, body: Record<string, unknown>) => request<GoalMutation>('POST', `/players/${pid}/goal-tasks`, body),
  updateGoalTask: (pid: string, id: number, body: Record<string, unknown>) => request<GoalMutation>('PATCH', `/players/${pid}/goal-tasks/${id}`, body),
  deleteGoalTask: (pid: string, id: number) => request<GoalMutation>('DELETE', `/players/${pid}/goal-tasks/${id}`),
  completeGoalTask: (pid: string, id: number) => request<GoalMutation>('POST', `/players/${pid}/goal-tasks/${id}/complete`),
  uncompleteGoalTask: (pid: string, id: number) => request<GoalMutation>('POST', `/players/${pid}/goal-tasks/${id}/uncomplete`),
  pushGoalTask: (pid: string, id: number) => request<GoalMutation>('POST', `/players/${pid}/goal-tasks/${id}/push`),
  log: (pid: string, body: Record<string, unknown>) => request<GoalMutation>('POST', `/players/${pid}/logs`, body),
  deleteLog: (pid: string, id: number) => request<GoalMutation>('DELETE', `/players/${pid}/logs/${id}`),
  journal: (pid: string, kind: JournalKind, period: string, data: unknown) => request<GoalMutation>('PUT', `/players/${pid}/journal/${kind}/${period}`, { data }),
  deleteJournal: (pid: string, kind: JournalKind, period: string) => request<GoalMutation>('DELETE', `/players/${pid}/journal/${kind}/${period}`),
};
