/**
 * Goals module service. Every mutation goes through GameService.run, so it shares the RPG's
 * transaction, lazy day reset and event log: XP from goals lands on the same character.
 */
import {
  DOMAINS,
  GameError,
  GOAL_GRANTS,
  PERSONAL_GOALS,
  PROTOCOLS,
  WEEK_TITLES,
  addDays,
  applyXp,
  averageProgress,
  badgeGrant,
  canPush,
  completeGoalTask,
  completeTask,
  computeProgress,
  currentDayKey,
  dayKey,
  daysBetween,
  defaultGoalSettings,
  dueBadges,
  effectOfQuestToggle,
  goalGrant,
  gymStats,
  isDayKey,
  localMinutes,
  mealQualifies,
  mealStats,
  mirrorQuest,
  nextWeekWindows,
  pomodoroStats,
  protocolStates,
  protocolsToPay,
  questActionForLog,
  questDraftFromGoalTask,
  rewardFor,
  runStats,
  scoreHabit,
  seedWindows,
  smokingStats,
  streakBack,
  sunStats,
  uncompleteGoalTask,
  uncompleteTask,
  validateGoalDraft,
  validateGoalTaskDraft,
  validateJournal,
  validateLogDraft,
  validatePeriod,
  wakeStats,
  weekKey,
  type CheckinData,
  type Domain,
  type FearData,
  type GameEvent,
  type Goal,
  type GoalGrantKind,
  type GoalProgress,
  type GoalState,
  type GoalView,
  type WeekSummary,
  type GoalSettings,
  type GoalTask,
  type HanseiData,
  type IdentityData,
  type IkigaiData,
  type JournalKind,
  type LeadData,
  type LogEntry,
  type MetricResult,
  type Notice,
  type ParetoData,
  type Player,
  type ProtocolsData,
  type ProtocolState,
  type Task,
  type TextData,
  type TrackerKind,
  type YearReviewData,
} from '@poq/core';
import { transaction } from './db';
import * as repo from './repo';
import * as grepo from './goals-repo';
import type { Change, GameService, Result } from './service';

export interface GoalResult extends Result {
  goals: GoalState;
}

const LOG_TRACKER: Partial<Record<LogEntry['kind'], TrackerKind>> = { smoke: 'smoking', wake: 'wake', gym: 'gym', run: 'run', sun: 'sun', meal: 'meals', pomodoro: 'pomodoro' };
const PAY_ONCE: JournalKind[] = ['checkin', 'gratitude', 'kaizen', 'hansei', 'pareto', 'lead', 'yearReview', 'fear'];

export class GoalService {
  private readonly db;

  constructor(
    private readonly game: GameService,
    private readonly opts: { seedLocal: boolean } = { seedLocal: true },
  ) {
    this.db = game.db;
    game.questHook = (pid, quest, event, player, now) => this.onQuest(pid, quest, event, player, now);
    game.decorate = (pid, tasks, now) => this.decorateQuests(pid, tasks, now);
  }

  // ------------------------------------------------------------------ plumbing

  private op(pid: number, fn: (player: Player, now: Date, today: string) => Change): GoalResult {
    const result = this.game.run(pid, (player, now) => {
      this.seedIfNeeded(pid, player, now);
      const change = fn(player, now, currentDayKey(player, now));
      const badges = this.awardBadges(pid, change.player, now);
      return { ...change, player: badges.player, notices: [...change.notices, ...badges.notices], events: [...change.events, ...badges.events] };
    });
    return { ...result, goals: this.build(pid) };
  }

  settings(pid: number): GoalSettings {
    const saved = grepo.getJournal<GoalSettings>(this.db, pid, 'settings', 'main')?.data;
    const d = defaultGoalSettings();
    return saved ? { ...d, ...saved, meals: { ...d.meals, ...saved.meals }, smoking: { ...d.smoking, ...saved.smoking }, protocols: { ...d.protocols, ...saved.protocols } } : d;
  }

  private saveSettings(pid: number, s: GoalSettings, now: Date): void {
    grepo.putJournal(this.db, pid, 'settings', 'main', s, now);
  }

  /** The active season goal that owns a tracker (the one its logs feed). */
  private trackerGoal(pid: number, tracker: TrackerKind): Goal | null {
    return grepo.listGoals(this.db, pid).find((g) => g.level === 'season' && g.status === 'active' && g.metric?.tracker === tracker) ?? null;
  }

  private mustGoal(pid: number, id: number): Goal {
    const g = grepo.getGoal(this.db, pid, id);
    if (!g) throw new GameError('not_found', `No goal #${id}`);
    return g;
  }

