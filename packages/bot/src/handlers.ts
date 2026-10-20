/**
 * Command logic, independent of discord.js: takes a parsed command, returns a reply payload
 * (plain Discord JSON). index.ts adapts real interactions to this; tests call it directly.
 */
import { CATALOG, DOMAINS, DOMAIN_INFO, bar, isDomain, statLines, type Notice } from '@poq/core';
import { ApiError, type Api, type GameState, type TaskView } from './api';
import { goalList, goalProgress, logEntry, review, suggestGoal, today } from './goal-handlers';

export interface ParsedCommand {
  name: string;
  sub?: string;
  options: Record<string, string | number | boolean | undefined>;
}

export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  footer?: { text: string };
}

export interface Reply {
  content?: string;
  embeds?: Embed[];
  files?: { name: string; data: Buffer }[];
  /** Only the user sees it (Discord "ephemeral"). */
  private: boolean;
}

export interface Ctx {
  api: Api;
  user: { id: string; name: string };
  /** Discord user id allowed to take over the local web player (DISCORD_OWNER_ID). */
  ownerId?: string;
}

export interface Choice {
  name: string;
  value: string | number;
}

const GOLD = 0xffcf3d;
const RED = 0xe8414f;

const ICON: Record<Notice['kind'], string> = {
  gain: '✨',
  loss: '↩️',
  levelUp: '🎉',
  levelDown: '⬇️',
  damage: '💔',
  heal: '🧪',
  faint: '💀',
  unlock: '🔓',
  streak: '🔥',
  reset: '🌅',
  buy: '🛍️',
  info: 'ℹ️',
};

const players = new Map<string, number>();

async function playerId(ctx: Ctx): Promise<number> {
  const cached = players.get(ctx.user.id);
  if (cached) return cached;
  const r = await ctx.api.resolve(ctx.user.id, ctx.user.name, Boolean(ctx.ownerId && ctx.ownerId === ctx.user.id));
  players.set(ctx.user.id, r.player.id);
  return r.player.id;
}

/** For tests: forget cached Discord-user -> player mappings. */
export function clearPlayerCache(): void {
  players.clear();
}

