import { useEffect, useRef, useState } from 'react';
import type { GoalState } from '@poq/core';
import { Card } from './ui';

interface TimerState {
  mode: 'work' | 'break';
  /** Epoch ms when the current phase ends (running), or null when paused/idle. */
  endsAt: number | null;
  /** Remaining ms while paused. */
  remaining: number;
  goalId: number | null;
  taskId: number | null;
}

const KEY = 'poq.pomodoro';

function load(workMs: number): TimerState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as TimerState;
  } catch {
    /* ignore */
  }
  return { mode: 'work', endsAt: null, remaining: workMs, goalId: null, taskId: null };
}

function save(s: TimerState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch {
    /* audio blocked: the toast is enough */
  }
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** 25/5 timer (configurable). Each finished focus block is logged as a pomodoro and pays XP. */
export function Pomodoro({ goals, onDone }: { goals: GoalState; onDone: (goalId: number | null, taskId: number | null, minutes: number) => void }) {
  const workMs = goals.settings.pomodoroWorkMin * 60_000;
  const breakMs = goals.settings.pomodoroBreakMin * 60_000;
  const [t, setT] = useState<TimerState>(() => load(workMs));
  const [, tick] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  const update = (next: TimerState) => {
    setT(next);
    save(next);
  };

  useEffect(() => {
    if (!t.endsAt) return;
    const id = setInterval(() => {
      if (Date.now() >= (t.endsAt ?? 0)) {
        beep();
        if (t.mode === 'work') {
          done.current(t.goalId, t.taskId, goals.settings.pomodoroWorkMin);
          update({ ...t, mode: 'break', endsAt: Date.now() + breakMs, remaining: breakMs });
        } else {
          update({ ...t, mode: 'work', endsAt: null, remaining: workMs });
        }
      } else tick((n) => n + 1);
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, workMs, breakMs]);

  const remaining = t.endsAt ? t.endsAt - Date.now() : t.remaining;
  useEffect(() => {
    const base = 'Personal OS Quest';
    document.title = t.endsAt ? `${fmt(remaining)} ${t.mode === 'work' ? 'focus' : 'break'} · ${base}` : base;
  }, [remaining, t.endsAt, t.mode]);

  const total = t.mode === 'work' ? workMs : breakMs;
  const pct = 1 - Math.max(0, Math.min(1, remaining / total));
  const openTasks = goals.tasks.filter((x) => !x.done);
  const goalOptions = goals.goals.filter((g) => g.level === 'season' && g.status === 'active');
  const stats = goals.trackers.pomodoro;

  return (
    <Card title="Pomodoro" tip="pomodoro" className="pomodoro" aside={<span className="count">{stats.today}/{stats.target} today</span>}>
      <div className={`pomo-face ${t.mode}`}>
        <div className="pomo-time" aria-live="polite">
          {fmt(remaining)}
        </div>
        <div className="pomo-mode">{t.mode === 'work' ? 'Focus' : 'Break'}</div>
        <div className="pomo-track" aria-hidden>
          <div style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
      <div className="pomo-dots" aria-label={`${stats.today} pomodoros today`}>
        {Array.from({ length: Math.max(stats.target, stats.today) }, (_, i) => (
          <span key={i} className={i < stats.today ? 'on' : ''} />
        ))}
      </div>
      <div className="form-row">
        <label>
          For goal
          <select
            value={t.goalId ?? ''}
            onChange={(e) => update({ ...t, goalId: e.target.value ? Number(e.target.value) : null, taskId: null })}
            disabled={Boolean(t.endsAt)}
          >
            <option value="">Any work</option>
            {goalOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Task
          <select value={t.taskId ?? ''} onChange={(e) => update({ ...t, taskId: e.target.value ? Number(e.target.value) : null })} disabled={Boolean(t.endsAt)}>
            <option value="">None</option>
            {openTasks
              .filter((x) => !t.goalId || x.goalId === t.goalId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        {t.endsAt ? (
          <button className="btn" onClick={() => update({ ...t, endsAt: null, remaining: Math.max(0, t.endsAt! - Date.now()) })}>
            Pause
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => update({ ...t, endsAt: Date.now() + t.remaining })}>
            {t.remaining < total ? 'Resume' : t.mode === 'work' ? `Start ${goals.settings.pomodoroWorkMin} min` : `Start ${goals.settings.pomodoroBreakMin} min break`}
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => update({ ...t, mode: 'work', endsAt: null, remaining: workMs })}>
          Reset
        </button>
        <span className="spacer" />
        <button className="btn btn-ghost btn-small" onClick={() => onDone(t.goalId, t.taskId, goals.settings.pomodoroWorkMin)} title="Log a pomodoro you did without the timer">
          +1 done
        </button>
      </div>
    </Card>
  );
}