  private mustGoalTask(pid: number, id: number): GoalTask {
    const t = grepo.getGoalTask(this.db, pid, id);
    if (!t) throw new GameError('not_found', `No goal task #${id}`);
    return t;
  }

  // ------------------------------------------------------------------ seeding

  /** First visit: the local hero gets the seven starting goals; other players start empty. */
  ensureSeeded(pid: number): void {
    if (repo.getMeta(this.db, `goals_seeded:${pid}`)) return;
    transaction(this.db, () => {
      const player = this.game.mustPlayer(pid);
      this.seedIfNeeded(pid, player, this.game.now());
    });
  }

  private seedIfNeeded(pid: number, player: Player, now: Date): void {
    const key = `goals_seeded:${pid}`;
    if (repo.getMeta(this.db, key)) return;
    repo.setMeta(this.db, key, now.toISOString());
    const isLocal = Number(repo.getMeta(this.db, 'local_player_id')) === pid;
    if (!isLocal || !this.opts.seedLocal) return;
    const today = currentDayKey(player, now);
    const w = seedWindows(today);
    PERSONAL_GOALS.forEach((item, i) => {
      const questId = repo.insertTask(this.db, pid, item.quest, repo.nextSortOrder(this.db, pid, item.quest.type), now);
      const base = { ...item.season, parentId: null, level: 'season' as const, ...w.season };
      const seasonId = grepo.insertGoal(this.db, pid, base, questId, i, now);
      const child = (level: 'month' | 'week', title: string, win: { startDay: string; endDay: string }) =>
        grepo.insertGoal(this.db, pid, { ...base, level, title, parentId: seasonId, result: '', ifThen: [], ...win }, null, i, now);
      child('month', item.month, w.month);
      child('week', item.week, w.week);
    });
  }

  // ------------------------------------------------------------------ RPG integration

  /** Runs inside the RPG transaction when a quest is checked, unchecked or scored on the board. */
  private onQuest(pid: number, quest: Task, event: 'completed' | 'uncompleted' | 'scored_up', player: Player, now: Date) {
    const notices: Notice[] = [];
    const events: GameEvent[] = [];
    const today = currentDayKey(player, now);

    for (const t of mirrorQuest(quest, grepo.goalTasksByQuest(this.db, pid, quest.id), now)) {
      grepo.updateGoalTask(this.db, t);
      notices.push({ kind: 'info', text: `Goal task ${t.done ? 'done' : 'reopened'}: ${t.title}` });
    }

    const goal = grepo.listGoals(this.db, pid).find((g) => g.questId === quest.id && g.metric && g.status === 'active');
    if (goal?.metric) {
      const tracker = goal.metric.tracker;
      if (event === 'scored_up') {
        if (tracker === 'gym') grepo.insertLog(this.db, pid, { kind: 'gym', dayKey: today, goalId: goal.id, taskId: null, value: null, value2: null, tag: 'quest', note: 'Scored on the quest board' }, now);
      } else {
        const settings = this.settings(pid);
        const kind = { smoking: 'smoke', wake: 'wake', gym: 'gym', run: 'run', sun: 'sun', pomodoro: 'pomodoro', meals: 'meal' }[tracker];
        const logged = grepo.listLogs(this.db, pid, today).some((l) => l.dayKey === today && l.kind === kind && l.tag !== 'quest');
        const eff = effectOfQuestToggle(tracker, event === 'completed', today, settings, logged);
        if (eff.startQuit) {
          settings.smoking.quitDay = today;
          this.saveSettings(pid, settings, now);
          notices.push({ kind: 'streak', text: 'Smoke-free counter started: Day 1. If you slip, log it and keep going.' });
        }
        if (eff.add) grepo.insertLog(this.db, pid, { ...eff.add, goalId: goal.id }, now);
        if (eff.remove) grepo.deleteQuestLog(this.db, pid, eff.remove, today);
      }
    }
    return { player, notices, events };
  }

