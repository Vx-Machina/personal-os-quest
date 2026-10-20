import { useCallback, useEffect, useRef, useState } from 'react';
import type { Domain, GoalState, Notice, TaskType } from '@poq/core';
import { api, ApiError, type GameState, type GoalMutation, type Mutation, type PlayerSummary, type TaskView } from './api';
import { GoalsModule, type GoalsTab } from './goals/GoalsModule';
import { useStored } from './hooks';
import { Hud } from './components/Hud';
import { Quests, ResetBanner, type QuestActions } from './components/Quests';
import { TaskEditor } from './components/TaskEditor';
import { Wheel } from './components/Wheel';
import { Shop, type ShopActions } from './components/Shop';
import { Log } from './components/Log';
import { Settings } from './components/Settings';
import { Spotlight, Toasts, type Toast } from './components/Toasts';
import { Sprite } from './components/Sprite';

type Module = 'quest' | 'goals';
type Tab = 'quests' | 'wheel' | 'shop' | 'log';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'quests', label: 'Quests', icon: 'icon-check' },
  { id: 'wheel', label: 'Wheel', icon: 'icon-xp' },
  { id: 'shop', label: 'Shop', icon: 'icon-shop' },
  { id: 'log', label: 'Log', icon: 'dom-growth' },
];
const GOAL_TABS: { id: GoalsTab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'icon-streak' },
  { id: 'dashboard', label: 'Goals', icon: 'icon-level' },
  { id: 'review', label: 'Review', icon: 'dom-growth' },
  { id: 'toolkit', label: 'Toolkit', icon: 'dom-career' },
];

let toastId = 0;

