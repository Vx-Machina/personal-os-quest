import { useState, type FormEvent } from 'react';
import {
  DIFFICULTIES,
  DOMAINS,
  DOMAIN_INFO,
  TRACKERS,
  type Difficulty,
  type Domain,
  type GoalLevel,
  type GoalState,
  type GoalTask,
  type GoalView,
  type IfThen,
  type TrackerKind,
} from '@poq/core';
import { api } from '../api';
import { Modal } from '../components/Modal';
import { Sprite } from '../components/Sprite';
import type { GoalActions } from './Today';
import { Ring, Tip, niceDate, paceInfo } from './ui';

const TRACKER_LABEL: Record<TrackerKind, string> = {
  smoking: 'Smoke-free days',
  wake: 'Up on time',
  gym: 'Gym sessions (48h rule)',
  run: 'Run days',
  sun: 'Morning sunlight days',
  pomodoro: 'Pomodoros',
  meals: 'Healthy-meal days',
};

function TaskRow({ t, g, a }: { t: GoalTask; g: GoalState; a: GoalActions }) {
  const pinned = t.top3Day === g.today;
  const [easy, setEasy] = useState(t.easy);
  const [editing, setEditing] = useState(false);
  return (
    <li className={`task ${t.done ? 'is-done' : ''}`}>
      <button
        className={`check ${t.done ? 'checked' : ''}`}
        role="checkbox"
        aria-checked={t.done}
        aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`}
        onClick={() => a.run(t.done ? api.uncompleteGoalTask(a.pid, t.id) : api.completeGoalTask(a.pid, t.id))}
      >
        {t.done && <Sprite id="icon-check" scale={1} />}
      </button>
      <div className="task-body static">
        <span className="task-title">{t.title}</span>
        <span className="task-meta">
          <span>{t.difficulty}</span>
          {t.due && <span>due {niceDate(t.due)}</span>}
          {t.pomodoros > 0 && <span>{t.pomodoros} pomodoro(s)</span>}
          {t.questId ? <span className="pill">on quest board #{t.questId}</span> : null}
          {t.easy && !editing && <span>easy way: {t.easy}</span>}
        </span>
        {editing && (
          <form
            className="quick-add"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await a.run(api.updateGoalTask(a.pid, t.id, { easy }))) setEditing(false);
            }}
          >
            <input value={easy} onChange={(e) => setEasy(e.target.value)} placeholder="What would this look like if it were easy?" maxLength={500} />
            <button className="btn btn-small">Save</button>
          </form>
        )}
      </div>
      <div className="task-tools">
        <button className={`btn btn-ghost btn-small ${t.leverage ? 'on' : ''}`} title="80/20: one of the few tasks that drive most of the result" aria-pressed={t.leverage} onClick={() => a.run(api.updateGoalTask(a.pid, t.id, { leverage: !t.leverage }))}>
          ★
        </button>
        <button className="btn btn-ghost btn-small" title="If it were easy…" onClick={() => setEditing(!editing)}>
          easy?
        </button>
        {!t.done && (
          <button className={`btn btn-ghost btn-small ${pinned ? 'on' : ''}`} aria-pressed={pinned} onClick={() => a.run(api.updateGoalTask(a.pid, t.id, { top3: !pinned }))}>
            {pinned ? 'Top 3 ✓' : 'Top 3'}
          </button>
        )}
        {!t.questId && !t.done && (
          <button className="btn btn-small" title="Make it a quest: finishing it earns XP and gold" onClick={() => a.run(api.pushGoalTask(a.pid, t.id))}>
            → Quest
          </button>
        )}
        <button className="btn btn-ghost btn-icon small" aria-label={`Delete ${t.title}`} onClick={() => a.run(api.deleteGoalTask(a.pid, t.id))}>
          ✕
        </button>
      </div>
    </li>
  );
}

export function GoalEditor({
  goal,
  parent,
  level,
  g,
  a,
  onClose,
  onOpen,
  onNewChild,
}: {
  goal: GoalView | null;
  parent: GoalView | null;
  level: GoalLevel;
  g: GoalState;
  a: GoalActions;
  onClose: () => void;
  onOpen: (id: number) => void;
  onNewChild: (level: GoalLevel, parentId: number) => void;
}) {
  const creating = goal === null;
  const [title, setTitle] = useState(goal?.title ?? '');
  const [domain, setDomain] = useState<Domain>(goal?.domain ?? parent?.domain ?? 'growth');
  const [result, setResult] = useState(goal?.result ?? '');
  const [purpose, setPurpose] = useState(goal?.purpose ?? '');
  const [easy, setEasy] = useState(goal?.easy ?? '');
  const [identity, setIdentity] = useState(goal?.identity ?? '');
  const [woop, setWoop] = useState(goal?.woop ?? { wish: '', outcome: '', obstacle: '', plan: '' });
  const [ifThen, setIfThen] = useState<IfThen[]>(goal?.ifThen.length ? goal.ifThen : [{ if: '', then: '' }]);
  const [tracker, setTracker] = useState<TrackerKind | ''>(goal?.metric?.tracker ?? (creating && parent?.metric ? parent.metric.tracker : ''));
  const [target, setTarget] = useState(goal?.metric?.target ? String(goal.metric.target) : '');
  const [startDay, setStartDay] = useState(goal?.startDay ?? '');
  const [endDay, setEndDay] = useState(goal?.endDay ?? '');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDiff, setTaskDiff] = useState<Difficulty>('easy');
  const [taskDue, setTaskDue] = useState('');
  const [taskLeverage, setTaskLeverage] = useState(false);
  const [taskPush, setTaskPush] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const levelName = level === 'season' ? 'Season goal (90 days)' : level === 'month' ? 'Monthly milestone' : 'Weekly target';
  const body = () => ({
    title,
    domain,
    result,
    purpose,
    easy,
    identity,
    woop,
    ifThen: ifThen.filter((x) => x.if.trim() || x.then.trim()),
    metric: tracker ? { tracker, ...(target ? { target: Number(target) } : {}) } : null,
    ...(startDay ? { startDay } : {}),
    ...(endDay ? { endDay } : {}),
  });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ok = creating ? await a.run(api.createGoal(a.pid, { ...body(), level, parentId: parent?.id ?? null })) : await a.run(api.updateGoal(a.pid, goal.id, body()));
    if (ok && creating) onClose();
  };

  const tasks = goal ? g.tasks.filter((t) => t.goalId === goal.id) : [];
  const children = goal ? g.goals.filter((c) => c.parentId === goal.id) : [];
  const pace = paceInfo(goal?.measure?.pace ?? null);

  return (
    <Modal title={creating ? `New ${levelName.toLowerCase()}${parent ? ` · ${parent.title}` : ''}` : `${levelName}`} onClose={onClose} className="modal-wide">
      {goal && (
        <div className="editor-summary">
          <Ring value={goal.progress} pace={goal.measure?.pace ?? null} size={64} title={goal.title} />
          <div>
            <b>{Math.round(goal.progress * 100)}%</b>
            {goal.measure && (
              <span className="hint">
                {' '}
                · {goal.measure.done}/{goal.measure.target} {goal.measure.unit} · {pace.label}
              </span>
            )}
            <div className="hint">
              {niceDate(goal.startDay)} → {niceDate(goal.endDay)}
              {goal.questTitle && ` · linked quest: ${goal.questTitle}`}
            </div>
          </div>
        </div>
      )}
      <form className="form" onSubmit={save}>
        <label>
          Goal
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="e.g. Launch the portfolio site" />
        </label>
        <fieldset>
          <legend>Life domain</legend>
          <div className="domain-picker">
            {DOMAINS.map((d) => (
              <button type="button" key={d} className={`domain-option ${domain === d ? 'active' : ''}`} onClick={() => setDomain(d)} aria-pressed={domain === d}>
                <Sprite id={DOMAIN_INFO[d].icon} scale={2} />
                <span>{DOMAIN_INFO[d].short}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <h3>
          RPM <Tip k="rpm" />
        </h3>
        <label>
          Result: what exactly, by when?
          <input value={result} onChange={(e) => setResult(e.target.value)} maxLength={500} />
        </label>
        <label>
          Purpose: why does it matter to you?
          <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} maxLength={1000} />
        </label>
        <p className="hint">Massive action plan: the tasks below.</p>

        <label>
          <span className="label-row">
            What would this look like if it were easy? <Tip k="easy" />
          </span>
          <input value={easy} onChange={(e) => setEasy(e.target.value)} maxLength={500} />
        </label>

        <h3>
          WOOP <Tip k="woop" />
        </h3>
        <div className="form-row">
          {(['wish', 'outcome', 'obstacle', 'plan'] as const).map((k) => (
            <label key={k}>
              {k[0].toUpperCase() + k.slice(1)}
              <input value={woop[k]} onChange={(e) => setWoop({ ...woop, [k]: e.target.value })} maxLength={300} />
            </label>
          ))}
        </div>

        <h3>
          If-then plans <Tip k="ifThen" />
        </h3>
        {ifThen.map((x, i) => (
          <div key={i} className="if-then-row">
            <span>If</span>
            <input value={x.if} onChange={(e) => setIfThen(ifThen.map((y, j) => (j === i ? { ...y, if: e.target.value } : y)))} placeholder="situation" maxLength={200} />
            <span>then</span>
            <input value={x.then} onChange={(e) => setIfThen(ifThen.map((y, j) => (j === i ? { ...y, then: e.target.value } : y)))} placeholder="what I do" maxLength={200} />
            <button type="button" className="btn btn-ghost btn-icon small" aria-label="Remove" onClick={() => setIfThen(ifThen.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setIfThen([...ifThen, { if: '', then: '' }])}>
          + If-then
        </button>

        <label>
          <span className="label-row">
            Identity: I am someone who… <Tip k="identity" />
          </span>
          <input value={identity} onChange={(e) => setIdentity(e.target.value)} maxLength={300} />
        </label>

        <h3>Measure</h3>
        <div className="form-row">
          <label>
            Tracker
            <select value={tracker} onChange={(e) => setTracker(e.target.value as TrackerKind | '')}>
              <option value="">None: roll up milestones and tasks</option>
              {TRACKERS.map((t) => (
                <option key={t} value={t}>
                  {TRACKER_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target (optional)
            <input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} disabled={!tracker} placeholder="auto" />
          </label>
          <label>
            Start
            <input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
          </label>
          <label>
            End
            <input type="date" value={endDay} onChange={(e) => setEndDay(e.target.value)} />
          </label>
        </div>
        <p className="hint">Leave dates empty for the default window ({level === 'season' ? '90 days from today' : level === 'month' ? '30 days' : 'rest of this week'}).</p>

        <div className="form-actions">
          {!creating &&
            (confirmDelete ? (
              <button type="button" className="btn btn-danger" onClick={async () => (await a.run(api.deleteGoal(a.pid, goal.id))) && onClose()}>
                Delete with milestones and tasks?
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ))}
          {!creating && goal.status === 'active' && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => a.run(api.updateGoal(a.pid, goal.id, { status: 'done' }))}>
                Mark done
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => a.run(api.updateGoal(a.pid, goal.id, { status: 'dropped' }))}>
                Drop
              </button>
            </>
          )}
          {!creating && goal.status !== 'active' && (
            <button type="button" className="btn btn-ghost" onClick={() => a.run(api.updateGoal(a.pid, goal.id, { status: 'active' }))}>
              Reactivate
            </button>
          )}
          <span className="spacer" />
          <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
            {creating ? 'Create' : 'Save'}
          </button>
        </div>
      </form>

      {goal && (
        <>
          <div className="form-section">
            <h3>
              Massive action plan <Tip k="pareto" />
            </h3>
            <ul className="task-list">
              {tasks.map((t) => (
                <TaskRow key={t.id} t={t} g={g} a={a} />
              ))}
              {tasks.length === 0 && <li className="empty">List the actions. Mark the few that matter most with ★ (80/20).</li>}
            </ul>
            <form
              className="task-add"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!taskTitle.trim()) return;
                const ok = await a.run(api.createGoalTask(a.pid, { goalId: goal.id, title: taskTitle, difficulty: taskDiff, due: taskDue || null, leverage: taskLeverage, push: taskPush }));
                if (ok) {
                  setTaskTitle('');
                  setTaskDue('');
                  setTaskLeverage(false);
                }
              }}
            >
              <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="New task…" maxLength={160} aria-label="New task" />
              <select value={taskDiff} onChange={(e) => setTaskDiff(e.target.value as Difficulty)} aria-label="Difficulty">
                {DIFFICULTIES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} aria-label="Due date" />
              <label className="check-label">
                <input type="checkbox" checked={taskLeverage} onChange={(e) => setTaskLeverage(e.target.checked)} /> ★ 80/20
              </label>
              <label className="check-label">
                <input type="checkbox" checked={taskPush} onChange={(e) => setTaskPush(e.target.checked)} /> quest (XP)
              </label>
              <button className="btn btn-small" disabled={!taskTitle.trim()}>
                Add
              </button>
            </form>
          </div>

          {goal.level !== 'week' && (
            <div className="form-section">
              <h3>{goal.level === 'season' ? 'Monthly milestones and weekly targets' : 'Weekly targets'}</h3>
              <ul className="children">
                {children.map((c) => (
                  <li key={c.id}>
                    <button className="child-title" onClick={() => onOpen(c.id)}>
                      <span className="level">{c.level === 'month' ? 'Month' : 'Week'}</span> {c.title}
                      <small>
                        {' '}
                        {niceDate(c.startDay, { day: 'numeric', month: 'short' })}–{niceDate(c.endDay, { day: 'numeric', month: 'short' })}
                        {c.status !== 'active' ? ` · ${c.status}` : ''}
                      </small>
                    </button>
                    <div className="mini-bar" aria-hidden>
                      <div style={{ width: `${Math.round(c.progress * 100)}%` }} />
                    </div>
                    <span className="mini-pct">{Math.round(c.progress * 100)}%</span>
                  </li>
                ))}
                {children.length === 0 && <li className="empty">No milestones yet.</li>}
              </ul>
              <div className="form-actions">
                {goal.level === 'season' && (
                  <button className="btn btn-small" onClick={() => onNewChild('month', goal.id)}>
                    + Monthly milestone
                  </button>
                )}
                <button className="btn btn-small" onClick={() => onNewChild('week', goal.id)}>
                  + Weekly target
                </button>
              </div>
            </div>
          )}
          {goal.parentId && (
            <p className="hint">
              Part of{' '}
              <button className="link" onClick={() => onOpen(goal.parentId!)}>
                {g.goals.find((x) => x.id === goal.parentId)?.title}
              </button>
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