  /** Adds goal links (and the gym 48h alert) to quest-board rows. */
  private decorateQuests(pid: number, tasks: Task[], now: Date) {
    const out = new Map<number, { goalId: number; title: string; alert: 'due' | 'overdue' | null }>();
    const goals = grepo.listGoals(this.db, pid);
    if (!goals.length) return out;
    const player = repo.getPlayer(this.db, pid);
    const today = player ? currentDayKey(player, now) : '';
    let gymAlert: 'due' | 'overdue' | null = null;
    const gymGoal = goals.find((g) => g.metric?.tracker === 'gym' && g.status === 'active' && g.questId);
    if (gymGoal) {
      const status = gymStats(grepo.listLogs(this.db, pid, addDays(today, -7)), today, now).status;
      gymAlert = status === 'due' || status === 'overdue' ? status : null;
    }
    const byId = new Map(goals.map((g) => [g.id, g]));
    for (const g of goals) if (g.questId && g.status === 'active') out.set(g.questId, { goalId: g.id, title: g.title, alert: g.id === gymGoal?.id ? gymAlert : null });
    for (const t of grepo.listGoalTasks(this.db, pid)) {
      const g = byId.get(t.goalId);
      if (t.questId && g && tasks.some((q) => q.id === t.questId)) out.set(t.questId, { goalId: g.id, title: g.title, alert: null });
    }
    return out;
  }

  private awardBadges(pid: number, player: Player, now: Date): Change {
    const goal = this.trackerGoal(pid, 'smoking');
    if (!goal) return { player, notices: [], events: [] };
    // Badges count full days only: the streak as of yesterday.
    const yesterday = addDays(currentDayKey(player, now), -1);
    const best = smokingStats(grepo.listLogs(this.db, pid), this.settings(pid), yesterday).best;
    const due = dueBadges(goal, best);
    if (!due.length) return { player, notices: [], events: [] };
    let p = player;
    const notices: Notice[] = [];
    const events: GameEvent[] = [];
    for (const b of due) {
      const out = badgeGrant(p, b, now);
      p = out.player;
      notices.push(...out.notices);
      events.push(...out.events);
    }
    grepo.updateGoal(this.db, { ...goal, badges: [...goal.badges, ...due.map((b) => b.days)] });
    return { player: p, notices, events };
  }

  // ------------------------------------------------------------------ reads

  state(pid: number): GoalResult {
    return this.op(pid, (player) => ({ player, notices: [], events: [] }));
  }

  build(pid: number): GoalState {
    const now = this.game.now();
    const player = this.game.mustPlayer(pid);
    const today = currentDayKey(player, now);
    const week = weekKey(today);
    const year = today.slice(0, 4);
    const settings = this.settings(pid);
    const goals = grepo.listGoals(this.db, pid);
    const tasks = grepo.listGoalTasks(this.db, pid);
    const logs = grepo.listLogs(this.db, pid);
    const progress = computeProgress(goals, tasks, logs, settings, today);
    const pomodoro = pomodoroStats(logs, settings, today);
    const questTitles = new Map(repo.listTasks(this.db, pid).map((t) => [t.id, t.title]));

    const view = (g: Goal): GoalView => {
      const p = progress.get(g.id) as GoalProgress;
      return {
        ...g,
        progress: p.progress,
        measure: p.metric,
        tasksDone: p.tasksDone,
        tasksTotal: p.tasksTotal,
        childIds: p.childIds,
        questTitle: g.questId ? (questTitles.get(g.questId) ?? null) : null,
        pomodorosToday: pomodoro.byGoal[g.id]?.today ?? 0,
        pomodorosTotal: pomodoro.byGoal[g.id]?.total ?? 0,
      };
    };

    const j = <T>(kind: JournalKind, period: string) => grepo.getJournal<T>(this.db, pid, kind, period)?.data ?? null;
    const dayNotes = (kind: JournalKind) => new Set(grepo.listJournal(this.db, pid, kind, addDays(today, -400)).map((e) => e.period));
    const kaizenDays = dayNotes('kaizen');
    const gratitudeDays = dayNotes('gratitude');
    const checkins = new Map(grepo.listJournal<CheckinData>(this.db, pid, 'checkin', addDays(today, -60)).map((e) => [e.period, e.data]));
    const trackers = {
      smoking: smokingStats(logs, settings, today),
      wake: wakeStats(logs, settings, today),
      gym: gymStats(logs, today, now),
      run: runStats(logs, today),
      sun: sunStats(logs, settings, today),
      meals: mealStats(logs, settings, today),
      pomodoro,
    };
    const protocolData = j<ProtocolsData>('protocols', today);
    const seasons = goals.filter((g) => g.level === 'season' && g.status === 'active');
    const open = tasks.filter((t) => !t.done);

    return {
      today,
      week,
      year,
      now: now.toISOString(),
      timezone: player.settings.timezone,
      settings,
      goals: goals.map(view),
      tasks,
      top3: tasks.filter((t) => t.top3Day === today).slice(0, 3),
      suggestions: open.filter((t) => t.top3Day !== today).slice(0, 6),
      seasonProgress: averageProgress(
        seasons.map((g) => g.id),
        progress,
      ),
      trackers,
      protocols: protocolStates(protocolData, logs, settings, today),
      recentLogs: logs.filter((l) => daysBetween(l.dayKey, today) <= 2).reverse(),
      journal: {
        checkin: j<CheckinData>('checkin', today),
        gratitude: j<TextData>('gratitude', today),
        kaizen: j<TextData>('kaizen', today),
        protocols: protocolData,
        hansei: { thisWeek: j<HanseiData>('hansei', week), lastWeek: j<HanseiData>('hansei', addDays(week, -7)) },
        pareto: { thisWeek: j<ParetoData>('pareto', week), lastWeek: j<ParetoData>('pareto', addDays(week, -7)) },
        lead: { thisWeek: j<LeadData>('lead', week), nextWeek: j<LeadData>('lead', addDays(week, 7)) },
        yearReview: grepo.listJournal<YearReviewData>(this.db, pid, 'yearReview').map((e) => ({ year: e.period, data: e.data })),
        ikigai: j<IkigaiData>('ikigai', 'main'),
        identity: j<IdentityData>('identity', 'main'),
        fears: grepo.listJournal<FearData>(this.db, pid, 'fear').map((e) => ({ id: e.period, data: e.data, updatedAt: e.updatedAt })),
      },
      mood: Array.from({ length: 14 }, (_, i) => {
        const d = addDays(today, i - 13);
        const c = checkins.get(d);
        return { day: d, mood: c?.mood ?? null, energy: c?.energy ?? null };
      }),
      streaks: {
        day: player.dayStreak,
        bestDay: player.bestDayStreak,
        smokeFree: trackers.smoking.streak,
        wake: trackers.wake.streak,
        run: trackers.run.streak,
        sun: trackers.sun.streak,
        meals: trackers.meals.streak,
        kaizen: streakBack(today, (d) => kaizenDays.has(d)),
        gratitude: streakBack(today, (d) => gratitudeDays.has(d)),
        gym: trackers.gym.status,
      },
      wheel: this.wheelHistory(pid, player, now, today),
      thisWeek: this.weekSummary(pid, week, today, logs, settings, player),
      lastWeek: this.weekSummary(pid, addDays(week, -7), today, logs, settings, player),
    };
  }

