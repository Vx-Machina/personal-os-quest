import { useState, type FormEvent, type ReactNode } from 'react';
import { DOMAINS, DOMAIN_INFO, type Domain, type TaskType } from '@poq/core';
import type { GameState, TaskView } from '../api';
import { Sprite } from './Sprite';

export interface QuestActions {
  toggle: (t: TaskView) => void;
  score: (t: TaskView, dir: 'up' | 'down') => void;
  edit: (t: TaskView) => void;
  quickAdd: (type: TaskType, title: string, domain: Domain) => Promise<boolean>;
  clearDone: (ids: number[]) => void;
}

const DIFF_PIPS = { trivial: 1, easy: 2, medium: 3, hard: 4 } as const;

function DomainTag({ domain, compact = false }: { domain: Domain; compact?: boolean }) {
  const info = DOMAIN_INFO[domain];
  return (
    <span className="domain-tag" title={info.label}>
      <Sprite id={info.icon} scale={1} />
      {!compact && <span className="domain-tag-label">{info.short}</span>}
    </span>
  );
}

function Pips({ level }: { level: keyof typeof DIFF_PIPS }) {
  return (
    <span className="pips" title={`Difficulty: ${level}`} aria-label={`Difficulty ${level}`}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= DIFF_PIPS[level] ? 'on' : ''} />
      ))}
    </span>
  );
}

function GoalChip({ task }: { task: TaskView }) {
  if (!task.goalLink) return null;
  const alert = task.goalLink.alert;
  return (
    <span className={`goal-chip ${alert ? `alert-${alert}` : ''}`} title={`Linked to the goal "${task.goalLink.title}"`}>
      ◎ {task.goalLink.title}
      {alert === 'overdue' && ' · 48h passed'}
      {alert === 'due' && ' · go today'}
    </span>
  );
}

