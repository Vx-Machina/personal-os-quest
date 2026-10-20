/** Discord replies for the goals module: /goal, /today, /review and /log. */
import { DOMAIN_INFO, FRAMEWORKS, PROTOCOL_DISCLAIMER, bar, minToHhmm, type GoalState, type GoalView, type Notice } from '@poq/core';
import type { Api } from './api';
import type { Choice, Ctx, Embed, ParsedCommand, Reply } from './handlers';

const GOLD = 0xffcf3d;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1)}…`);

function paceLabel(p: number | null | undefined): string {
  if (p === null || p === undefined) return '';
  return p >= 0.9 ? ' · on pace' : p >= 0.6 ? ' · a bit behind' : ' · behind';
}

function goalLine(g: GoalView): string {
  const m = g.measure ? ` · ${g.measure.done}/${g.measure.target} ${g.measure.unit}${paceLabel(g.measure.pace)}` : '';
  return `\`#${g.id}\` **${g.title}** · ${DOMAIN_INFO[g.domain].short}\n\`${bar(g.progress, 1, 12)}\` ${pct(g.progress)}${m}`;
}

function notices(ns: Notice[]): string {
  return ns.map((n) => `• ${n.text}`).join('\n');
}

export async function goalList(ctx: Ctx, pid: number): Promise<Reply> {
  const { goals: g } = await ctx.api.goals(pid);
  const seasons = g.goals.filter((x) => x.level === 'season' && x.status === 'active');
  const lines = seasons.map(goalLine);
  return {
    private: true,
    embeds: [
      {
        title: `Season goals · ${pct(g.seasonProgress)} overall`,
        description: clip(lines.join('\n\n') || 'No season goals yet. Create one in the web app (Life goals → Goals).', 4000),
        color: GOLD,
        footer: { text: '/goal progress <id> for details · /today for today' },
      },
    ],
  };
}