  /** Stat points per domain per calendar week, last 12 weeks (feeds the wheel-over-time chart). */
  private wheelHistory(pid: number, player: Player, now: Date, today: string) {
    const weeks = Array.from({ length: 12 }, (_, i) => addDays(weekKey(today), (i - 11) * 7));
    const points = Object.fromEntries(DOMAINS.map((d) => [d, weeks.map(() => 0)])) as Record<Domain, number[]>;
    const since = new Date(now.getTime() - 13 * 7 * 86_400_000).toISOString();
    for (const e of grepo.statEventsSince(this.db, pid, since)) {
      const wk = weekKey(dayKey(new Date(e.ts), player.settings.timezone, player.settings.resetTime));
      const i = weeks.indexOf(wk);
      if (i >= 0 && points[e.domain]) points[e.domain][i] = Math.max(0, points[e.domain][i] + e.stat);
    }
    return { weeks, points };
  }

  private weekSummary(pid: number, week: string, today: string, logs: LogEntry[], settings: GoalSettings, player: Player): WeekSummary {
    const end = addDays(week, 6);
    const lastDay = daysBetween(end, today) >= 0 ? end : today;
    const days = Math.max(0, daysBetween(week, lastDay) + 1);
    const inWeek = (d: string) => weekKey(d) === week && daysBetween(d, today) >= 0;
    const wl = logs.filter((l) => inWeek(l.dayKey));
    const kind = (k: LogEntry['kind']) => wl.filter((l) => l.kind === k);
    const distinct = (ls: LogEntry[]) => new Set(ls.map((l) => l.dayKey)).size;

    const wakeFirst = new Map<string, LogEntry>();
    for (const l of kind('wake')) if (!wakeFirst.has(l.dayKey)) wakeFirst.set(l.dayKey, l);
    const wakeVals = [...wakeFirst.values()].map((l) => l.value).filter((v): v is number => v !== null);
    const limit = Number(settings.wakeTarget.slice(0, 2)) * 60 + Number(settings.wakeTarget.slice(3)) + settings.wakeGraceMin;
    const quit = settings.smoking.quitDay;
    const smokedDays = new Set(kind('smoke').map((l) => l.dayKey));
    const weekDays = Array.from({ length: days }, (_, i) => addDays(week, i));

    const fromIso = new Date(Date.parse(`${week}T00:00:00Z`) - 86_400_000).toISOString();
    const evs = grepo.eventsSince(this.db, pid, fromIso).filter((e) => inWeek(dayKey(new Date(e.ts), player.settings.timezone, player.settings.resetTime)));
    const checkins = grepo.listJournal<CheckinData>(this.db, pid, 'checkin', week).filter((e) => inWeek(e.period));
    const avg = (vals: number[]) => (vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null);
    const notes = (k: JournalKind) => grepo.listJournal(this.db, pid, k, week).filter((e) => inWeek(e.period)).length;
    const protocols = grepo.listJournal<ProtocolsData>(this.db, pid, 'protocols', week).filter((e) => inWeek(e.period));

    return {
      week,
      days,
      xp: evs.reduce((s, e) => s + e.xp, 0),
      questsDone: evs.filter((e) => e.type === 'complete').length - evs.filter((e) => e.type === 'undo').length,
      wakeAvg: wakeVals.length ? `${String(Math.floor(avg(wakeVals)! / 60)).padStart(2, '0')}:${String(Math.round(avg(wakeVals)! % 60)).padStart(2, '0')}` : null,
      wakeOnTime: [...wakeFirst.values()].filter((l) => l.value === null || l.value <= limit).length,
      runDays: distinct(kind('run')),
      gymSessions: distinct(kind('gym')),
      sunDays: distinct(kind('sun')),
      smokeFreeDays: quit ? weekDays.filter((d) => daysBetween(quit, d) >= 0 && !smokedDays.has(d)).length : null,
      cigarettes: kind('smoke').reduce((s, l) => s + (l.value ?? 0), 0),
      cravings: kind('craving').length,
      cravingsResisted: kind('craving').filter((l) => l.value2 === 1).length,
      pomodoros: kind('pomodoro').length,
      mealDays: weekDays.filter((d) => mealQualifies(kind('meal').filter((l) => l.dayKey === d))).length,
      moodAvg: avg(checkins.map((c) => c.data.mood)),
      energyAvg: avg(checkins.map((c) => c.data.energy)),
      kaizenNotes: notes('kaizen'),
      gratitudeNotes: notes('gratitude'),
      protocolChecks: protocols.reduce((s, e) => s + e.data.checked.length, 0),
    };
  }