export function App() {
  const [pid, setPid] = useStored('poq.player', 'local');
  const [tabRaw, setTab] = useStored('poq.tab', 'quests');
  const tab = (TABS.some((t) => t.id === tabRaw) ? tabRaw : 'quests') as Tab;
  const [moduleRaw, setModule] = useStored('poq.module', 'quest');
  const mod: Module = moduleRaw === 'goals' ? 'goals' : 'quest';
  const [goalTabRaw, setGoalTab] = useStored('poq.goalTab', 'today');
  const goalTab = (GOAL_TABS.some((t) => t.id === goalTabRaw) ? goalTabRaw : 'today') as GoalsTab;
  const [goals, setGoals] = useState<GoalState | null>(null);
  const [seenReset, setSeenReset] = useStored('poq.seenReset', '');
  const [state, setState] = useState<GameState | null>(null);
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [spotlight, setSpotlight] = useState<{ notice: Notice; extra: string[] }[]>([]);
  const [editing, setEditing] = useState<TaskView | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inFlight = useRef(0);

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'reset' ? 7000 : 3800);
  }, []);

  /** Level-ups and faints get a spotlight (with any unlocks listed); everything else from one action becomes one toast. */
  const push = useCallback(
    (notices: Notice[]) => {
      const big = notices.filter((n) => n.kind === 'levelUp' || n.kind === 'faint');
      const unlocks = big.some((n) => n.kind === 'levelUp') ? notices.filter((n) => n.kind === 'unlock') : [];
      if (big.length) {
        setSpotlight((s) => [...s, ...big.map((notice, i) => ({ notice, extra: i === big.length - 1 ? unlocks.map((u) => u.text) : [] }))]);
      }
      const rest = notices.filter((n) => !big.includes(n) && !unlocks.includes(n));
      if (!rest.length) return;
      const kind = rest.find((n) => n.kind === 'reset')?.kind ?? rest.find((n) => n.kind === 'damage')?.kind ?? rest[0].kind;
      toast(kind, rest.map((n) => n.text).join('\n'));
    },
    [toast],
  );

  const run = useCallback(
    async (p: Promise<Mutation>): Promise<boolean> => {
      inFlight.current++;
      try {
        const r = await p;
        setState(r.state);
        setFatal(null);
        push(r.notices);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof ApiError && e.code === 'not_found' && pid !== 'local' && !state) {
          setPid('local');
          return false;
        }
        if (!state) setFatal(msg);
        else toast('error', msg);
        return false;
      } finally {
        inFlight.current--;
      }
    },
    [push, toast, pid, setPid, state],
  );

  const runGoals = useCallback(
    async (p: Promise<GoalMutation>): Promise<boolean> => {
      inFlight.current++;
      try {
        const r = await p;
        setState(r.state);
        setGoals(r.goals);
        push(r.notices);
        return true;
      } catch (e) {
        toast('error', e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        inFlight.current--;
      }
    },
    [push, toast],
  );

  // The goals view is (re)loaded whenever you switch to it, so quest-board changes show up there.
  useEffect(() => {
    if (mod === 'goals' && state) void runGoals(api.goals(pid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod, pid, state === null]);

  const refreshPlayers = useCallback(() => {
    api.players().then(setPlayers).catch(() => undefined);
  }, []);

  useEffect(() => {
    setState(null);
    setGoals(null);
    void run(api.state(pid));
    refreshPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  // Pick up background day resets and changes made from Discord.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible' && inFlight.current === 0) {
        if (mod === 'goals') {
          api
            .goals(pid)
            .then((r) => {
              setState(r.state);
              setGoals(r.goals);
              push(r.notices);
            })
            .catch(() => undefined);
          return;
        }
        api
          .state(pid)
          .then((r) => {
            setState(r.state);
            push(r.notices);
          })
          .catch(() => undefined);
      }
    };
    const id = setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [pid, push, mod]);

  if (fatal && !state) {
    return (
      <div className="fatal">
        <Sprite id="icon-hp" scale={4} />
        <h1>Can't load your quest log</h1>
        <p>{fatal}</p>
        <button className="btn btn-primary" onClick={() => run(api.state(pid))}>
          Retry
        </button>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="fatal">
        <Sprite id="icon-xp" scale={4} className="spin" />
        <p>Loading…</p>
      </div>
    );
  }

  const quest: QuestActions = {
    toggle: (t) => void run(t.completed ? api.uncomplete(pid, t.id) : api.complete(pid, t.id)),
    score: (t, dir) => void run(api.score(pid, t.id, dir)),
    edit: (t) => setEditing(t),
    quickAdd: (type: TaskType, title: string, domain: Domain) => run(api.createTask(pid, { type, title, domain, difficulty: 'easy' })),
    clearDone: async (ids) => {
      for (const id of ids) await run(api.deleteTask(pid, id));
    },
  };
  const shop: ShopActions = {
    buyReward: (id) => void run(api.buy(pid, 'reward', id)),
    deleteReward: (id) => void run(api.deleteReward(pid, id)),
    addReward: (title, cost) => run(api.createReward(pid, { title, cost })),
    buyItem: (id) => void run(api.buy(pid, 'item', id)),
    equip: (id) => void run(api.equip(pid, id)),
  };

  const report = state.lastReset;
  const showBanner = report && report.ts !== seenReset && Date.now() - new Date(report.ts).getTime() < 36 * 3_600_000;

  return (
    <div className="app">
      <Hud player={state.player} onSettings={() => setSettingsOpen(true)} />

      <div className="nav-row">
        <div className="module-switch" role="tablist" aria-label="Module">
          <button role="tab" aria-selected={mod === 'quest'} className={mod === 'quest' ? 'active' : ''} onClick={() => setModule('quest')}>
            Quest board
          </button>
          <button role="tab" aria-selected={mod === 'goals'} className={mod === 'goals' ? 'active' : ''} onClick={() => setModule('goals')}>
            Life goals
          </button>
        </div>
        <nav className="tabs" aria-label="Sections">
          {mod === 'quest'
            ? TABS.map((t) => (
                <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                  <Sprite id={t.icon} scale={2} />
                  <span>{t.label}</span>
                </button>
              ))
            : GOAL_TABS.map((t) => (
                <button key={t.id} className={`tab ${goalTab === t.id ? 'active' : ''}`} onClick={() => setGoalTab(t.id)} aria-current={goalTab === t.id ? 'page' : undefined}>
                  <Sprite id={t.icon} scale={2} />
                  <span>{t.label}</span>
                </button>
              ))}
        </nav>
      </div>

      <main>
        {mod === 'goals' && (goals ? <GoalsModule tab={goalTab} g={goals} a={{ run: runGoals, pid }} /> : <p className="hint center">Loading your goals…</p>)}
        {mod === 'quest' && tab === 'quests' && (
          <>
            {showBanner && <ResetBanner report={report} onDismiss={() => setSeenReset(report.ts)} />}
            <Quests state={state} actions={quest} />
          </>
        )}
        {mod === 'quest' && tab === 'wheel' && <Wheel state={state} />}
        {mod === 'quest' && tab === 'shop' && <Shop state={state} actions={shop} />}
        {mod === 'quest' && tab === 'log' && <Log state={state} />}
      </main>

      <footer className="foot">
        Personal OS Quest · day {state.player.dayKey} · player #{state.player.id}
        {state.player.discordId ? ' · linked to Discord' : ''}
      </footer>

      {editing && (
        <TaskEditor
          task={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            if (await run(api.updateTask(pid, editing.id, patch))) setEditing(null);
          }}
          onDelete={async () => {
            if (await run(api.deleteTask(pid, editing.id))) setEditing(null);
          }}
        />
      )}

      {settingsOpen && (
        <Settings
          player={state.player}
          players={players}
          currentPid={pid}
          onClose={() => setSettingsOpen(false)}
          onSave={async (body) => {
            if (await run(api.updatePlayer(pid, body))) {
              setSettingsOpen(false);
              refreshPlayers();
            }
          }}
          onForceReset={async () => {
            if (await run(api.reset(pid, true))) setSettingsOpen(false);
          }}
          onSwitch={(next) => {
            setSettingsOpen(false);
            setPid(next);
          }}
          onCreatePlayer={async (name) => {
            try {
              const p = await api.createPlayer(name);
              setSettingsOpen(false);
              setPid(String(p.id));
            } catch (e) {
              toast('error', e instanceof Error ? e.message : String(e));
            }
          }}
        />
      )}

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      {spotlight.length > 0 && (
        <Spotlight notice={spotlight[0].notice} extra={spotlight[0].extra} equipped={state.player.equipped} onClose={() => setSpotlight((s) => s.slice(1))} />
      )}
    </div>
  );
}