export async function goalProgress(ctx: Ctx, pid: number, id: number): Promise<Reply> {
  const { goals: g } = await ctx.api.goals(pid);
  const goal = g.goals.find((x) => x.id === id);
  if (!goal) return { private: true, content: `No goal #${id}. Try /goal list.` };
  const children = g.goals.filter((c) => c.parentId === goal.id && c.status !== 'dropped');
  const tasks = g.tasks.filter((t) => t.goalId === goal.id);
  const fields: Embed['fields'] = [];
  if (goal.measure) fields.push({ name: 'Tracker', value: `${goal.measure.done}/${goal.measure.target} ${goal.measure.unit}${paceLabel(goal.measure.pace)}` });
  if (goal.result || goal.purpose) fields.push({ name: 'RPM', value: clip(`Result: ${goal.result || '-'}\nPurpose: ${goal.purpose || 'not written yet'}`, 1024) });
  if (goal.ifThen.length) fields.push({ name: 'If-then', value: clip(goal.ifThen.map((x) => `If ${x.if}, then ${x.then}.`).join('\n'), 1024) });
  if (children.length) fields.push({ name: 'Milestones and targets', value: clip(children.map((c) => `${c.level === 'month' ? 'Month' : 'Week'} · ${c.title} · ${pct(c.progress)}`).join('\n'), 1024) });
  if (tasks.length) fields.push({ name: `Action plan ${goal.tasksDone}/${goal.tasksTotal}`, value: clip(tasks.map((t) => `${t.done ? '✅' : '⬜'} ${t.leverage ? '★ ' : ''}${t.title}${t.questId ? ` (quest #${t.questId})` : ''}`).join('\n'), 1024) });
  const tr = goal.measure?.tracker;
  if (tr === 'smoking') {
    const s = g.trackers.smoking;
    fields.push({
      name: 'Example: quit a habit',
      value: `${s.started ? `${s.streak} smoke-free day(s), best ${s.best}` : 'Counter not started'} · badges: ${s.badges.filter((b) => b.earned).map((b) => b.label).join(', ') || 'none yet'}\n${s.money ? `Saved ${s.money.currency}${s.money.saved.toFixed(2)}` : 'Money saved: set baseline and pack price in the web app'}`,
    });
  }
  if (tr === 'gym') fields.push({ name: '48h rule', value: g.trackers.gym.status === 'none' ? 'No session yet' : `${Math.round(g.trackers.gym.hoursSince ?? 0)} h since the last session (${g.trackers.gym.status})` });
  return {
    private: true,
    embeds: [
      {
        title: `${goal.level === 'season' ? 'Season goal' : goal.level === 'month' ? 'Monthly milestone' : 'Weekly target'} #${goal.id}: ${goal.title}`,
        description: `\`${bar(goal.progress, 1, 16)}\` **${pct(goal.progress)}** · ${goal.startDay} → ${goal.endDay}${goal.questTitle ? ` · quest: ${goal.questTitle}` : ''}`,
        color: GOLD,
        fields,
      },
    ],
  };
}

export async function today(ctx: Ctx, pid: number): Promise<Reply> {
  const { goals: g } = await ctx.api.goals(pid);
  const t = g.trackers;
  const lead = g.journal.lead.thisWeek;
  const leadText = lead ? (lead.taskId ? (g.tasks.find((x) => x.id === lead.taskId)?.title ?? lead.text) : lead.text) : null;
  const top3 = g.top3.map((x) => `${x.done ? '✅' : '⬜'} ${x.leverage ? '★ ' : ''}${x.title}`).join('\n') || 'Nothing pinned. Pin up to 3 tasks in the web app.';
  const meals = t.meals.slots.map((s) => `${s.slot} ${s.time === null ? '⬜' : s.healthy ? '✅' : '🟧'}`).join(' · ');
  const trackers = [
    `🚭 ${t.smoking.started ? `${t.smoking.streak} smoke-free day(s)${t.smoking.slipToday ? ' (slip today: reset and keep going)' : ''}` : 'smoke-free counter not started'}`,
    `⏰ ${t.wake.checkedToday ? (t.wake.todayMin !== null ? `up at ${minToHhmm(t.wake.todayMin)}` : 'checked') + (t.wake.onTimeToday ? ' ✅' : ' (late)') : `not logged (target ${t.wake.target})`}`,
    `☀️ ${t.sun.doneToday ? `${t.sun.todayMinutes} min sunlight ✅` : 'no sunlight yet'}`,
    `🏃 ${t.run.doneToday ? `run done${t.run.todayKm ? ` · ${t.run.todayKm} km` : ''} ✅` : 'no run yet'}`,
    `🏋️ gym: ${t.gym.status === 'none' ? 'no session yet' : t.gym.status === 'ok' ? 'covered' : t.gym.status === 'due' ? 'go today' : 'overdue (48h passed)'}`,
    `🍽️ ${meals}`,
    `🍅 ${t.pomodoro.today}/${t.pomodoro.target} pomodoros`,
  ];
  const protocols = g.protocols.filter((p) => p.enabled);
  const fields: Embed['fields'] = [
    { name: 'Top 3', value: clip(top3, 1024) },
    { name: 'Trackers', value: trackers.join('\n') },
    { name: `Protocols ${protocols.filter((p) => p.checked).length}/${protocols.length}`, value: clip(`${protocols.map((p) => `${p.checked ? '✅' : '⬜'} ${p.label}`).join('\n')}\n_${PROTOCOL_DISCLAIMER}_`, 1024) },
  ];
  if (leadText) fields.unshift({ name: 'Lead domino this week', value: clip(leadText, 1024) });
  if (g.journal.checkin) fields.push({ name: 'Check-in', value: `mood ${g.journal.checkin.mood}/5 · energy ${g.journal.checkin.energy}/5` });
  return { private: true, embeds: [{ title: `Today · ${g.today}`, color: GOLD, fields, footer: { text: 'Log from here: /log wake, /log run, /log craving, /log meal…' } }] };
}

export async function review(ctx: Ctx, pid: number, o: ParsedCommand['options']): Promise<Reply> {
  let res = await ctx.api.goals(pid);
  const g0 = res.goals;
  const prefix: string[] = [];
  const wentWell = o['went-well'];
  if (wentWell || o.didnt || o.change) {
    const prev = g0.journal.hansei.thisWeek ?? { wentWell: '', didnt: '', change: '' };
    res = await ctx.api.journal(pid, 'hansei', g0.week, {
      wentWell: wentWell ? String(wentWell) : prev.wentWell,
      didnt: o.didnt ? String(o.didnt) : prev.didnt,
      change: o.change ? String(o.change) : prev.change,
    });
    prefix.push(notices(res.notices));
  }
  const g = res.goals;
  const w = g.thisWeek;
  const h = g.journal.hansei.thisWeek;
  const lines = [
    `XP ${w.xp} · quests ${w.questsDone} · pomodoros ${w.pomodoros}`,
    `Up on time ${w.wakeOnTime}/${w.days}${w.wakeAvg ? ` (avg ${w.wakeAvg})` : ''} · runs ${w.runDays} · gym ${w.gymSessions} · sunlight ${w.sunDays}`,
    `Smoke-free ${w.smokeFreeDays === null ? 'not started' : `${w.smokeFreeDays}/${w.days}`} · cravings ridden out ${w.cravingsResisted}/${w.cravings}`,
    `Healthy-meal days ${w.mealDays} · mood ${w.moodAvg ?? '-'} · energy ${w.energyAvg ?? '-'}`,
  ];
  const weekTargets = g.goals.filter((x) => x.level === 'week' && x.startDay >= g.week && x.startDay <= g.today);
  const fields: Embed['fields'] = [{ name: 'The week in numbers', value: lines.join('\n') }];
  if (weekTargets.length) fields.push({ name: 'Weekly targets', value: clip(weekTargets.map((t) => `\`${bar(t.progress, 1, 8)}\` ${pct(t.progress)} ${t.title}`).join('\n'), 1024) });
  fields.push({
    name: 'Hansei',
    value: h ? clip(`Went well: ${h.wentWell || '-'}\nDidn't: ${h.didnt || '-'}\nChange: ${h.change || '-'}`, 1024) : `Not written yet. Add it here: /review went-well:… didnt:… change:…\n_${FRAMEWORKS.hansei.idea}_`,
  });
  return { private: true, content: prefix.filter(Boolean).join('\n') || undefined, embeds: [{ title: `Weekly review · week of ${g.week}`, color: GOLD, fields }] };
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export async function logEntry(ctx: Ctx, pid: number, sub: string, o: ParsedCommand['options']): Promise<Reply> {
  let body: Record<string, unknown>;
  switch (sub) {
    case 'wake': {
      if (o.time !== undefined && !TIME.test(String(o.time))) return { private: true, content: 'Time must look like 07:45.' };
      const m = o.time ? TIME.exec(String(o.time))! : null;
      body = { kind: 'wake', value: m ? Number(m[1]) * 60 + Number(m[2]) : undefined };
      break;
    }
    case 'sun':
      body = { kind: 'sun', value: o.minutes ?? 10 };
      break;
    case 'run':
      body = { kind: 'run', value: o.minutes ?? null, value2: o.km ?? null };
      break;
    case 'gym':
      body = { kind: 'gym', value: o.minutes ?? null };
      break;
    case 'meal':
      body = { kind: 'meal', tag: o.slot, value2: o.healthy === undefined ? true : Boolean(o.healthy) };
      break;
    case 'craving':
      body = { kind: 'craving', value: o.intensity ?? 3, value2: Boolean(o.resisted), note: o.trigger ?? '' };
      break;
    case 'smoke':
      body = { kind: 'smoke', value: o.count ?? 1 };
      break;
    case 'pomodoro':
      body = { kind: 'pomodoro', value: 25, goalId: o.goal ?? null };
      break;
    case 'mood': {
      const { goals } = await ctx.api.goals(pid);
      const r = await ctx.api.journal(pid, 'checkin', goals.today, { mood: o.mood, energy: o.energy, note: '' });
      return { private: true, content: notices(r.notices) || 'Check-in saved.' };
    }
    default:
      return { private: true, content: `Unknown log type "${sub}".` };
  }
  const r = await ctx.api.log(pid, body);
  return { private: true, content: notices(r.notices) || 'Logged.' };
}

export async function suggestGoal(api: Api, pid: number, q: string, seasonOnly: boolean): Promise<Choice[]> {
  const { goals: g } = await api.goals(pid);
  const s = q.trim().toLowerCase().replace(/^#/, '');
  return g.goals
    .filter((x) => x.status === 'active' && (!seasonOnly || x.level === 'season'))
    .filter((x) => !s || String(x.id) === s || x.title.toLowerCase().includes(s))
    .slice(0, 25)
    .map((x) => ({ name: clip(`#${x.id} ${x.level === 'season' ? '' : x.level === 'month' ? '[month] ' : '[week] '}${x.title} · ${pct(x.progress)}`, 100), value: x.id }));
}