  // ------------------------------------------------------------------ goals

  createGoal(pid: number, body: Record<string, unknown>): GoalResult {
    return this.op(pid, (player, now, today) => {
      const draft = validateGoalDraft(body, today);
      if (draft.parentId !== null) {
        const parent = this.mustGoal(pid, draft.parentId);
        if (draft.level === 'month' && parent.level !== 'season') throw new GameError('invalid', 'a monthly milestone belongs to a season goal');
        if (draft.level === 'week' && parent.level === 'week') throw new GameError('invalid', 'a weekly target belongs to a season goal or a monthly milestone');
      } else if (draft.level !== 'season') {
        throw new GameError('invalid', 'monthly milestones and weekly targets need a parent goal');
      }
      grepo.insertGoal(this.db, pid, draft, null, grepo.nextGoalOrder(this.db, pid), now);
      return { player, notices: [{ kind: 'info', text: `New ${draft.level} goal: ${draft.title}` }], events: [] };
    });
  }

  updateGoal(pid: number, id: number, body: Record<string, unknown>): GoalResult {
    return this.op(pid, (player, _now, today) => {
      const g = this.mustGoal(pid, id);
      const draft = validateGoalDraft({ ...g, ...body, level: g.level, parentId: g.parentId }, today);
      const status = body.status ?? g.status;
      if (!['active', 'done', 'dropped'].includes(status as string)) throw new GameError('invalid', 'status must be active, done or dropped');
      grepo.updateGoal(this.db, { ...g, ...draft, status: status as Goal['status'] });
      const notices: Notice[] = status !== g.status ? [{ kind: 'info', text: `${g.title}: ${status}` }] : [];
      return { player, notices, events: [] };
    });
  }

  deleteGoal(pid: number, id: number): GoalResult {
    return this.op(pid, (player) => {
      const g = this.mustGoal(pid, id);
      grepo.deleteGoal(this.db, pid, id);
      const kept = g.questId ? ' Its linked quest stays on the board.' : '';
      return { player, notices: [{ kind: 'info', text: `Deleted goal "${g.title}" with its milestones and tasks.${kept}` }], events: [] };
    });
  }

