import { useEffect, useState } from 'react';
import { DOMAINS, DOMAIN_INFO, addDays, type Domain, type GoalState, type HanseiData, type ParetoData, type WeekSummary } from '@poq/core';
import { api } from '../api';
import { Radar } from '../components/Wheel';
import type { GoalActions } from './Today';
import { Card, Tip, niceDate } from './ui';

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="stat-tile">
      <b>{value ?? '-'}</b>
      <small>{label}</small>
    </div>
  );
}

function Summary({ w }: { w: WeekSummary }) {
  return (
    <div className="stat-grid">
      <Stat label="XP earned" value={w.xp} />
      <Stat label="Quests done" value={w.questsDone} />
      <Stat label="Up on time" value={`${w.wakeOnTime}/${w.days}`} />
      <Stat label="Avg wake" value={w.wakeAvg} />
      <Stat label="Run days" value={w.runDays} />
      <Stat label="Gym sessions" value={w.gymSessions} />
      <Stat label="Sunlight days" value={w.sunDays} />
      <Stat label="Smoke-free days" value={w.smokeFreeDays === null ? 'not started' : `${w.smokeFreeDays}/${w.days}`} />
      <Stat label="Cravings ridden out" value={`${w.cravingsResisted}/${w.cravings}`} />
      <Stat label="Pomodoros" value={w.pomodoros} />
      <Stat label="Healthy-meal days" value={w.mealDays} />
      <Stat label="Mood · energy" value={w.moodAvg === null ? null : `${w.moodAvg} · ${w.energyAvg}`} />
      <Stat label="Kaizen notes" value={w.kaizenNotes} />
      <Stat label="Protocol checks" value={w.protocolChecks} />
    </div>
  );
}

function Form<T extends object>({ fields, value, onSave, saved }: { fields: { key: keyof T; label: string; placeholder: string }[]; value: T | null; onSave: (v: T) => void; saved: boolean }) {
  const empty = Object.fromEntries(fields.map((f) => [f.key, ''])) as T;
  const [v, setV] = useState<T>(value ?? empty);
  useEffect(() => setV(value ?? empty), [JSON.stringify(value)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      {fields.map((f) => (
        <label key={String(f.key)}>
          {f.label}
          <textarea rows={2} value={String(v[f.key] ?? '')} placeholder={f.placeholder} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} maxLength={2000} />
        </label>
      ))}
      <div className="form-actions">
        <span className="spacer" />
        <button className="btn btn-primary btn-small">{saved ? 'Update' : 'Save'}</button>
      </div>
    </form>
  );
}

function YearReview({ g, a }: { g: GoalState; a: GoalActions }) {
  const current = g.journal.yearReview.find((y) => y.year === g.year)?.data;
  const previous = g.journal.yearReview.filter((y) => y.year < g.year).at(-1);
  const [ratings, setRatings] = useState<Partial<Record<Domain, number>>>(current?.ratings ?? {});
  const [notes, setNotes] = useState<Partial<Record<Domain, string>>>(current?.notes ?? {});
  const values = Object.fromEntries(DOMAINS.map((d) => [d, ratings[d] ?? 0])) as Record<Domain, number>;
  return (
    <Card title={`Wheel of life review ${g.year}`} tip="wheelReview" className="year-review">
      <p className="hint">Rate each area 1-10 as it is today. Once a year is enough; update it whenever life shifts.{previous ? ` Last review: ${previous.year}.` : ''}</p>
      <div className="year-grid">
        <Radar values={values} label="Self-rating" max={10} />
        <div className="ratings">
          {DOMAINS.map((d) => (
            <div key={d} className={`rating-row ${ratings[d] === undefined ? 'unset' : ''}`}>
              <span className="rating-label">{DOMAIN_INFO[d].label}</span>
              <input type="range" min={1} max={10} value={ratings[d] ?? 5} onChange={(e) => setRatings({ ...ratings, [d]: Number(e.target.value) })} aria-label={`${DOMAIN_INFO[d].label} rating`} />
              <b className="rating-value">{ratings[d] ?? '-'}</b>
              {previous?.data.ratings[d] !== undefined && <small className="rating-prev">was {previous.data.ratings[d]}</small>}
              <input className="rating-note" value={notes[d] ?? ''} onChange={(e) => setNotes({ ...notes, [d]: e.target.value })} placeholder="note" maxLength={500} />
            </div>
          ))}
        </div>
      </div>
      <div className="form-actions">
        <span className="spacer" />
        <button className="btn btn-primary btn-small" onClick={() => a.run(api.journal(a.pid, 'yearReview', g.year, { ratings, notes }))}>
          {current ? 'Update review' : 'Save review'}
        </button>
      </div>
    </Card>
  );
}

