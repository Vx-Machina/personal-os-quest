import { useState } from 'react';
import { PROTOCOLS, PROTOCOL_DISCLAIMER, type FearData, type GoalSettings, type GoalState, type IdentityData, type IkigaiData, type ProtocolKey } from '@poq/core';
import { api } from '../api';
import type { GoalActions } from './Today';
import { Card, Tip, linesOf, niceDate } from './ui';

function IdentityCard({ g, a }: { g: GoalState; a: GoalActions }) {
  const cur = g.journal.identity;
  const [statement, setStatement] = useState(cur?.statement ?? '');
  const [stacks, setStacks] = useState<IdentityData['stacks']>(cur?.stacks.length ? cur.stacks : [{ after: '', will: '' }]);
  return (
    <Card title="Identity and habit stacks" tip="identity">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(api.journal(a.pid, 'identity', 'main', { statement, stacks }));
        }}
      >
        <label>
          I am someone who…
          <textarea rows={2} value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={500} placeholder="Write it in the present tense." />
        </label>
        <h3>
          Habit stacks <Tip k="stacking" />
        </h3>
        {stacks.map((s, i) => (
          <div key={i} className="if-then-row">
            <span>After I</span>
            <input value={s.after} onChange={(e) => setStacks(stacks.map((x, j) => (j === i ? { ...x, after: e.target.value } : x)))} placeholder="current habit" maxLength={200} />
            <span>I will</span>
            <input value={s.will} onChange={(e) => setStacks(stacks.map((x, j) => (j === i ? { ...x, will: e.target.value } : x)))} placeholder="new habit" maxLength={200} />
            <button type="button" className="btn btn-ghost btn-icon small" aria-label="Remove" onClick={() => setStacks(stacks.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setStacks([...stacks, { after: '', will: '' }])}>
            + Stack
          </button>
          <span className="spacer" />
          <button className="btn btn-primary btn-small">Save</button>
        </div>
      </form>
    </Card>
  );
}

const CIRCLES: { key: keyof Omit<IkigaiData, 'statement'>; label: string; short: string; cx: number; cy: number; cls: string }[] = [
  { key: 'love', label: 'What I love', short: 'love', cx: 150, cy: 95, cls: 'c1' },
  { key: 'good', label: 'What I’m good at', short: 'good at', cx: 95, cy: 150, cls: 'c2' },
  { key: 'needs', label: 'What the world needs', short: 'needed', cx: 205, cy: 150, cls: 'c3' },
  { key: 'paid', label: 'What I can be paid for', short: 'paid for', cx: 150, cy: 205, cls: 'c4' },
];

function IkigaiCard({ g, a }: { g: GoalState; a: GoalActions }) {
  const cur = g.journal.ikigai;
  const [text, setText] = useState<Record<string, string>>(Object.fromEntries(CIRCLES.map((c) => [c.key, (cur?.[c.key] ?? []).join('\n')])));
  const [statement, setStatement] = useState(cur?.statement ?? '');
  return (
    <Card title="Ikigai map" tip="ikigai" className="ikigai">
      <div className="ikigai-grid">
        <svg viewBox="0 0 300 300" className="venn" role="img" aria-label="Ikigai: four overlapping circles">
          {CIRCLES.map((c) => (
            <circle key={c.key} cx={c.cx} cy={c.cy} r={78} className={`venn-c ${c.cls}`} />
          ))}
          {CIRCLES.map((c) => (
            <text key={`t-${c.key}`} x={c.cx + (c.cx - 150) * 0.55} y={c.cy + (c.cy - 150) * 0.55} textAnchor="middle" className="venn-label">
              {c.short}
              <tspan x={c.cx + (c.cx - 150) * 0.55} dy="14" className="venn-count">
                {linesOf(text[c.key]).length} item(s)
              </tspan>
            </text>
          ))}
          <text x="150" y="154" textAnchor="middle" className="venn-center">
            ikigai
          </text>
        </svg>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void a.run(api.journal(a.pid, 'ikigai', 'main', { ...Object.fromEntries(CIRCLES.map((c) => [c.key, linesOf(text[c.key])])), statement }));
          }}
        >
          <div className="form-row">
            {CIRCLES.map((c) => (
              <label key={c.key}>
                {c.label} <small>(one per line)</small>
                <textarea rows={3} value={text[c.key]} onChange={(e) => setText({ ...text, [c.key]: e.target.value })} />
              </label>
            ))}
          </div>
          <label>
            Where they overlap, my ikigai is…
            <input value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={500} />
          </label>
          <div className="form-actions">
            <span className="spacer" />
            <button className="btn btn-primary btn-small">Save</button>
          </div>
        </form>
      </div>
    </Card>
  );
}