function TaskRow({ task, actions }: { task: TaskView; actions: QuestActions }) {
  const done = task.completed;
  return (
    <li className={`task ${done ? 'is-done' : ''} ${task.dueToday ? '' : 'is-off'} ${task.goalLink?.alert ? `alert-${task.goalLink.alert}` : ''}`}>
      <button
        className={`check ${done ? 'checked' : ''}`}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Uncheck ${task.title}` : `Complete ${task.title}`}
        onClick={() => actions.toggle(task)}
      >
        {done && <Sprite id="icon-check" scale={1} />}
      </button>
      <button className="task-body" onClick={() => actions.edit(task)} aria-label={`Edit ${task.title}`}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          {task.timeLabel && <span className="time">{task.timeLabel}</span>}
          <DomainTag domain={task.domain} />
          <Pips level={task.difficulty} />
          {task.type === 'daily' && task.streak > 0 && (
            <span className="streak" title={`Streak ${task.streak} (best ${task.bestStreak})`}>
              <Sprite id="icon-streak" scale={1} />
              {task.streak}
            </span>
          )}
          {task.forgiving && <span className="pill" title="Missing it costs no HP">forgiving</span>}
          <GoalChip task={task} />
          <span className="task-id">#{task.id}</span>
        </span>
        {task.notes && <span className="task-notes">{task.notes}</span>}
      </button>
    </li>
  );
}

function HabitRow({ task, actions }: { task: TaskView; actions: QuestActions }) {
  return (
    <li className={`task habit ${task.goalLink?.alert ? `alert-${task.goalLink.alert}` : ''}`}>
      {task.allowUp ? (
        <button className="score score-up" onClick={() => actions.score(task, 'up')} aria-label={`Plus ${task.title}`}>
          +
        </button>
      ) : (
        <span className="score score-off" aria-hidden />
      )}
      <button className="task-body" onClick={() => actions.edit(task)} aria-label={`Edit ${task.title}`}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          <DomainTag domain={task.domain} />
          <Pips level={task.difficulty} />
          {(task.counterUp > 0 || task.counterDown > 0) && (
            <span className="counter">
              {task.allowUp && <span className="up">+{task.counterUp}</span>}
              {task.allowDown && <span className="down">−{task.counterDown}</span>}
              <small>today</small>
            </span>
          )}
          <GoalChip task={task} />
          <span className="task-id">#{task.id}</span>
        </span>
      </button>
      {task.allowDown ? (
        <button className="score score-down" onClick={() => actions.score(task, 'down')} aria-label={`Minus ${task.title}`}>
          −
        </button>
      ) : (
        <span className="score score-off" aria-hidden />
      )}
    </li>
  );
}

function QuickAdd({ type, actions, placeholder, defaultDomain }: { type: TaskType; actions: QuestActions; placeholder: string; defaultDomain: Domain }) {
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState<Domain>(defaultDomain);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (await actions.quickAdd(type, title.trim(), domain)) setTitle('');
  };
  return (
    <form className="quick-add" onSubmit={submit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} aria-label={placeholder} maxLength={120} />
      <select value={domain} onChange={(e) => setDomain(e.target.value as Domain)} aria-label="Life domain">
        {DOMAINS.map((d) => (
          <option key={d} value={d}>
            {DOMAIN_INFO[d].label}
          </option>
        ))}
      </select>
      <button className="btn btn-small" type="submit" disabled={!title.trim()}>
        Add
      </button>
    </form>
  );
}

function Collapsible({ label, children, initiallyOpen = false }: { label: string; children: ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="collapsible">
      <button className="collapsible-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`caret ${open ? 'open' : ''}`}>▸</span> {label}
      </button>
      {open && children}
    </div>
  );
}

export function ResetBanner({ report, onDismiss }: { report: NonNullable<GameState['lastReset']>; onDismiss: () => void }) {
  const perfect = report.due > 0 && report.missed.length === 0;
  return (
    <div className={`banner panel ${report.fainted ? 'banner-bad' : perfect ? 'banner-good' : ''}`} role="status">
      <Sprite id={perfect ? 'icon-level' : report.damage > 0 ? 'icon-hp' : 'icon-streak'} scale={2} />
      <div className="banner-text">
        <strong>{report.forced ? 'Day reset (manual)' : 'A new day begins'}</strong>
        <span>
          {report.resting
            ? 'Rest mode: no damage, streaks frozen.'
            : `${report.done}/${report.due} dailies done${report.damage ? ` · −${report.damage} HP` : ''} · day streak ${report.dayStreak}`}
          {report.fainted && ' · You fainted and lost a level.'}
        </span>
        {report.missed.length > 0 && !report.resting && (
          <span className="banner-missed">Missed: {report.missed.map((m) => m.title).join(', ')}</span>
        )}
      </div>
      <button className="btn btn-ghost btn-small" onClick={onDismiss}>
        OK
      </button>
    </div>
  );
}

export function Quests({ state, actions }: { state: GameState; actions: QuestActions }) {
  const dailies = state.tasks.filter((t) => t.type === 'daily');
  const due = dailies.filter((t) => t.dueToday);
  const offToday = dailies.filter((t) => !t.dueToday);
  const habits = state.tasks.filter((t) => t.type === 'habit');
  const todos = state.tasks.filter((t) => t.type === 'todo');
  const openTodos = todos.filter((t) => !t.completed);
  const doneTodos = todos.filter((t) => t.completed);
  const doneCount = due.filter((t) => t.completed).length;
  const pct = due.length ? Math.round((doneCount / due.length) * 100) : 0;

  return (
    <div className="quests">
      <section className="column panel col-dailies" aria-labelledby="h-dailies">
        <div className="column-head">
          <h2 id="h-dailies">Dailies</h2>
          <span className="count">
            {doneCount}/{due.length}
          </span>
        </div>
        <div className="progress" aria-hidden>
          <div style={{ width: `${pct}%` }} />
        </div>
        <ul className="task-list">
          {due.map((t) => (
            <TaskRow key={t.id} task={t} actions={actions} />
          ))}
          {due.length === 0 && <li className="empty">No dailies due today.</li>}
        </ul>
        {offToday.length > 0 && (
          <Collapsible label={`Not due today (${offToday.length})`}>
            <ul className="task-list">
              {offToday.map((t) => (
                <TaskRow key={t.id} task={t} actions={actions} />
              ))}
            </ul>
          </Collapsible>
        )}
        <QuickAdd type="daily" actions={actions} placeholder="Add a daily quest…" defaultDomain="health" />
      </section>

      <section className="column panel" aria-labelledby="h-habits">
        <div className="column-head">
          <h2 id="h-habits">Habits</h2>
          <span className="count">{habits.length}</span>
        </div>
        <ul className="task-list">
          {habits.map((t) => (
            <HabitRow key={t.id} task={t} actions={actions} />
          ))}
          {habits.length === 0 && <li className="empty">Add something you want to do more (+) or less (−).</li>}
        </ul>
        <QuickAdd type="habit" actions={actions} placeholder="Add a habit…" defaultDomain="health" />
      </section>

      <section className="column panel" aria-labelledby="h-todos">
        <div className="column-head">
          <h2 id="h-todos">To-dos</h2>
          <span className="count">{openTodos.length}</span>
        </div>
        <ul className="task-list">
          {openTodos.map((t) => (
            <TaskRow key={t.id} task={t} actions={actions} />
          ))}
          {openTodos.length === 0 && <li className="empty">All clear. Add a chore or a one-off task.</li>}
        </ul>
        {doneTodos.length > 0 && (
          <Collapsible label={`Done (${doneTodos.length})`}>
            <ul className="task-list">
              {doneTodos.map((t) => (
                <TaskRow key={t.id} task={t} actions={actions} />
              ))}
            </ul>
            <button className="btn btn-ghost btn-small" onClick={() => actions.clearDone(doneTodos.map((t) => t.id))}>
              Clear done to-dos
            </button>
          </Collapsible>
        )}
        <QuickAdd type="todo" actions={actions} placeholder="Add a to-do…" defaultDomain="environment" />
      </section>
    </div>
  );
}