function noticeLines(notices: Notice[]): string {
  return notices.map((n) => `${ICON[n.kind] ?? '•'} ${n.text}`).join('\n');
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Joins lines into embed field values (<= 1024 chars), splitting across fields when needed. */
function fieldsFor(name: string, lines: string[], empty: string): { name: string; value: string }[] {
  if (lines.length === 0) return [{ name, value: empty }];
  const out: { name: string; value: string }[] = [];
  let chunk = '';
  for (const line of lines) {
    const l = clip(line, 200);
    if (chunk.length + l.length + 1 > 1024) {
      out.push({ name: out.length ? `${name} (cont.)` : name, value: chunk });
      chunk = '';
    }
    chunk += (chunk ? '\n' : '') + l;
  }
  out.push({ name: out.length ? `${name} (cont.)` : name, value: chunk });
  return out;
}

/** Discord rejects embeds over 6000 characters: drop trailing fields if a big quest log gets close. */
function fitEmbed(e: Embed): Embed {
  const size = (x: Embed) => (x.title?.length ?? 0) + (x.description?.length ?? 0) + (x.footer?.text.length ?? 0) + (x.fields ?? []).reduce((s, f) => s + f.name.length + f.value.length, 0);
  const fields = [...(e.fields ?? [])];
  let trimmed = false;
  while (fields.length > 1 && size({ ...e, fields }) > 5800) {
    fields.pop();
    trimmed = true;
  }
  return trimmed ? { ...e, fields, footer: { text: 'List trimmed to fit Discord. Use /quest list show:<type> or the web app.' } } : { ...e, fields };
}

function taskLine(t: TaskView): string {
  const box = t.completed ? '✅' : '⬜';
  const time = t.timeLabel ? ` · ${t.timeLabel}` : '';
  const streak = t.type === 'daily' && t.streak > 0 ? ` · 🔥${t.streak}` : '';
  const title = t.completed ? `~~${t.title}~~` : t.title;
  return `${box} \`#${t.id}\` ${title}${time} · ${DOMAIN_INFO[t.domain].short}${streak}`;
}

function habitLine(t: TaskView): string {
  const buttons = `${t.allowUp ? '+' : ''}${t.allowDown ? '−' : ''}`;
  const today = t.counterUp || t.counterDown ? ` · today +${t.counterUp}/−${t.counterDown}` : '';
  return `\`#${t.id}\` ${t.title} (${buttons}) · ${DOMAIN_INFO[t.domain].short}${today}`;
}

function header(state: GameState): string {
  const p = state.player;
  return `❤️ ${p.hp}/${p.maxHp} · ⭐ L${p.level} ${p.xpIntoLevel}/${p.xpToNext} XP · 🪙 ${p.gold} · 🔥 ${p.dayStreak}-day streak`;
}

function resetStamp(state: GameState): string {
  return `<t:${Math.floor(new Date(state.player.nextResetAt).getTime() / 1000)}:R>`;
}

/** Short status line appended to action replies. */
function after(state: GameState): string {
  const due = state.tasks.filter((t) => t.type === 'daily' && t.dueToday);
  const done = due.filter((t) => t.completed).length;
  return `${header(state)} · dailies ${done}/${due.length}`;
}

// ---------------------------------------------------------------------------- commands

async function questList(ctx: Ctx, show: string): Promise<Reply> {
  const { state } = await ctx.api.state(await playerId(ctx));
  const dailies = state.tasks.filter((t) => t.type === 'daily' && t.dueToday);
  const done = dailies.filter((t) => t.completed).length;
  const habits = state.tasks.filter((t) => t.type === 'habit');
  const todos = state.tasks.filter((t) => t.type === 'todo' && !t.completed);
  const fields = [
    ...(show === 'all' || show === 'daily' ? fieldsFor(`Dailies ${done}/${dailies.length}`, dailies.map(taskLine), 'Nothing due today.') : []),
    ...(show === 'all' || show === 'habit' ? fieldsFor('Habits', habits.map(habitLine), 'No habits yet.') : []),
    ...(show === 'all' || show === 'todo' ? fieldsFor('To-dos', todos.map(taskLine), 'All clear.') : []),
  ].slice(0, 25);
  return {
    private: true,
    embeds: [
      fitEmbed({
        title: `${state.player.name}'s quest log`,
        description: `${header(state)}\nNew day ${resetStamp(state)}`,
        color: GOLD,
        fields,
        footer: { text: '/quest done <id> · /habit + <id> · /quest add' },
      }),
    ],
  };
}

async function act(ctx: Ctx, fn: (pid: number) => Promise<{ notices: Notice[]; state: GameState }>, prefix = ''): Promise<Reply> {
  const r = await fn(await playerId(ctx));
  const lines = [prefix, noticeLines(r.notices), after(r.state)].filter(Boolean);
  return { private: true, content: lines.join('\n') };
}

async function stats(ctx: Ctx, share: boolean): Promise<Reply> {
  const pid = await playerId(ctx);
  const { state } = await ctx.api.state(pid);
  const p = state.player;
  const png = await ctx.api.avatarPng(pid, 8).catch(() => null);
  const gear = [p.equipped.hat, p.equipped.weapon, p.equipped.pet]
    .map((id) => CATALOG.find((i) => i.id === id)?.name)
    .filter(Boolean)
    .join(', ');
  const weakest = [...DOMAINS].sort((a, b) => state.stats7d[a] - state.stats7d[b]).slice(0, 3);
  return {
    private: !share,
    files: png ? [{ name: 'avatar.png', data: png }] : [],
    embeds: [
      {
        title: `${p.name} · Level ${p.level} ${p.title}`,
        color: p.hp <= p.maxHp * 0.3 ? RED : GOLD,
        thumbnail: png ? { url: 'attachment://avatar.png' } : undefined,
        fields: [
          { name: '❤️ HP', value: `\`${bar(p.hp, p.maxHp, 12)}\` ${p.hp}/${p.maxHp}`, inline: false },
          { name: '⭐ XP', value: `\`${bar(p.xpIntoLevel, p.xpToNext, 12)}\` ${p.xpIntoLevel}/${p.xpToNext}`, inline: false },
          { name: '🪙 Gold', value: String(p.gold), inline: true },
          { name: '🔥 Day streak', value: `${p.dayStreak} (best ${p.bestDayStreak})`, inline: true },
          { name: '🌅 New day', value: resetStamp(state), inline: true },
          { name: 'Wheel of life · last 7 days', value: '```\n' + statLines(state.stats7d, 10).join('\n') + '\n```' },
          { name: 'Needs attention', value: weakest.map((d) => DOMAIN_INFO[d].label).join(', ') },
          ...(gear ? [{ name: 'Gear', value: gear }] : []),
          ...(p.settings.resting ? [{ name: 'Rest mode', value: 'On: no damage, streaks frozen.' }] : []),
        ],
      },
    ],
  };
}

async function shop(ctx: Ctx): Promise<Reply> {
  const { state } = await ctx.api.state(await playerId(ctx));
  const p = state.player;
  const rewards = state.rewards.map((r) => `\`reward:${r.id}\` ${r.title} · 🪙 ${r.cost}${p.gold >= r.cost ? '' : ' (need more gold)'}`);
  const gear = CATALOG.map((i) => {
    if (p.level < i.unlockLevel) return `🔒 ${i.name} · unlocks at level ${i.unlockLevel}`;
    if (i.slot !== 'consumable' && p.inventory.includes(i.id)) return `✅ ${i.name} · owned${Object.values(p.equipped).includes(i.id) ? ', equipped' : ''}`;
    return `\`${i.id}\` ${i.name} · 🪙 ${i.cost}`;
  });
  return {
    private: true,
    embeds: [
      {
        title: `Shop · 🪙 ${p.gold} gold`,
        color: GOLD,
        fields: [...fieldsFor('Your rewards', rewards, 'No custom rewards yet. Add them in the web app.'), ...fieldsFor('Gear', gear, '-')],
        footer: { text: 'Buy with /buy (start typing to search)' },
      },
    ].map(fitEmbed),
  };
}

async function buy(ctx: Ctx, raw: string): Promise<Reply> {
  const value = raw.trim();
  const pid = await playerId(ctx);
  if (/^reward:\d+$/.test(value)) return act(ctx, () => ctx.api.buy(pid, 'reward', Number(value.split(':')[1])));
  if (/^item:/.test(value)) return act(ctx, () => ctx.api.buy(pid, 'item', value.slice(5)));
  if (CATALOG.some((i) => i.id === value)) return act(ctx, () => ctx.api.buy(pid, 'item', value));
  // Free text: match a reward or an item by name.
  const { state } = await ctx.api.state(pid);
  const q = value.toLowerCase();
  const reward = state.rewards.find((r) => r.title.toLowerCase() === q);
  if (reward) return act(ctx, () => ctx.api.buy(pid, 'reward', reward.id));
  const item = CATALOG.find((i) => i.name.toLowerCase() === q);
  if (item) return act(ctx, () => ctx.api.buy(pid, 'item', item.id));
  return { private: true, content: `Nothing called "${clip(value, 60)}" in the shop. Try /shop, or pick from the suggestions.` };
}

async function addQuest(ctx: Ctx, o: ParsedCommand['options']): Promise<Reply> {
  const domain = String(o.domain ?? '');
  if (!isDomain(domain)) return { private: true, content: 'Pick one of the nine life domains.' };
  return act(ctx, (pid) => ctx.api.createTask(pid, { type: o.type, title: o.title, domain, difficulty: o.difficulty ?? 'easy' }));
}

export async function handle(cmd: ParsedCommand, ctx: Ctx): Promise<Reply> {
  try {
    const o = cmd.options;
    switch (cmd.name) {
      case 'quest':
        if (cmd.sub === 'list') return await questList(ctx, String(o.show ?? 'all'));
        if (cmd.sub === 'done') return await act(ctx, (pid) => ctx.api.complete(pid, Number(o.id)));
        if (cmd.sub === 'undo') return await act(ctx, (pid) => ctx.api.uncomplete(pid, Number(o.id)));
        if (cmd.sub === 'add') return await addQuest(ctx, o);
        break;
      case 'habit': {
        const dir = o.direction === 'down' ? 'down' : 'up';
        return await act(ctx, (pid) => ctx.api.score(pid, Number(o.id), dir));
      }
      case 'stats':
        return await stats(ctx, Boolean(o.share));
      case 'shop':
        return await shop(ctx);
      case 'buy':
        return await buy(ctx, String(o.item ?? ''));
      case 'daily-reset':
        return await act(ctx, (pid) => ctx.api.reset(pid, Boolean(o.force)));
      case 'goal':
        if (cmd.sub === 'list') return await goalList(ctx, await playerId(ctx));
        if (cmd.sub === 'progress') return await goalProgress(ctx, await playerId(ctx), Number(o.id));
        break;
      case 'today':
        return await today(ctx, await playerId(ctx));
      case 'review':
        return await review(ctx, await playerId(ctx), o);
      case 'log':
        return await logEntry(ctx, await playerId(ctx), cmd.sub ?? '', o);
    }
    return { private: true, content: `Unknown command /${cmd.name}${cmd.sub ? ` ${cmd.sub}` : ''}.` };
  } catch (e) {
    if (e instanceof ApiError) {
      const hint = e.code === 'wrong_type' && cmd.name === 'quest' ? '\nHabits are scored with /habit + or /habit -.' : '';
      return { private: true, content: `⚠️ ${e.message}${hint}` };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------- autocomplete

function matches(q: string, ...hay: string[]): boolean {
  const s = q.trim().toLowerCase().replace(/^#/, '');
  return !s || hay.some((h) => h.toLowerCase().includes(s));
}

export async function suggest(cmd: ParsedCommand, focused: { name: string; value: string }, ctx: Ctx): Promise<Choice[]> {
  if (cmd.name === 'goal' && focused.name === 'id') return suggestGoal(ctx.api, await playerId(ctx), String(focused.value ?? ''), false);
  if (cmd.name === 'log' && focused.name === 'goal') return suggestGoal(ctx.api, await playerId(ctx), String(focused.value ?? ''), true);
  const { state } = await ctx.api.state(await playerId(ctx));
  const q = String(focused.value ?? '');
  const label = (t: TaskView) => clip(`#${t.id} ${t.title}${t.timeLabel ? ` (${t.timeLabel})` : ''}`, 100);
  let choices: Choice[] = [];

  if (cmd.name === 'quest' && focused.name === 'id') {
    const want = cmd.sub === 'undo';
    choices = state.tasks
      .filter((t) => t.type !== 'habit' && t.completed === want && (t.type === 'todo' || t.dueToday || want))
      .filter((t) => matches(q, String(t.id), t.title))
      .map((t) => ({ name: label(t), value: t.id }));
  } else if (cmd.name === 'habit' && focused.name === 'id') {
    const dir = cmd.options.direction;
    choices = state.tasks
      .filter((t) => t.type === 'habit' && (dir === 'down' ? t.allowDown : dir === 'up' ? t.allowUp : true))
      .filter((t) => matches(q, String(t.id), t.title))
      .map((t) => ({ name: label(t), value: t.id }));
  } else if (cmd.name === 'buy' && focused.name === 'item') {
    const p = state.player;
    const rewards = state.rewards
      .filter((r) => matches(q, r.title))
      .map((r) => ({ name: clip(`${r.title} · ${r.cost} gold${p.gold < r.cost ? ' (too pricey)' : ''}`, 100), value: `reward:${r.id}` }));
    const items = CATALOG.filter((i) => p.level >= i.unlockLevel && (i.slot === 'consumable' || !p.inventory.includes(i.id)))
      .filter((i) => matches(q, i.name, i.id))
      .map((i) => ({ name: clip(`${i.name} · ${i.cost} gold${p.gold < i.cost ? ' (too pricey)' : ''}`, 100), value: `item:${i.id}` }));
    choices = [...rewards, ...items];
  }
  return choices.slice(0, 25);
}
