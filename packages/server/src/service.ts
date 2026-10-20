/**
 * Game operations over the database. Every mutation:
 *   1. opens a transaction, loads the player and their tasks,
 *   2. runs the day reset if the game day has rolled over (lazy "cron"),
 *   3. applies one pure rule from @poq/core, saves, logs events,
 *   4. returns { notices, state } so clients can re-render in one round trip.
 */
import {
  GameError,
  PERSONAL_TEMPLATE,
  STARTER_TEMPLATE,
  applyTaskPatch,
  buyItem,
  buyReward,
  completeTask,
  isDue,
  newPlayer,
  playerView,
  runDayReset,
  scoreHabit,
  toggleEquip,
  uncompleteTask,
  validateRewardDraft,
  validateSettings,
  validateTaskDraft,
  weekdayOf,
  type GameEvent,
  type Notice,
  type Player,
  type PlayerView,
  type ResetReport,
  type Reward,
  type SeedTemplate,
  type Settings,
  type Task,
} from '@poq/core';
import { transaction, type Db } from './db';
import * as repo from './repo';

export interface TaskView extends Task {
  dueToday: boolean;
  /** Set when the quest is linked to a goal (tracker quest or pushed goal task). */
  goalLink: { goalId: number; title: string; alert: 'due' | 'overdue' | null } | null;
}

/** Lets the goals module react to quest changes inside the same transaction. */
export type QuestHook = (pid: number, quest: Task, event: 'completed' | 'uncompleted' | 'scored_up', player: Player, now: Date) => { player: Player; notices: Notice[]; events: GameEvent[] };
export type TaskDecorator = (pid: number, tasks: Task[], now: Date) => Map<number, TaskView['goalLink']>;

export interface GameState {
  player: PlayerView;
  tasks: TaskView[];
  rewards: Reward[];
  /** Stat points earned per domain over the last 7 days. */
  stats7d: Record<string, number>;
  events: repo.StoredEvent[];
  lastReset: (ResetReport & { ts: string }) | null;
}

export interface Result {
  notices: Notice[];
  state: GameState;
}

export interface ServiceOptions {
  now?: () => Date;
  defaults: { timezone: string; resetTime: string; playerName: string };
}

export interface Change {
  player: Player;
  tasks?: Task[];
  notices: Notice[];
  events: GameEvent[];
}

export class GameService {
  readonly now: () => Date;
  questHook: QuestHook | null = null;
  decorate: TaskDecorator | null = null;

  constructor(
    readonly db: Db,
    private readonly opts: ServiceOptions,
  ) {
    this.now = opts.now ?? (() => new Date());
  }

  // ------------------------------------------------------------------ players

  /** Creates the local single-player character with the personal seed on first run. */
  ensureLocalPlayer(): Player {
    const id = repo.getMeta(this.db, 'local_player_id');
    const existing = id ? repo.getPlayer(this.db, Number(id)) : null;
    if (existing) return existing;
    return transaction(this.db, () => {
      const p = this.createPlayerRow(this.opts.defaults.playerName, null, PERSONAL_TEMPLATE);
      repo.setMeta(this.db, 'local_player_id', String(p.id));
      return p;
    });
  }

  localPlayerId(): number {
    return this.ensureLocalPlayer().id;
  }

  listPlayers(): { id: number; name: string; level: number; discordLinked: boolean; local: boolean }[] {
    const localId = Number(repo.getMeta(this.db, 'local_player_id'));
    const now = this.now();
    return repo.listPlayers(this.db).map((p) => ({
      id: p.id,
      name: p.name,
      level: playerView(p, now).level,
      discordLinked: p.discordId !== null,
      local: p.id === localId,
    }));
  }

  createPlayer(name: string): Player {
    const clean = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    if (!clean) throw new GameError('invalid', 'name is required');
    return transaction(this.db, () => this.createPlayerRow(clean, null, STARTER_TEMPLATE));
  }

  /**
   * Maps a Discord user to a player. With `claimLocal`, the user takes over the local
   * single-player character (only if it isn't linked to someone else yet).
   */
  resolveDiscord(discordId: string, name: string, claimLocal: boolean): { player: Player; created: boolean; linked: boolean } {
    if (!/^\d{5,25}$/.test(discordId)) throw new GameError('invalid', 'discordId must be a Discord user id (digits)');
    const found = repo.getPlayerByDiscord(this.db, discordId);
    if (found) return { player: found, created: false, linked: false };
    return transaction(this.db, () => {
      if (claimLocal) {
        const local = repo.getPlayer(this.db, this.localPlayerId());
        if (local && local.discordId === null) {
          const linked = { ...local, discordId };
          repo.updatePlayer(this.db, linked);
          return { player: linked, created: false, linked: true };
        }
      }
      const player = this.createPlayerRow(name?.trim().slice(0, 40) || 'Adventurer', discordId, STARTER_TEMPLATE);
      return { player, created: true, linked: false };
    });
  }

