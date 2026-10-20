import { DOMAINS, DOMAIN_INFO, daysBetween, type GoalState, type GoalView } from '@poq/core';
import { Sprite } from '../components/Sprite';
import { Bars, Card, Ring, Tip, niceDate, paceInfo } from './ui';

function measureLine(g: GoalView): string {
  if (g.measure) return `${g.measure.done} / ${g.measure.target} ${g.measure.unit}`;
  const parts = [];
  if (g.childIds.length) parts.push(`${g.childIds.length} milestone(s)`);
  if (g.tasksTotal) parts.push(`${g.tasksDone}/${g.tasksTotal} tasks`);
  return parts.length ? parts.join(' · ') : 'Add milestones or tasks to measure this goal';
}

function GoalCard({ goal, all, onOpen }: { goal: GoalView; all: GoalView[]; onOpen: (id: number) => void }) {
  const children = all.filter((c) => c.parentId === goal.id && c.status !== 'dropped');
  const pace = paceInfo(goal.measure?.pace ?? null);
  return (
    <article className={`goal-card panel status-${goal.status}`}>
      <div className="goal-top">
        <Ring value={goal.progress} pace={goal.measure?.pace ?? null} title={goal.title} />
        <div className="goal-main">
          <button className="goal-title" onClick={() => onOpen(goal.id)}>
            {goal.title}
          </button>
          <div className="task-meta">
            <span className="domain-tag">
              <Sprite id={DOMAIN_INFO[goal.domain].icon} scale={1} /> {DOMAIN_INFO[goal.domain].short}
            </span>
            {goal.status !== 'active' && <span className="pill">{goal.status}</span>}
            {goal.measure && <span className={`pace ${pace.cls}`}>{pace.label}</span>}
          </div>
          <div className="goal-measure">{measureLine(goal)}</div>
          {goal.questTitle && (
            <div className="hint">
              Quest: <b>{goal.questTitle}</b>
            </div>
          )}
          {goal.purpose ? <div className="purpose">Why: {goal.purpose}</div> : <div className="hint">Purpose not written yet (RPM).</div>}
        </div>
      </div>
      {children.length > 0 && (
        <ul className="children">
          {children.map((c) => (
            <li key={c.id}>
              <button className="child-title" onClick={() => onOpen(c.id)}>
                <span className="level">{c.level === 'month' ? 'Month' : 'Week'}</span> {c.title}
              </button>
              <div className="mini-bar" aria-hidden>
                <div style={{ width: `${Math.round(c.progress * 100)}%` }} />
              </div>
              <span className="mini-pct">{Math.round(c.progress * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
      <div className="goal-foot">
        <span className="hint">
          {goal.tasksTotal ? `Action plan ${goal.tasksDone}/${goal.tasksTotal}` : 'No action plan yet'}
          {goal.pomodorosTotal ? ` · ${goal.pomodorosTotal} pomodoros` : ''}
        </span>
        <button className="btn btn-small" onClick={() => onOpen(goal.id)}>
          Open
        </button>
      </div>
    </article>
  );
}

function WheelOverTime({ g }: { g: GoalState }) {
  const max = Math.max(1, ...DOMAINS.flatMap((d) => g.wheel.points[d]));
  const first = g.wheel.weeks[0];
  const last = g.wheel.weeks.at(-1)!;
  return (
    <Card title="Wheel of life over time" tip="wheelReview" className="wheel-time">
      <p className="hint">Stat points earned per week in each domain (last 12 weeks, same scale everywhere). Quests, logs and rituals all count.</p>
      <div className="multiples">
        {DOMAINS.map((d) => {
          const vals = g.wheel.points[d];
          const total = vals.reduce((s, v) => s + v, 0);
          return (
            <div key={d} className="multiple">
              <div className="multiple-head">
                <Sprite id={DOMAIN_INFO[d].icon} scale={1} />
                <span>{DOMAIN_INFO[d].short}</span>
                <b>{total}</b>
              </div>
              <Bars values={vals} labels={g.wheel.weeks.map((w) => `week of ${niceDate(w, { day: 'numeric', month: 'short' })}`)} max={max} height={40} unit=" pts" />
            </div>
          );
        })}
      </div>
      <div className="axis-ends">
        <span>{niceDate(first, { day: 'numeric', month: 'short' })}</span>
        <span>this week ({niceDate(last, { day: 'numeric', month: 'short' })})</span>
      </div>
    </Card>
  );
}

export function seasonInfo(g: GoalState): { start: string; end: string; day: number; length: number } | null {
  const seasons = g.goals.filter((x) => x.level === 'season' && x.status === 'active');
  if (!seasons.length) return null;
  const start = seasons.map((s) => s.startDay).sort()[0];
  const end = seasons.map((s) => s.endDay).sort().at(-1)!;
  return { start, end, day: Math.max(1, daysBetween(start, g.today) + 1), length: daysBetween(start, end) + 1 };
}

export function Dashboard({ g, onOpen, onNew }: { g: GoalState; onOpen: (id: number) => void; onNew: () => void }) {
  const seasons = g.goals.filter((x) => x.level === 'season');
  const active = seasons.filter((x) => x.status === 'active');
  const closed = seasons.filter((x) => x.status !== 'active');
  const info = seasonInfo(g);
  const s = g.streaks;
  const tiles: { label: string; value: string; icon: string; tone?: string }[] = [
    { label: 'Day streak', value: `${s.day}`, icon: 'icon-streak' },
    { label: 'Smoke-free', value: `${s.smokeFree} d`, icon: 'dom-health' },
    { label: 'Up on time', value: `${s.wake} d`, icon: 'icon-level' },
    { label: 'Run', value: `${s.run} d`, icon: 'icon-xp' },
    { label: 'Sunlight', value: `${s.sun} d`, icon: 'icon-xp' },
    { label: 'Healthy meals', value: `${s.meals} d`, icon: 'dom-health' },
    { label: 'Kaizen', value: `${s.kaizen} d`, icon: 'dom-growth' },
    { label: 'Gym 48h', value: s.gym === 'none' ? '-' : s.gym === 'ok' ? 'covered' : s.gym, icon: 'icon-hp', tone: s.gym },
  ];
  return (
    <div className="dashboard">
      <section className="season panel">
        <Ring value={g.seasonProgress} size={104} stroke={10} title="Season" />
        <div className="season-text">
          <h2>
            Season {info ? `· day ${info.day} of ${info.length}` : ''} <Tip k="season" />
          </h2>
          {info && (
            <p className="hint">
              {niceDate(info.start)} → {niceDate(info.end)} · average of {active.length} season goals
            </p>
          )}
          <div className="tiles">
            {tiles.map((t) => (
              <div key={t.label} className={`tile ${t.tone ? `tone-${t.tone}` : ''}`}>
                <Sprite id={t.icon} scale={1} />
                <b>{t.value}</b>
                <small>{t.label}</small>
              </div>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          New season goal
        </button>
      </section>

      <div className="goal-grid">
        {active.map((goal) => (
          <GoalCard key={goal.id} goal={goal} all={g.goals} onOpen={onOpen} />
        ))}
        {active.length === 0 && <p className="empty panel">No season goals yet. Start with one result you want in the next 90 days.</p>}
      </div>
      {closed.length > 0 && (
        <details className="closed">
          <summary>Done and dropped ({closed.length})</summary>
          <div className="goal-grid">
            {closed.map((goal) => (
              <GoalCard key={goal.id} goal={goal} all={g.goals} onOpen={onOpen} />
            ))}
          </div>
        </details>
      )}
      <WheelOverTime g={g} />
    </div>
  );
}