const EMPTY_FEAR: FearData = { title: '', define: [], prevent: [], repair: [], benefits: '', inaction: '' };

function FearCard({ g, a }: { g: GoalState; a: GoalActions }) {
  const [editing, setEditing] = useState<{ id: string; data: FearData } | null>(null);
  const [lines, setLines] = useState({ define: '', prevent: '', repair: '' });
  const open = (id: string, data: FearData) => {
    setEditing({ id, data });
    setLines({ define: data.define.join('\n'), prevent: data.prevent.join('\n'), repair: data.repair.join('\n') });
  };
  return (
    <Card title="Fear-setting" tip="fear" className="fear">
      <ul className="fear-list">
        {g.journal.fears.map((f) => (
          <li key={f.id}>
            <button className="link" onClick={() => open(f.id, f.data)}>
              {f.data.title}
            </button>
            <small>{niceDate(f.updatedAt.slice(0, 10))}</small>
            <button className="btn btn-ghost btn-icon small" aria-label={`Delete ${f.data.title}`} onClick={() => a.run(api.deleteJournal(a.pid, 'fear', f.id))}>
              ✕
            </button>
          </li>
        ))}
        {g.journal.fears.length === 0 && !editing && <li className="empty">Facing a decision you keep putting off? Write the fears down.</li>}
      </ul>
      {editing ? (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = { ...editing.data, define: linesOf(lines.define), prevent: linesOf(lines.prevent), repair: linesOf(lines.repair) };
            if (await a.run(api.journal(a.pid, 'fear', editing.id, data))) setEditing(null);
          }}
        >
          <label>
            What am I considering?
            <input value={editing.data.title} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, title: e.target.value } })} required maxLength={200} />
          </label>
          <div className="form-row three">
            <label>
              Define: worst things that could happen
              <textarea rows={4} value={lines.define} onChange={(e) => setLines({ ...lines, define: e.target.value })} placeholder="one per line" />
            </label>
            <label>
              Prevent: how to make each less likely
              <textarea rows={4} value={lines.prevent} onChange={(e) => setLines({ ...lines, prevent: e.target.value })} placeholder="one per line" />
            </label>
            <label>
              Repair: how to recover if it happens
              <textarea rows={4} value={lines.repair} onChange={(e) => setLines({ ...lines, repair: e.target.value })} placeholder="one per line" />
            </label>
          </div>
          <label>
            Benefits of trying, even partly succeeding
            <textarea rows={2} value={editing.data.benefits} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, benefits: e.target.value } })} />
          </label>
          <label>
            Cost of inaction in 6 months, 1 year, 3 years
            <textarea rows={2} value={editing.data.inaction} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, inaction: e.target.value } })} />
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <span className="spacer" />
            <button className="btn btn-primary btn-small">Save worksheet</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-small" onClick={() => open(`fear-${Date.now().toString(36)}`, EMPTY_FEAR)}>
          + New worksheet
        </button>
      )}
    </Card>
  );
}