  private createPlayerRow(name: string, discordId: string | null, template: SeedTemplate): Player {
    const now = this.now();
    const p = newPlayer({
      name,
      discordId,
      now,
      settings: { timezone: this.opts.defaults.timezone, resetTime: this.opts.defaults.resetTime },
    });
    const id = repo.insertPlayer(this.db, p);
    template.tasks.forEach((draft, i) => repo.insertTask(this.db, id, draft, i, now));
    for (const r of template.rewards) repo.insertReward(this.db, id, r, now);
    return { ...p, id };
  }

  // ------------------------------------------------------------------ reads

  state(playerId: number): Result {
    return this.mutate(playerId, (player) => ({ player, notices: [], events: [] }));
  }

  private buildState(playerId: number): GameState {
    const now = this.now();
    const player = this.mustPlayer(playerId);
    const view = playerView(player, now);
    const weekday = weekdayOf(view.dayKey);
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const reset = repo.latestEventOfType(this.db, playerId, 'reset');
    let lastReset: GameState['lastReset'] = null;
    if (reset) {
      try {
        lastReset = { ...(JSON.parse(reset.text) as ResetReport), ts: reset.ts };
      } catch {
        lastReset = null;
      }
    }
    return {
      player: view,
      tasks: this.taskViews(playerId, now, weekday),
      rewards: repo.listRewards(this.db, playerId),
      stats7d: repo.statsSince(this.db, playerId, since),
      events: repo.recentEvents(this.db, playerId, 30),
      lastReset,
    };
  }

  private taskViews(playerId: number, now: Date, weekday: number): TaskView[] {
    const tasks = repo.listTasks(this.db, playerId);
    const links = this.decorate?.(playerId, tasks, now) ?? new Map();
    return tasks.map((t) => ({ ...t, dueToday: t.type !== 'daily' || isDue(t, weekday), goalLink: links.get(t.id) ?? null }));
  }

  mustPlayer(id: number): Player {
    const p = repo.getPlayer(this.db, id);
    if (!p) throw new GameError('not_found', `No player ${id}`);
    return p;
  }

  mustTask(playerId: number, taskId: number): Task {
    const t = repo.getTask(this.db, playerId, taskId);
    if (!t) throw new GameError('not_found', `No task #${taskId}`);
    return t;
  }

  /** The heart of the service: transaction + lazy day reset + one rule + persistence. */
  run(playerId: number, fn: (player: Player, now: Date) => Change): Result {
    return this.mutate(playerId, fn);
  }

  private mutate(playerId: number, fn: (player: Player, now: Date) => Change): Result {
    return transaction(this.db, () => {
      const now = this.now();
      let player = this.mustPlayer(playerId);
      const notices: Notice[] = [];

      const reset = runDayReset(player, repo.listTasks(this.db, playerId), now);
      if (reset.ran) {
        player = reset.player;
        repo.updatePlayer(this.db, player);
        for (const t of reset.tasks) repo.updateTask(this.db, t);
        repo.insertEvents(this.db, playerId, reset.events);
        notices.push(...reset.notices);
      }

      const change = fn(player, now);
      repo.updatePlayer(this.db, change.player);
      for (const t of change.tasks ?? []) repo.updateTask(this.db, t);
      repo.insertEvents(this.db, playerId, change.events);
      notices.push(...change.notices);
      return { notices, state: this.buildState(playerId) };
    });
  }

  // ------------------------------------------------------------------ tasks

  createTask(playerId: number, body: Record<string, unknown>): Result {
    const draft = validateTaskDraft(body);
    return this.mutate(playerId, (player, now) => {
      repo.insertTask(this.db, playerId, draft, repo.nextSortOrder(this.db, playerId, draft.type), now);
      return { player, notices: [{ kind: 'info', text: `New ${draft.type === 'todo' ? 'to-do' : draft.type}: ${draft.title}` }], events: [] };
    });
  }

  updateTask(playerId: number, taskId: number, patch: Record<string, unknown>): Result {
    return this.mutate(playerId, (player) => {
      const task = applyTaskPatch(this.mustTask(playerId, taskId), patch);
      return { player, tasks: [task], notices: [], events: [] };
    });
  }

  deleteTask(playerId: number, taskId: number): Result {
    return this.mutate(playerId, (player) => {
      const task = this.mustTask(playerId, taskId);
      repo.deleteTask(this.db, playerId, taskId);
      return { player, notices: [{ kind: 'info', text: `Deleted: ${task.title}` }], events: [] };
    });
  }

  complete(playerId: number, taskId: number): Result {
    return this.mutate(playerId, (player, now) => {
      const out = completeTask(player, this.mustTask(playerId, taskId), now);
      return this.withHook(playerId, { ...out, tasks: [out.task!] }, out.task!, 'completed', now);
    });
  }

  uncomplete(playerId: number, taskId: number): Result {
    return this.mutate(playerId, (player, now) => {
      const out = uncompleteTask(player, this.mustTask(playerId, taskId), now);
      return this.withHook(playerId, { ...out, tasks: [out.task!] }, out.task!, 'uncompleted', now);
    });
  }

