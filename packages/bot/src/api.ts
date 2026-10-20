/** HTTP client for the game API. The bot never touches the database directly. */
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

export type Mutation = { notices: Notice[]; state: GameState };
export type GoalMutation = Mutation & { goals: GoalState };

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createApi(baseUrl: string, fetchImpl: FetchLike = fetch) {
  const root = baseUrl.replace(/\/+$/, '');

  async function raw(method: string, path: string, body?: unknown): Promise<Response> {
    try {
      return await fetchImpl(`${root}/api${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('offline', `Can't reach the game API at ${root}. Is \`npm run dev\` (or \`npm start\`) running?`);
    }
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await raw(method, path, body);
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { code: string; message: string } } | null;
    if (!res.ok || !json?.ok) throw new ApiError(json?.error?.code ?? 'http', json?.error?.message ?? `API error ${res.status}`);
    return json as T;
  }

  return {
    resolve: (discordId: string, name: string, claimLocal: boolean) =>
      call<{ player: { id: number; name: string }; created: boolean; linked: boolean }>('POST', '/players/resolve', { discordId, name, claimLocal }),
    state: (pid: number) => call<Mutation>('GET', `/players/${pid}/state`),
    complete: (pid: number, id: number) => call<Mutation>('POST', `/players/${pid}/tasks/${id}/complete`),
    uncomplete: (pid: number, id: number) => call<Mutation>('POST', `/players/${pid}/tasks/${id}/uncomplete`),
    score: (pid: number, id: number, direction: 'up' | 'down') => call<Mutation>('POST', `/players/${pid}/tasks/${id}/score`, { direction }),
    createTask: (pid: number, body: Record<string, unknown>) => call<Mutation>('POST', `/players/${pid}/tasks`, body),
    buy: (pid: number, kind: 'reward' | 'item', id: number | string) => call<Mutation>('POST', `/players/${pid}/buy`, { kind, id }),
    reset: (pid: number, force: boolean) => call<Mutation>('POST', `/players/${pid}/reset`, { force }),
    goals: (pid: number) => call<GoalMutation>('GET', `/players/${pid}/goals`),
    log: (pid: number, body: Record<string, unknown>) => call<GoalMutation>('POST', `/players/${pid}/logs`, body),
    journal: (pid: number, kind: JournalKind, period: string, data: unknown) => call<GoalMutation>('PUT', `/players/${pid}/journal/${kind}/${period}`, { data }),
    avatarPng: async (pid: number, scale = 8): Promise<Buffer | null> => {
      const res = await raw('GET', `/players/${pid}/avatar.png?scale=${scale}`);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    },
  };
}

export type Api = ReturnType<typeof createApi>;
