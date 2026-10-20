import { useState } from 'react';
import { DOMAINS, DOMAIN_INFO, type Domain } from '@poq/core';
import type { GameState } from '../api';
import { Sprite } from './Sprite';

const SIZE = 360;
const C = SIZE / 2;
const R = 118;

function niceMax(v: number): number {
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 1000) * 1000;
}

function point(i: number, r: number): [number, number] {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / DOMAINS.length;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

/** Single-series radar: one polygon, identity carried by icon + label at each axis. */
export function Radar({ values, label, max: fixedMax }: { values: Record<Domain, number>; label: string; max?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = fixedMax ?? niceMax(Math.max(5, ...DOMAINS.map((d) => values[d])));
  const pts = DOMAINS.map((d, i) => point(i, (values[d] / max) * R));
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="radar" style={{ maxWidth: SIZE }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${label} life-domain wheel`}>
        {rings.map((r) => (
          <polygon
            key={r}
            className="radar-ring"
            points={DOMAINS.map((_, i) => point(i, R * r).join(',')).join(' ')}
          />
        ))}
        {DOMAINS.map((_, i) => {
          const [x, y] = point(i, R);
          return <line key={i} className="radar-axis" x1={C} y1={C} x2={x} y2={y} />;
        })}
        <polygon className="radar-area" points={pts.map((p) => p.join(',')).join(' ')} />
        {pts.map(([x, y], i) => (
          <g key={DOMAINS[i]} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
            <circle cx={x} cy={y} r={14} className="radar-hit" />
            <circle cx={x} cy={y} r={hover === i ? 6 : 4.5} className="radar-dot" />
          </g>
        ))}
      </svg>
      {DOMAINS.map((d, i) => {
        const [x, y] = point(i, R + 34);
        return (
          <div key={d} className={`radar-label ${hover === i ? 'hover' : ''}`} style={{ left: `${(x / SIZE) * 100}%`, top: `${(y / SIZE) * 100}%` }}>
            <Sprite id={DOMAIN_INFO[d].icon} scale={2} />
            <span>{DOMAIN_INFO[d].short}</span>
          </div>
        );
      })}
      {hover !== null && (
        <div className="tooltip" style={{ left: `${(pts[hover][0] / SIZE) * 100}%`, top: `${(pts[hover][1] / SIZE) * 100}%` }}>
          <b>{DOMAIN_INFO[DOMAINS[hover]].label}</b>
          <span>
            {fixedMax ? `${values[DOMAINS[hover]] || '-'} / ${fixedMax}` : `${values[DOMAINS[hover]]} pts ${label === 'Last 7 days' ? 'this week' : 'all time'}`}
          </span>
        </div>
      )}
    </div>
  );
}

export function Wheel({ state }: { state: GameState }) {
  const [mode, setMode] = useState<'week' | 'all'>('week');
  const values = mode === 'week' ? state.stats7d : state.player.stats;
  const max = Math.max(1, ...DOMAINS.map((d) => values[d]));
  const total = DOMAINS.reduce((s, d) => s + values[d], 0);
  const weakest = [...DOMAINS].sort((a, b) => values[a] - values[b]).slice(0, 3);

  return (
    <div className="wheel">
      <section className="panel wheel-chart">
        <div className="column-head">
          <h2>Wheel of life</h2>
          <div className="segmented small" role="tablist">
            <button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')} role="tab" aria-selected={mode === 'week'}>
              7 days
            </button>
            <button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')} role="tab" aria-selected={mode === 'all'}>
              All time
            </button>
          </div>
        </div>
        <Radar values={values} label={mode === 'week' ? 'Last 7 days' : 'All time'} />
        <p className="hint center">Outer ring = {niceMax(Math.max(5, ...DOMAINS.map((d) => values[d])))} pts. Hover a point for its value.</p>
        <p className="hint center">
          {total === 0
            ? 'Complete quests to grow your wheel. Each task raises the stat of its domain.'
            : `Needs attention: ${weakest.map((d) => DOMAIN_INFO[d].label).join(', ')}. Add a habit or to-do there.`}
        </p>
      </section>

      <section className="panel wheel-table">
        <h2>Life stats</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Domain</th>
              <th scope="col" className="num">
                7 days
              </th>
              <th scope="col" className="num">
                All time
              </th>
            </tr>
          </thead>
          <tbody>
            {DOMAINS.map((d) => (
              <tr key={d}>
                <th scope="row">
                  <Sprite id={DOMAIN_INFO[d].icon} scale={1} /> {DOMAIN_INFO[d].label}
                  <div className="stat-bar" aria-hidden>
                    <div style={{ width: `${(values[d] / max) * 100}%` }} />
                  </div>
                </th>
                <td className="num">{state.stats7d[d]}</td>
                <td className="num">{state.player.stats[d]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