  private withHook(playerId: number, change: Change, quest: Task, event: 'completed' | 'uncompleted' | 'scored_up', now: Date): Change {
    if (!this.questHook) return change;
    // Persist the quest first so the hook sees its new state.
    repo.updateTask(this.db, quest);
    const extra = this.questHook(playerId, quest, event, change.player, now);
    return { ...change, player: extra.player, notices: [...change.notices, ...extra.notices], events: [...change.events, ...extra.events] };
  }

  score(playerId: number, taskId: number, direction: unknown): Result {
    if (direction !== 'up' && direction !== 'down') throw new GameError('invalid', 'direction must be "up" or "down"');
    return this.mutate(playerId, (player, now) => {
      const out = scoreHabit(player, this.mustTask(playerId, taskId), direction, now);
      const change = { ...out, tasks: [out.task!] };
      return direction === 'up' ? this.withHook(playerId, change, out.task!, 'scored_up', now) : change;
    });
  }

  // ------------------------------------------------------------------ shop

  createReward(playerId: number, body: Record<string, unknown>): Result {
    const draft = validateRewardDraft(body);
    return this.mutate(playerId, (player, now) => {
      repo.insertReward(this.db, playerId, draft, now);
      return { player, notices: [{ kind: 'info', text: `New reward: ${draft.title} (${draft.cost} gold)` }], events: [] };
    });
  }

  updateReward(playerId: number, rewardId: number, body: Record<string, unknown>): Result {
    return this.mutate(playerId, (player) => {
      const current = repo.getReward(this.db, playerId, rewardId);
      if (!current) throw new GameError('not_found', `No reward #${rewardId}`);
      const draft = validateRewardDraft({ ...current, ...body });
      repo.updateReward(this.db, { ...current, ...draft });
      return { player, notices: [], events: [] };
    });
  }

  deleteReward(playerId: number, rewardId: number): Result {
    return this.mutate(playerId, (player) => {
      if (!repo.deleteReward(this.db, playerId, rewardId)) throw new GameError('not_found', `No reward #${rewardId}`);
      return { player, notices: [], events: [] };
    });
  }

  buy(playerId: number, kind: unknown, id: unknown): Result {
    return this.mutate(playerId, (player, now) => {
      if (kind === 'reward') {
        const reward = repo.getReward(this.db, playerId, Number(id));
        if (!reward) throw new GameError('not_found', `No reward #${String(id)}`);
        return buyReward(player, reward, now);
      }
      if (kind === 'item') return buyItem(player, String(id), now);
      throw new GameError('invalid', 'kind must be "reward" or "item"');
    });
  }

  equip(playerId: number, itemId: unknown): Result {
    return this.mutate(playerId, (player) => ({ player: toggleEquip(player, String(itemId)), notices: [], events: [] }));
  }

  // ------------------------------------------------------------------ settings & reset

  updatePlayer(playerId: number, body: Record<string, unknown>): Result {
    return this.mutate(playerId, (player) => {
      let next = player;
      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
        if (!name) throw new GameError('invalid', 'name is required');
        next = { ...next, name };
      }
      if (body.settings && typeof body.settings === 'object') {
        const settings: Settings = validateSettings(body.settings as Record<string, unknown>, player.settings);
        next = { ...next, settings };
      }
      return { player: next, notices: [{ kind: 'info', text: 'Settings saved.' }], events: [] };
    });
  }

  /** Manual reset. Without `force` it only runs if the day has rolled over (the lazy check already did it). */
  reset(playerId: number, force: boolean): Result {
    const result = this.mutate(playerId, (player, now) => {
      if (!force) return { player, notices: [], events: [] };
      const out = runDayReset(player, repo.listTasks(this.db, playerId), now, { force: true });
      return { player: out.player, tasks: out.tasks, notices: out.notices, events: out.events };
    });
    const ranLazily = result.notices.some((n) => n.kind === 'reset');
    if (!force && !ranLazily) {
      const { nextResetAt, settings } = result.state.player;
      const when = new Intl.DateTimeFormat('en-GB', {
        timeZone: settings.timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(nextResetAt));
      result.notices.push({ kind: 'info', text: `Not time yet: the day rolls over ${when} (${settings.timezone}). Use force to reset now.` });
    }
    return result;
  }

  /** Called by the background timer: rolls the day over for every player whose day has ended. */
  tickAll(): number {
    let count = 0;
    for (const p of repo.listPlayers(this.db)) {
      const now = this.now();
      const reset = runDayReset(p, repo.listTasks(this.db, p.id), now);
      if (!reset.ran) continue;
      transaction(this.db, () => {
        // Re-run inside the transaction against fresh rows to avoid racing a request.
        const fresh = this.mustPlayer(p.id);
        const again = runDayReset(fresh, repo.listTasks(this.db, p.id), now);
        if (!again.ran) return;
        repo.updatePlayer(this.db, again.player);
        for (const t of again.tasks) repo.updateTask(this.db, t);
        repo.insertEvents(this.db, p.id, again.events);
        count++;
      });
    }
    return count;
  }
}