  /** Weekly targets for next Monday-Sunday, copied from each active season goal with a tracker. */
  planNextWeek(pid: number): GoalResult {
    return this.op(pid, (player, now, today) => {
      const win = nextWeekWindows(today);
      const goals = grepo.listGoals(this.db, pid);
      let created = 0;
      for (const s of goals.filter((g) => g.level === 'season' && g.status === 'active' && g.metric)) {
        const startDay = daysBetween(s.startDay, win.startDay) >= 0 ? win.startDay : s.startDay;
        const endDay = daysBetween(win.endDay, s.endDay) >= 0 ? win.endDay : s.endDay;
        if (daysBetween(startDay, endDay) < 0) continue;
        if (goals.some((g) => g.parentId === s.id && g.level === 'week' && g.startDay === startDay)) continue;
        const label = new Date(`${startDay}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
        grepo.insertGoal(
          this.db,
          pid,
          { ...s, parentId: s.id, level: 'week', title: `${WEEK_TITLES[s.metric!.tracker]} (week of ${label})`, result: '', ifThen: [], metric: { tracker: s.metric!.tracker }, startDay, endDay },
          null,
          s.sortOrder,
          now,
        );
        created++;
      }
      return { player, notices: [{ kind: 'info', text: created ? `Planned ${created} weekly target(s) for next week.` : 'Next week is already planned.' }], events: [] };
    });
  }

  // ------------------------------------------------------------------ goal tasks

  createTask(pid: number, body: Record<string, unknown>): GoalResult {
    return this.op(pid, (player, now) => {
      const draft = validateGoalTaskDraft(body);
      this.mustGoal(pid, draft.goalId);
      const id = grepo.insertGoalTask(this.db, pid, draft, now);
      if (body.push) {
        const t = this.mustGoalTask(pid, id);
        const g = this.mustGoal(pid, t.goalId);
        const questId = repo.insertTask(this.db, pid, questDraftFromGoalTask(t, g), repo.nextSortOrder(this.db, pid, 'todo'), now);
        grepo.updateGoalTask(this.db, { ...t, questId });
      }
      return { player, notices: [{ kind: 'info', text: `New task: ${draft.title}${body.push ? ' (on the quest board)' : ''}` }], events: [] };
    });
  }

  updateTask(pid: number, id: number, body: Record<string, unknown>): GoalResult {
    return this.op(pid, (player, _now, today) => {
      const t = this.mustGoalTask(pid, id);
      const draft = validateGoalTaskDraft({ ...t, ...body });
      this.mustGoal(pid, draft.goalId);
      let top3Day = t.top3Day;
      if (body.top3 !== undefined) {
        if (body.top3) {
          const pinned = grepo.listGoalTasks(this.db, pid).filter((x) => x.top3Day === today && x.id !== id).length;
          if (pinned >= 3) throw new GameError('invalid', "Today's top 3 is full. Unpin one first.");
          top3Day = today;
        } else top3Day = null;
      }
      const next: GoalTask = { ...t, ...draft, top3Day };
      grepo.updateGoalTask(this.db, next);
      if (next.questId) {
        const quest = repo.getTask(this.db, pid, next.questId);
        if (quest) repo.updateTask(this.db, { ...quest, title: next.title, difficulty: next.difficulty });
      }
      return { player, notices: [], events: [] };
    });
  }

  deleteTask(pid: number, id: number): GoalResult {
    return this.op(pid, (player) => {
      const t = this.mustGoalTask(pid, id);
      grepo.deleteGoalTask(this.db, pid, id);
      if (t.questId) repo.deleteTask(this.db, pid, t.questId);
      return { player, notices: [{ kind: 'info', text: `Deleted task: ${t.title}${t.questId ? ' (and its quest)' : ''}` }], events: [] };
    });
  }

  completeTask(pid: number, id: number): GoalResult {
    return this.op(pid, (player, now) => {
      const t = this.mustGoalTask(pid, id);
      const quest = t.questId ? repo.getTask(this.db, pid, t.questId) : null;
      const out = completeGoalTask(player, t, quest, now);
      grepo.updateGoalTask(this.db, out.goalTask);
      return { player: out.player, tasks: out.quest ? [out.quest] : [], notices: out.notices, events: out.events };
    });
  }

  uncompleteTask(pid: number, id: number): GoalResult {
    return this.op(pid, (player, now) => {
      const t = this.mustGoalTask(pid, id);
      const quest = t.questId ? repo.getTask(this.db, pid, t.questId) : null;
      const out = uncompleteGoalTask(player, t, quest, now);
      grepo.updateGoalTask(this.db, out.goalTask);
      return { player: out.player, tasks: out.quest ? [out.quest] : [], notices: out.notices, events: out.events };
    });
  }

  pushTask(pid: number, id: number): GoalResult {
    return this.op(pid, (player, now) => {
      const t = this.mustGoalTask(pid, id);
      canPush(t);
      const g = this.mustGoal(pid, t.goalId);
      const questId = repo.insertTask(this.db, pid, questDraftFromGoalTask(t, g), repo.nextSortOrder(this.db, pid, 'todo'), now);
      grepo.updateGoalTask(this.db, { ...t, questId });
      return { player, notices: [{ kind: 'info', text: `On the quest board as #${questId}: finishing it now earns XP and gold.` }], events: [] };
    });
  }

  // ------------------------------------------------------------------ logs

  addLog(pid: number, body: Record<string, unknown>): GoalResult {
    return this.op(pid, (player, now, today) => {
      const nowMin = localMinutes(now, player.settings.timezone);
      const input = { ...body };
      if ((input.kind === 'wake' || input.kind === 'meal') && (input.value === undefined || input.value === null)) input.value = nowMin;
      if (input.kind === 'sun' && (input.value2 === undefined || input.value2 === null)) input.value2 = Math.max(0, nowMin - Number(input.value ?? 10));
      const draft = validateLogDraft(input, today);
      const goal = draft.goalId !== null ? this.mustGoal(pid, draft.goalId) : null;
      const task = draft.taskId !== null ? this.mustGoalTask(pid, draft.taskId) : null;
      const settings = this.settings(pid);
      grepo.insertLog(this.db, pid, draft, now);

      let p = player;
      const notices: Notice[] = [];
      const events: GameEvent[] = [];
      const changedQuests: Task[] = [];
      const add = (out: { player: Player; notices: Notice[]; events: GameEvent[] }) => {
        p = out.player;
        notices.push(...out.notices);
        events.push(...out.events);
      };
      const smokingGoal = this.trackerGoal(pid, 'smoking');
      const plan = smokingGoal?.ifThen[0];

      switch (draft.kind) {
        case 'pomodoro': {
          const owner = goal ?? (task ? this.mustGoal(pid, task.goalId) : null);
          add(goalGrant(p, 'pomodoro', now, { domain: owner?.domain ?? 'career', label: owner ? `Pomodoro on ${owner.title}` : 'Pomodoro' }));
          if (task) grepo.updateGoalTask(this.db, { ...task, pomodoros: task.pomodoros + 1 });
          break;
        }
        case 'craving':
          if (draft.value2 === 1) add(goalGrant(p, 'craving', now));
          else notices.push({ kind: 'info', text: 'Craving logged. No HP lost. Next time, try your plan first.' });
          if (plan) notices.push({ kind: 'info', text: `Your plan: if ${plan.if}, then ${plan.then}.` });
          break;
        case 'smoke':
          notices.push({ kind: 'info', text: `Slip logged (${draft.value}). No HP lost. Reset and keep going: the counter starts again tomorrow.` });
          break;
        default:
          notices.push({ kind: 'info', text: `Logged: ${draft.kind}` });
      }

      const tracker = LOG_TRACKER[draft.kind];
      const linked = tracker ? this.trackerGoal(pid, tracker) : null;
      if (tracker && linked?.questId) {
        const quest = repo.getTask(this.db, pid, linked.questId);
        if (quest) {
          const todayLogs = grepo.listLogs(this.db, pid, today).filter((l) => l.dayKey === today);
          const action = questActionForLog(tracker, quest, draft, {
            today,
            settings,
            todayLogs,
            pomodorosToday: todayLogs.filter((l) => l.kind === 'pomodoro').length,
            mealQualifiesToday: mealQualifies(todayLogs.filter((l) => l.kind === 'meal')),
          });
          if (action === 'complete') {
            const out = completeTask(p, quest, now);
            add(out);
            changedQuests.push(out.task!);
          } else if (action === 'uncomplete') {
            const out = uncompleteTask(p, quest, now);
            add(out);
            changedQuests.push(out.task!);
          } else if (action === 'score_up') {
            const out = scoreHabit(p, quest, 'up', now);
            add(out);
            changedQuests.push(out.task!);
          }
        }
      }
      return { player: p, tasks: changedQuests, notices, events };
    });
  }

  /** Deleting a pomodoro or a resisted craving takes its reward back. */
  deleteLog(pid: number, id: number): GoalResult {
    return this.op(pid, (player, now) => {
      const l = grepo.getLog(this.db, pid, id);
      if (!l) throw new GameError('not_found', `No log #${id}`);
      grepo.deleteLog(this.db, pid, id);
      const reverse = (kind: GoalGrantKind, domain: Domain) => {
        const r = rewardFor(GOAL_GRANTS[kind].difficulty);
        const p: Player = { ...player, gold: player.gold - r.gold, stats: { ...player.stats, [domain]: Math.max(0, player.stats[domain] - r.stat) } };
        const xp = applyXp(p, -r.xp, now);
        return {
          player: xp.player,
          notices: [{ kind: 'loss' as const, text: `Removed: -${r.xp} XP -${r.gold} gold` }, ...xp.notices],
          events: [{ type: 'goal' as const, ts: now.toISOString(), taskId: null, domain, xp: -r.xp, gold: -r.gold, hp: 0, stat: -r.stat, text: `${GOAL_GRANTS[kind].label} removed` }],
        };
      };
      if (l.kind === 'pomodoro') {
        const owner = l.goalId ? grepo.getGoal(this.db, pid, l.goalId) : null;
        if (l.taskId) {
          const t = grepo.getGoalTask(this.db, pid, l.taskId);
          if (t) grepo.updateGoalTask(this.db, { ...t, pomodoros: Math.max(0, t.pomodoros - 1) });
        }
        return reverse('pomodoro', owner?.domain ?? 'career');
      }
      if (l.kind === 'craving' && l.value2 === 1) return reverse('craving', 'health');
      return { player, notices: [{ kind: 'info', text: 'Log removed.' }], events: [] };
    });
  }

  // ------------------------------------------------------------------ journal

  putJournal(pid: number, kind: JournalKind, period: string, data: unknown): GoalResult {
    return this.op(pid, (player, now, today) => {
      validatePeriod(kind, period);
      const settings = this.settings(pid);
      const clean = validateJournal(kind, data, settings);
      const existing = grepo.getJournal(this.db, pid, kind, period);
      let p = player;
      const notices: Notice[] = [];
      const events: GameEvent[] = [];

      if (kind === 'settings') {
        this.saveSettings(pid, clean as GoalSettings, now);
        return { player, notices: [{ kind: 'info', text: 'Goal settings saved.' }], events: [] };
      }
      if (kind === 'protocols') {
        const prev = (existing?.data as ProtocolsData | undefined)?.granted ?? [];
        const next = clean as ProtocolsData;
        next.granted = prev;
        if (period === today) {
          for (const key of protocolsToPay(next.checked, prev).filter((k) => settings.protocols[k])) {
            const out = goalGrant(p, 'protocol', now, { label: PROTOCOLS.find((x) => x.key === key)?.label ?? key });
            p = out.player;
            notices.push(...out.notices);
            events.push(...out.events);
            next.granted = [...next.granted, key];
          }
        }
        grepo.putJournal(this.db, pid, kind, period, next, now);
        return { player: p, notices, events };
      }

      grepo.putJournal(this.db, pid, kind, period, clean, now);
      const current = this.isCurrentPeriod(kind, period, today);
      if (!existing && current && PAY_ONCE.includes(kind)) {
        const out = goalGrant(p, kind as GoalGrantKind, now);
        p = out.player;
        notices.push(...out.notices);
        events.push(...out.events);
      } else {
        notices.push({ kind: 'info', text: 'Saved.' });
      }
      return { player: p, notices, events };
    });
  }

  private isCurrentPeriod(kind: JournalKind, period: string, today: string): boolean {
    if (kind === 'fear') return true;
    if (kind === 'yearReview') return period === today.slice(0, 4);
    if (isDayKey(period) && weekKey(period) === period && ['hansei', 'pareto', 'lead'].includes(kind)) {
      const w = weekKey(today);
      return period === w || period === addDays(w, -7) || period === addDays(w, 7);
    }
    return period === today;
  }

  deleteJournal(pid: number, kind: JournalKind, period: string): GoalResult {
    return this.op(pid, (player) => {
      if (kind !== 'fear') throw new GameError('invalid', 'only fear-setting worksheets can be deleted');
      if (!grepo.deleteJournal(this.db, pid, kind, period)) throw new GameError('not_found', 'No such worksheet');
      return { player, notices: [{ kind: 'info', text: 'Worksheet deleted.' }], events: [] };
    });
  }
}
