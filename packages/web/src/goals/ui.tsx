import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { FRAMEWORKS, minToHhmm, type FrameworkKey } from '@poq/core';

/** Small "?" that explains a framework in one line (hover, focus or tap). */
export function Tip({ k }: { k: FrameworkKey }) {
  const f = FRAMEWORKS[k];
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(300, window.innerWidth - 24);
    setPos({ left: Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12)), top: r.bottom + 8 });
  };
  useEffect(() => {
    if (!pos) return;
    const hide = () => setPos(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [pos]);
  return (
    <span className="tip">
      <button
        ref={btn}
        type="button"
        className="tip-btn"
        aria-label={`About ${f.name}`}
        aria-describedby={pos ? id : undefined}
        aria-expanded={Boolean(pos)}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        onFocus={show}
        onBlur={() => setPos(null)}
        onClick={() => (pos ? setPos(null) : show())}
      >
        ?
      </button>
      {pos && (
        <span role="tooltip" id={id} className="tip-pop" style={{ left: pos.left, top: pos.top }}>
          <b>{f.name}.</b> {f.idea} <i>{f.source}</i>
        </span>
      )}
    </span>
  );
}

export function paceInfo(pace: number | null): { cls: string; label: string } {
  if (pace === null) return { cls: 'pace-none', label: 'not started' };
  if (pace >= 0.9) return { cls: 'pace-good', label: 'on pace' };
  if (pace >= 0.6) return { cls: 'pace-mid', label: 'a bit behind' };
  return { cls: 'pace-low', label: 'behind' };
}

/** Progress ring. Colour shows pace (on pace / a bit behind / behind); the label says it too. */
export function Ring({ value, pace = null, size = 72, stroke = 8, title }: { value: number; pace?: number | null; size?: number; stroke?: number; title?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <svg className={`ring ${paceInfo(pace).cls}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title ?? 'Progress'}: ${pct}%`}>
      <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
      <circle
        className="ring-fg"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        strokeLinecap="round"
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="ring-text" style={{ fontSize: size * 0.24 }}>
        {pct}%
      </text>
    </svg>
  );
}

/** Tiny bar chart for daily series (cigarettes, pomodoros…). null = no data that day. */
export function Bars({ values, labels, height = 56, max, unit = '', zeroOk = false }: { values: (number | null)[]; labels: string[]; height?: number; max?: number; unit?: string; zeroOk?: boolean }) {
  const top = Math.max(1, max ?? Math.max(0, ...values.map((v) => v ?? 0)));
  return (
    <div className="bars" style={{ height }} role="img" aria-label={values.map((v, i) => `${labels[i]}: ${v ?? 'no data'}${unit}`).join(', ')}>
      {values.map((v, i) => (
        <div key={i} className="bars-col" title={`${labels[i]}: ${v ?? 'no data'}${v !== null ? unit : ''}`}>
          <div className={`bars-bar ${v === 0 ? (zeroOk ? 'zero-ok' : 'zero') : ''} ${v === null ? 'none' : ''}`} style={{ height: v === null ? 2 : v === 0 ? 3 : `${Math.max(6, (v / top) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function Scale({ value, onChange, label, max = 5 }: { value: number | null; onChange: (v: number) => void; label: string; max?: number }) {
  return (
    <div className="scale" role="radiogroup" aria-label={label}>
      <span className="scale-label">{label}</span>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} className={value === n ? 'active' : ''} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, tip, children, className = '', aside }: { title: string; tip?: FrameworkKey; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`card panel ${className}`}>
      <div className="card-head">
        <h3>
          {title} {tip && <Tip k={tip} />}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export const hhmm = (min: number | null | undefined) => (min === null || min === undefined ? '--:--' : minToHhmm(min));

export function toMin(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' });
}

export function niceDate(day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

/** Lines textarea <-> string[] */
export const linesOf = (v: string) =>
  v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
