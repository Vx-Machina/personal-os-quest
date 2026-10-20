import { useEffect, useState } from 'react';
import { PROTOCOL_DISCLAIMER, daysBetween, type GoalState, type GoalTask, type MealSlot, type ProtocolKey } from '@poq/core';
import { api, type GoalMutation } from '../api';
import { Sprite } from '../components/Sprite';
import { Pomodoro } from './Pomodoro';
import { Bars, Card, Scale, Tip, hhmm, niceDate, shortDay, toMin } from './ui';

export interface GoalActions {
  run: (p: Promise<GoalMutation>) => Promise<boolean>;
  pid: string;
}

function nowHhmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ----------------------------------------------------------------------------- top 3

function TaskCheck({ task, a }: { task: GoalTask; a: GoalActions }) {
  return (
    <button
      className={`check ${task.done ? 'checked' : ''}`}
      role="checkbox"
      aria-checked={task.done}
      aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`}
      onClick={() => a.run(task.done ? api.uncompleteGoalTask(a.pid, task.id) : api.completeGoalTask(a.pid, task.id))}
    >
      {task.done && <Sprite id="icon-check" scale={1} />}
    </button>
  );
}

function TopThree({ g, a }: { g: GoalState; a: GoalActions }) {
  const goalTitle = (id: number) => g.goals.find((x) => x.id === id)?.title ?? '';
  const lead = g.journal.lead.thisWeek;
  const leadTask = lead?.taskId ? g.tasks.find((t) => t.id === lead.taskId) : null;
  return (
    <Card title="Top 3 today" tip="pareto" className="top3">
      {(lead?.text || leadTask) && (
        <p className="lead-line">
          <Sprite id="icon-streak" scale={1} /> Lead domino this week: <b>{leadTask?.title ?? lead?.text}</b> <Tip k="lead" />
        </p>
      )}
      <ul className="task-list">
        {g.top3.map((t) => (
          <li key={t.id} className={`task ${t.done ? 'is-done' : ''}`}>
            <TaskCheck task={t} a={a} />
            <div className="task-body static">
              <span className="task-title">
                {t.leverage && <span className="star" title="80/20: high leverage">★</span>} {t.title}
              </span>
              <span className="task-meta">
                {goalTitle(t.goalId)}
                {t.questId ? <span className="pill">quest #{t.questId}</span> : null}
                {t.easy && <span title="If it were easy">easy way: {t.easy}</span>}
              </span>
            </div>
            <button className="btn btn-ghost btn-small" onClick={() => a.run(api.updateGoalTask(a.pid, t.id, { top3: false }))}>
              Unpin
            </button>
          </li>
        ))}
        {g.top3.length === 0 && <li className="empty">Pick up to three tasks that would make today a win. High-leverage (★) ones first.</li>}
      </ul>
      {g.top3.length < 3 && g.suggestions.length > 0 && (
        <div className="suggest">
          <span className="hint">Suggestions</span>
          {g.suggestions.slice(0, 4).map((t) => (
            <button key={t.id} className="chip" onClick={() => a.run(api.updateGoalTask(a.pid, t.id, { top3: true }))}>
              + {t.leverage ? '★ ' : ''}
              {t.title}
            </button>
          ))}
        </div>
      )}
      {g.tasks.length === 0 && <p className="hint">No tasks yet. Open a goal on the Dashboard and add its Massive Action Plan.</p>}
    </Card>
  );
}

// ----------------------------------------------------------------------------- trackers

function SmokingCard({ g, a }: { g: GoalState; a: GoalActions }) {
  const s = g.trackers.smoking;
  const goal = g.goals.find((x) => x.level === 'season' && x.measure?.tracker === 'smoking');
  const plan = goal?.ifThen[0];
  const [count, setCount] = useState(1);
  const [craving, setCraving] = useState(false);
  const [intensity, setIntensity] = useState<number | null>(3);
  const [trigger, setTrigger] = useState('');
  const logCraving = async (resisted: boolean) => {
    if (await a.run(api.log(a.pid, { kind: 'craving', value: intensity ?? 3, value2: resisted, note: trigger }))) {
      setCraving(false);
      setTrigger('');
    }
  };
  return (
    <Card title="Example: quit a habit" tip="slips" className="tracker smoking" aside={<span className="pill">Health</span>}>
      {s.started ? (
        <div className="big-stat">
          <b>{s.streak}</b>
          <span>
            smoke-free day{s.streak === 1 ? '' : 's'}
            <small>
              best {s.best} · {s.smokeFreeDays} in total since {niceDate(s.quitDay!, { day: 'numeric', month: 'short' })}
            </small>
          </span>
        </div>
      ) : (
        <div className="callout">
          <p>The counter starts on your quit day. Tapering first? Log what you smoke and watch the line head to 0.</p>
          <button className="btn btn-primary btn-small" onClick={() => a.run(api.journal(a.pid, 'settings', 'main', { smoking: { quitDay: g.today } }))}>
            Start smoke-free counter today
          </button>
        </div>
      )}
      {s.slipToday > 0 && <p className="soft-note">Slip today ({s.slipToday}). No HP lost. Reset and keep going: tomorrow is day 1.</p>}

      <div className="badges" aria-label="Milestone badges">
        {s.badges.map((b) => (
          <span key={b.days} className={`badge ${b.earned ? 'earned' : ''}`} title={b.earned ? `Earned: ${b.label}` : `Not yet: ${b.label}`}>
            {b.label}
          </span>
        ))}
      </div>
      {s.next && s.started && <p className="hint">Next badge: {s.next.label} in {s.next.inDays} day(s).</p>}

      <div className="chart-label">Cigarettes per day (14 days)</div>
      <Bars values={s.series.map((x) => x.count)} labels={s.series.map((x) => niceDate(x.day))} zeroOk unit=" cig." />
      <div className="axis">{s.series.map((x) => <span key={x.day}>{shortDay(x.day)}</span>)}</div>

      <p className="money">
        {s.money ? (
          <>
            Saved so far: <b>{s.money.currency}{s.money.saved.toFixed(2)}</b> <small>({s.money.currency}{s.money.perDay.toFixed(2)} a day at 0)</small>
          </>
        ) : (
          <small>Money saved appears once you set {s.moneyMissing.join(', ')} in Toolkit → Settings.</small>
        )}
      </p>

      {plan && (
        <p className="if-then">
          <b>If</b> {plan.if}, <b>then</b> {plan.then}. <Tip k="ifThen" />
        </p>
      )}
      {craving ? (
        <div className="mini-form">
          <Scale label="Craving" value={intensity} onChange={setIntensity} />
          <input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="Trigger (optional): coffee, stress…" maxLength={200} />
          <div className="form-actions">
            <button className="btn btn-primary btn-small" onClick={() => logCraving(true)}>
              Rode it out
            </button>
            <button className="btn btn-small" onClick={() => logCraving(false)}>
              Gave in
            </button>
            <button className="btn btn-ghost btn-small" onClick={() => setCraving(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="form-actions">
          <button className="btn btn-small" onClick={() => setCraving(true)}>
            Log a craving
          </button>
          <span className="spacer" />
          <input className="num" type="number" min={1} max={40} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Cigarettes" />
          <button className="btn btn-ghost btn-small" onClick={() => a.run(api.log(a.pid, { kind: 'smoke', value: count }))}>
            Log cigarettes
          </button>
        </div>
      )}
      <p className="hint">
        Cravings today: {s.cravings.resistedToday}/{s.cravings.today} ridden out · this week {s.cravings.resistedWeek}/{s.cravings.week}
      </p>
    </Card>
  );
}

function WakeCard({ g, a }: { g: GoalState; a: GoalActions }) {
  const w = g.trackers.wake;
  const [time, setTime] = useState(nowHhmm());
  return (
    <Card title={`Up by ${w.target}`} className="tracker" aside={<span className="count">streak {w.streak}</span>}>
      {w.checkedToday ? (
        <p className={`status-line ${w.onTimeToday ? 'good' : 'warn'}`}>
          {w.todayMin === null ? 'Checked on the quest board' : `Up at ${hhmm(w.todayMin)}`} · {w.onTimeToday ? 'on time' : 'late. Reset and go again tomorrow.'}
        </p>
      ) : (
        <div className="form-actions">
          <button className="btn btn-primary btn-small" onClick={() => a.run(api.log(a.pid, { kind: 'wake' }))}>
            I'm up now
          </button>
          <span className="hint">or</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Wake time" />
          <button className="btn btn-small" onClick={() => a.run(api.log(a.pid, { kind: 'wake', value: toMin(time) }))}>
            Log
          </button>
        </div>
      )}
      <div className="dots" aria-label="Last 14 days">
        {w.series.map((d) => (
          <span key={d.day} className={d.onTime === null ? '' : d.onTime ? 'good' : 'warn'} title={`${niceDate(d.day)}: ${d.min !== null ? hhmm(d.min) : d.onTime ? 'checked' : 'no log'}`} />
        ))}
      </div>
      <p className="hint">
        Average this week {w.weekAvg ?? '--:--'} · last week {w.lastWeekAvg ?? '--:--'} · on time {w.onTimeThisWeek}/{w.daysThisWeek} days
      </p>
    </Card>
  );
}

function SunCard({ g, a }: { g: GoalState; a: GoalActions }) {
  const s = g.trackers.sun;
  const [min, setMin] = useState(10);
  return (
    <Card title="Morning sunlight" className="tracker" aside={<span className="count">streak {s.streak}</span>}>
      {s.doneToday ? (
        <p className={`status-line ${s.withinWindow === false ? 'warn' : 'good'}`}>
          {s.todayMinutes} min outside
          {s.afterWakeMin !== null && ` · ${s.afterWakeMin} min after waking${s.withinWindow ? ' (in the window)' : ''}`}
        </p>
      ) : (
        <p className="hint">Ideally within 30-60 minutes of waking.</p>
      )}
      <div className="form-actions">
        <input className="num" type="number" min={1} max={240} value={min} onChange={(e) => setMin(Number(e.target.value))} aria-label="Minutes outside" />
        <span className="hint">min</span>
        <button className="btn btn-small" onClick={() => a.run(api.log(a.pid, { kind: 'sun', value: min }))}>
          Log sunlight
        </button>
      </div>
    </Card>
  );
}

function RunCard({ g, a }: { g: GoalState; a: GoalActions }) {
  const r = g.trackers.run;
  const [min, setMin] = useState('');
  const [km, setKm] = useState('');
  return (
    <Card title="Run" className="tracker" aside={<span className="count">streak {r.streak}</span>}>
      <p className={`status-line ${r.doneToday ? 'good' : ''}`}>
        {r.doneToday ? `Done today${r.todayMinutes ? ` · ${r.todayMinutes} min` : ''}${r.todayKm ? ` · ${r.todayKm} km` : ''}` : 'Not yet today.'}
      </p>
      <div className="form-actions">
        <input className="num" type="number" min={1} placeholder="min" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minutes" />
        <input className="num" type="number" min={0.1} step={0.1} placeholder="km" value={km} onChange={(e) => setKm(e.target.value)} aria-label="Kilometres" />
        <button
          className="btn btn-small"
          onClick={async () => {
            if (await a.run(api.log(a.pid, { kind: 'run', value: min ? Number(min) : null, value2: km ? Number(km) : null }))) {
              setMin('');
              setKm('');
            }
          }}
        >
          Log run
        </button>
      </div>
      <p className="hint">
        This week: {r.thisWeek} run day(s){r.weekMinutes ? ` · ${r.weekMinutes} min` : ''}
        {r.weekKm ? ` · ${r.weekKm} km` : ''}
      </p>
    </Card>
  );
}

function GymCard({ g, a }: { g: GoalState; a: GoalActions }) {
  const s = g.trackers.gym;
  const text =
    s.status === 'none'
      ? 'No session logged yet.'
      : s.status === 'ok'
        ? `Trained ${Math.round(s.hoursSince!)} h ago. You're covered.`
        : s.status === 'due'
          ? `${Math.round(s.hoursSince!)} h since the last session: go today.`
          : `${Math.round(s.hoursSince!)} h without a session: overdue.`;
  return (
    <Card title="Gym · 48h rule" tip="gym48" className={`tracker gym-${s.status}`} aside={<span className="count">{s.thisWeek} this week</span>}>
      <p className={`status-line ${s.status === 'ok' ? 'good' : s.status === 'due' ? 'warn' : s.status === 'overdue' ? 'bad' : ''}`}>{text}</p>
      <div className="form-actions">
        <button className="btn btn-small" onClick={() => a.run(api.log(a.pid, { kind: 'gym' }))}>
          Log a session
        </button>
      </div>
    </Card>
  );
}

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

function MealsCard({ g, a }: { g: GoalState; a: GoalActions }) {
  const m = g.trackers.meals;
  return (
    <Card title="Meals at regular times" className="tracker" aside={<span className="count">streak {m.streak}</span>}>
      <ul className="meals">
        {m.slots.map((s) => (
          <li key={s.slot}>
            <span className="meal-slot">
              {SLOT_LABEL[s.slot]} <small>{s.target}</small>
            </span>
            {s.time !== null ? (
              <span className={`status-line ${s.healthy ? 'good' : 'warn'}`}>
                {hhmm(s.time)} · {s.healthy ? 'healthy' : 'not so healthy'}
                {s.onTime === false ? ' · off schedule' : ''}
              </span>
            ) : (
              <span className="meal-actions">
                <button className="btn btn-small" onClick={() => a.run(api.log(a.pid, { kind: 'meal', tag: s.slot, value2: true }))}>
                  Healthy
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => a.run(api.log(a.pid, { kind: 'meal', tag: s.slot, value2: false }))}>
                  Not quite
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="hint">{m.qualifiesToday ? 'Three healthy meals today.' : `This week: ${m.healthyThisWeek}/${m.loggedThisWeek} logged meals healthy.`}</p>
    </Card>
  );
}

// ----------------------------------------------------------------------------- protocols, check-in, notes

function Protocols({ g, a }: { g: GoalState; a: GoalActions }) {
  const data = g.journal.protocols ?? { checked: [], focusMin: null, exposure: null, granted: [] };
  const save = (patch: Partial<typeof data>) => a.run(api.journal(a.pid, 'protocols', g.today, { ...data, ...patch }));
  const toggle = (k: ProtocolKey) => save({ checked: data.checked.includes(k) ? data.checked.filter((x) => x !== k) : [...data.checked, k] });
  const list = g.protocols.filter((p) => p.enabled);
  return (
    <Card title="Daily protocols" tip="protocols" className="protocols">
      <p className="disclaimer">{PROTOCOL_DISCLAIMER}</p>
      <ul className="protocol-list">
        {list.map((p) => (
          <li key={p.key} className={p.checked ? 'done' : ''}>
            <label className="check-label" title={p.idea}>
              <input type="checkbox" checked={p.checked} disabled={p.via !== null} onChange={() => toggle(p.key)} />
              <span>
                {p.label}
                {p.via && <small> · from your {p.via}</small>}
                <small className="idea">{p.idea}</small>
              </span>
            </label>
            {p.key === 'focus' && (
              <input
                className="num"
                type="number"
                min={1}
                max={90}
                placeholder="min"
                value={data.focusMin ?? ''}
                onChange={(e) => save({ focusMin: e.target.value ? Math.min(90, Number(e.target.value)) : null, checked: e.target.value ? [...new Set([...data.checked, 'focus' as const])] : data.checked })}
                aria-label="Focus minutes (max 90)"
              />
            )}
            {p.key === 'exposure' && (
              <select value={data.exposure ?? ''} onChange={(e) => save({ exposure: (e.target.value || null) as 'cold' | 'heat' | null, checked: e.target.value ? [...new Set([...data.checked, 'exposure' as const])] : data.checked })} aria-label="Exposure type">
                <option value="">-</option>
                <option value="cold">Cold</option>
                <option value="heat">Heat</option>
              </select>
            )}
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="hint">All protocols are switched off (Toolkit → Settings).</p>}
    </Card>
  );
}

function CheckIn({ g, a }: { g: GoalState; a: GoalActions }) {
  const c = g.journal.checkin;
  const [mood, setMood] = useState<number | null>(c?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(c?.energy ?? null);
  useEffect(() => {
    setMood(c?.mood ?? null);
    setEnergy(c?.energy ?? null);
  }, [c?.mood, c?.energy]);
  const save = (m: number | null, e: number | null) => {
    if (m && e) void a.run(api.journal(a.pid, 'checkin', g.today, { mood: m, energy: e, note: c?.note ?? '' }));
  };
  return (
    <Card title="Check-in" tip="checkin" className="checkin">
      <Scale
        label="Mood"
        value={mood}
        onChange={(v) => {
          setMood(v);
          save(v, energy);
        }}
      />
      <Scale
        label="Energy"
        value={energy}
        onChange={(v) => {
          setEnergy(v);
          save(mood, v);
        }}
      />
      <div className="spark-row">
        {g.mood.map((d) => (
          <span key={d.day} title={`${niceDate(d.day)}: mood ${d.mood ?? '-'}, energy ${d.energy ?? '-'}`}>
            <i className="m" style={{ height: `${(d.mood ?? 0) * 6}px` }} />
            <i className="e" style={{ height: `${(d.energy ?? 0) * 6}px` }} />
          </span>
        ))}
      </div>
      <p className="hint">
        <i className="key m" /> mood <i className="key e" /> energy, last 14 days
      </p>
    </Card>
  );
}

function Note({ g, a, kind, title, tip, placeholder }: { g: GoalState; a: GoalActions; kind: 'gratitude' | 'kaizen'; title: string; tip: 'ichigo' | 'kaizen'; placeholder: string }) {
  const current = g.journal[kind]?.text ?? '';
  const [text, setText] = useState(current);
  useEffect(() => setText(current), [current]);
  const streak = kind === 'kaizen' ? g.streaks.kaizen : g.streaks.gratitude;
  return (
    <Card title={title} tip={tip} aside={<span className="count">streak {streak}</span>}>
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void a.run(api.journal(a.pid, kind, g.today, { text }));
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={500} aria-label={title} />
        <button className="btn btn-small" disabled={!text.trim() || text === current}>
          {current ? 'Update' : 'Save'}
        </button>
      </form>
    </Card>
  );
}

function RecentLogs({ g, a }: { g: GoalState; a: GoalActions }) {
  if (!g.recentLogs.length) return null;
  const describe = (l: GoalState['recentLogs'][number]) => {
    switch (l.kind) {
      case 'smoke':
        return `${l.value} cigarette(s)`;
      case 'craving':
        return `Craving ${l.value}/5, ${l.value2 ? 'ridden out' : 'gave in'}${l.note ? ` (${l.note})` : ''}`;
      case 'wake':
        return l.value === null ? 'Wake check' : `Up at ${hhmm(l.value)}`;
      case 'meal':
        return l.tag === 'quest' ? 'Meals checked' : `${l.tag} ${l.value2 ? 'healthy' : 'not so healthy'}`;
      case 'run':
        return `Run${l.value ? ` ${l.value} min` : ''}${l.value2 ? ` ${l.value2} km` : ''}`;
      case 'sun':
        return `Sunlight ${l.value ?? ''} min`;
      case 'gym':
        return 'Gym session';
      case 'pomodoro':
        return `Pomodoro ${l.value} min`;
    }
  };
  return (
    <Card title="Recent entries" className="recent">
      <ul className="log-mini">
        {g.recentLogs.slice(0, 12).map((l) => (
          <li key={l.id}>
            <span>{describe(l)}</span>
            <small>{daysBetween(l.dayKey, g.today) === 0 ? 'today' : niceDate(l.dayKey)}</small>
            <button className="btn btn-ghost btn-icon small" aria-label="Remove entry" onClick={() => a.run(api.deleteLog(a.pid, l.id))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Today({ g, a, seasonDay }: { g: GoalState; a: GoalActions; seasonDay: string | null }) {
  return (
    <div className="today">
      <div className="today-head">
        <h2>{niceDate(g.today, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        {seasonDay && <span className="pill">{seasonDay}</span>}
      </div>
      <div className="today-grid">
        <div className="today-col">
          <TopThree g={g} a={a} />
          <Pomodoro goals={g} onDone={(goalId, taskId, minutes) => a.run(api.log(a.pid, { kind: 'pomodoro', value: minutes, goalId, taskId }))} />
          <CheckIn g={g} a={a} />
          <Note g={g} a={a} kind="gratitude" title="Ichigo ichie" tip="ichigo" placeholder="One moment today you were fully present for…" />
          <Note g={g} a={a} kind="kaizen" title="Kaizen 1%" tip="kaizen" placeholder="One small thing to do 1% better…" />
        </div>
        <div className="today-col">
          <SmokingCard g={g} a={a} />
          <div className="tracker-grid">
            <WakeCard g={g} a={a} />
            <SunCard g={g} a={a} />
            <RunCard g={g} a={a} />
            <GymCard g={g} a={a} />
          </div>
          <MealsCard g={g} a={a} />
          <Protocols g={g} a={a} />
          <RecentLogs g={g} a={a} />
        </div>
      </div>
      <p className="hint center">Everything you log here also feeds your hero on the quest board: XP, gold and the nine-domain wheel.</p>
    </div>
  );
}