function SettingsCard({ g, a }: { g: GoalState; a: GoalActions }) {
  const [s, setS] = useState<GoalSettings>(g.settings);
  const num = (v: string) => (v === '' ? null : Number(v));
  const set = <K extends keyof GoalSettings>(k: K, v: GoalSettings[K]) => setS({ ...s, [k]: v });
  return (
    <Card title="Goal settings" className="goal-settings">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void a.run(api.journal(a.pid, 'settings', 'main', s));
        }}
      >
        <div className="form-row three">
          <label>
            Wake target
            <input type="time" value={s.wakeTarget} onChange={(e) => set('wakeTarget', e.target.value)} />
          </label>
          <label>
            Grace (min)
            <input type="number" min={0} max={120} value={s.wakeGraceMin} onChange={(e) => set('wakeGraceMin', Number(e.target.value))} />
          </label>
          <label>
            Bedtime (sleep window)
            <input type="time" value={s.bedtime} onChange={(e) => set('bedtime', e.target.value)} />
          </label>
          <label>
            Pomodoro focus (min)
            <input type="number" min={5} max={90} value={s.pomodoroWorkMin} onChange={(e) => set('pomodoroWorkMin', Number(e.target.value))} />
          </label>
          <label>
            Break (min)
            <input type="number" min={1} max={60} value={s.pomodoroBreakMin} onChange={(e) => set('pomodoroBreakMin', Number(e.target.value))} />
          </label>
          <label>
            Pomodoros per day
            <input type="number" min={1} max={20} value={s.pomodoroDailyTarget} onChange={(e) => set('pomodoroDailyTarget', Number(e.target.value))} />
          </label>
          <label>
            Breakfast
            <input type="time" value={s.meals.breakfast} onChange={(e) => set('meals', { ...s.meals, breakfast: e.target.value })} />
          </label>
          <label>
            Lunch
            <input type="time" value={s.meals.lunch} onChange={(e) => set('meals', { ...s.meals, lunch: e.target.value })} />
          </label>
          <label>
            Dinner
            <input type="time" value={s.meals.dinner} onChange={(e) => set('meals', { ...s.meals, dinner: e.target.value })} />
          </label>
        </div>

        <h3>Example: quit a habit</h3>
        <div className="form-row three">
          <label>
            Quit day
            <input type="date" value={s.smoking.quitDay ?? ''} onChange={(e) => set('smoking', { ...s.smoking, quitDay: e.target.value || null })} />
          </label>
          <label>
            Cigarettes/day before
            <input type="number" min={0} value={s.smoking.baselinePerDay ?? ''} placeholder="unknown" onChange={(e) => set('smoking', { ...s.smoking, baselinePerDay: num(e.target.value) })} />
          </label>
          <label>
            Price per pack
            <input type="number" min={0} step={0.01} value={s.smoking.packPrice ?? ''} placeholder="unknown" onChange={(e) => set('smoking', { ...s.smoking, packPrice: num(e.target.value) })} />
          </label>
          <label>
            Cigarettes per pack
            <input type="number" min={1} value={s.smoking.packSize ?? ''} placeholder="unknown" onChange={(e) => set('smoking', { ...s.smoking, packSize: num(e.target.value) })} />
          </label>
          <label>
            Currency
            <input value={s.smoking.currency} maxLength={4} onChange={(e) => set('smoking', { ...s.smoking, currency: e.target.value })} />
          </label>
        </div>
        <p className="hint">Money saved stays hidden until baseline, price and pack size are set. Nothing is assumed.</p>

        <h3>
          Daily protocols <Tip k="protocols" />
        </h3>
        <p className="disclaimer">{PROTOCOL_DISCLAIMER}</p>
        <div className="protocol-toggles">
          {PROTOCOLS.map((p) => (
            <label key={p.key} className="check-label" title={p.idea}>
              <input type="checkbox" checked={s.protocols[p.key]} onChange={(e) => set('protocols', { ...s.protocols, [p.key as ProtocolKey]: e.target.checked })} />
              {p.label}
            </label>
          ))}
        </div>
        <div className="form-actions">
          <span className="spacer" />
          <button className="btn btn-primary">Save settings</button>
        </div>
      </form>
    </Card>
  );
}

export function Toolkit({ g, a }: { g: GoalState; a: GoalActions }) {
  return (
    <div className="toolkit">
      <div className="review-grid">
        <IdentityCard g={g} a={a} />
        <FearCard g={g} a={a} />
      </div>
      <IkigaiCard g={g} a={a} />
      <SettingsCard g={g} a={a} />
    </div>
  );
}