export function Review({ g, a }: { g: GoalState; a: GoalActions }) {
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const week = which === 'this' ? g.week : addDays(g.week, -7);
  const summary = which === 'this' ? g.thisWeek : g.lastWeek;
  const hansei = which === 'this' ? g.journal.hansei.thisWeek : g.journal.hansei.lastWeek;
  const pareto = which === 'this' ? g.journal.pareto.thisWeek : g.journal.pareto.lastWeek;
  const nextLead = g.journal.lead.nextWeek;
  const [leadTask, setLeadTask] = useState<string>(nextLead?.taskId ? String(nextLead.taskId) : '');
  const [leadText, setLeadText] = useState(nextLead?.text ?? '');
  const weekTargets = g.goals.filter((x) => x.level === 'week' && x.startDay >= week && x.startDay <= addDays(week, 6));
  const nextWeek = addDays(g.week, 7);
  const planned = g.goals.some((x) => x.level === 'week' && x.startDay === nextWeek);

  return (
    <div className="review">
      <div className="today-head">
        <h2>Weekly review · week of {niceDate(week, { day: 'numeric', month: 'short' })}</h2>
        <div className="segmented small">
          <button className={which === 'this' ? 'active' : ''} onClick={() => setWhich('this')}>
            This week
          </button>
          <button className={which === 'last' ? 'active' : ''} onClick={() => setWhich('last')}>
            Last week
          </button>
        </div>
      </div>
      <Card title="The week in numbers">
        <Summary w={summary} />
        {weekTargets.length > 0 && (
          <ul className="children">
            {weekTargets.map((t) => (
              <li key={t.id}>
                <span className="child-title static">
                  <span className="level">Week</span> {t.title}
                </span>
                <div className="mini-bar" aria-hidden>
                  <div style={{ width: `${Math.round(t.progress * 100)}%` }} />
                </div>
                <span className="mini-pct">{Math.round(t.progress * 100)}%</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="review-grid">
        <Card title="Hansei" tip="hansei">
          <Form<HanseiData>
            key={`h-${week}`}
            value={hansei}
            saved={Boolean(hansei)}
            onSave={(v) => a.run(api.journal(a.pid, 'hansei', week, v))}
            fields={[
              { key: 'wentWell', label: 'What went well?', placeholder: 'Wins, even small ones' },
              { key: 'didnt', label: "What didn't?", placeholder: 'Honestly, without blame' },
              { key: 'change', label: 'What will I change next week?', placeholder: 'One concrete adjustment' },
            ]}
          />
        </Card>
        <Card title="80/20 review" tip="pareto">
          <Form<ParetoData>
            key={`p-${week}`}
            value={pareto}
            saved={Boolean(pareto)}
            onSave={(v) => a.run(api.journal(a.pid, 'pareto', week, v))}
            fields={[
              { key: 'top20', label: 'Which 20% of activities gave 80% of the results?', placeholder: 'Do more of these' },
              { key: 'drains', label: 'Which 20% caused 80% of the stress or wasted time?', placeholder: 'People, tasks, habits' },
              { key: 'eliminate', label: 'What will I eliminate, automate or delegate?', placeholder: 'One thing to cut' },
            ]}
          />
        </Card>
      </div>
      <Card title={`Lead domino for next week (${niceDate(nextWeek, { day: 'numeric', month: 'short' })})`} tip="lead">
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(api.journal(a.pid, 'lead', nextWeek, { taskId: leadTask ? Number(leadTask) : null, text: leadText }));
          }}
        >
          <div className="form-row">
            <label>
              A task from your goals
              <select value={leadTask} onChange={(e) => setLeadTask(e.target.value)}>
                <option value="">None</option>
                {g.tasks
                  .filter((t) => !t.done)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.leverage ? '★ ' : ''}
                      {t.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Or in your words
              <input value={leadText} onChange={(e) => setLeadText(e.target.value)} placeholder="The one thing that makes the rest easier" maxLength={300} />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-small" disabled={planned} onClick={() => a.run(api.planNextWeek(a.pid))}>
              {planned ? 'Next week planned ✓' : 'Create next week’s targets'}
            </button>
            <span className="spacer" />
            <button className="btn btn-primary btn-small" disabled={!leadTask && !leadText.trim()}>
              {nextLead ? 'Update lead domino' : 'Set lead domino'}
            </button>
          </div>
        </form>
        {g.journal.lead.thisWeek && (
          <p className="hint">
            This week's: {g.journal.lead.thisWeek.taskId ? (g.tasks.find((t) => t.id === g.journal.lead.thisWeek!.taskId)?.title ?? 'task') : g.journal.lead.thisWeek.text}
          </p>
        )}
      </Card>
      <YearReview g={g} a={a} />
      <p className="hint center">
        Tip: do the review on Sunday evening. <Tip k="kaizen" />
      </p>
    </div>
  );
}
