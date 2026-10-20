import { formatCountdown, RULES } from '@poq/core';
import type { PlayerView } from '@poq/core';
import { Avatar, Sprite } from './Sprite';
import { useMedia, useNow } from '../hooks';

function Bar({ kind, value, max, label }: { kind: 'hp' | 'xp'; value: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`bar bar-${kind}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <Sprite id={kind === 'hp' ? 'icon-hp' : 'icon-xp'} scale={2} />
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
        <span className="bar-text">
          {label} {Math.round(value)} / {max}
        </span>
      </div>
    </div>
  );
}

export function Hud({ player, onSettings }: { player: PlayerView; onSettings: () => void }) {
  const now = useNow(30_000);
  const wide = useMedia('(min-width: 760px)');
  const msLeft = new Date(player.nextResetAt).getTime() - now.getTime();
  const lowHp = player.hp <= RULES.maxHp * 0.3;

  return (
    <header className="hud panel">
      <div className="hud-stage">
        <Avatar equipped={player.equipped} scale={wide ? 6 : 5} />
      </div>
      <div className="hud-main">
        <div className="hud-title">
          <div>
            <h1 className="hud-name">{player.name}</h1>
            <div className="hud-sub">
              <Sprite id="icon-level" scale={1} /> Level {player.level} · {player.title}
              {player.settings.resting && <span className="pill pill-rest">Resting</span>}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onSettings} aria-label="Settings" title="Settings">
            <svg width="20" height="20" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden>
              <path fill="currentColor" fillRule="evenodd" d="M3 0h2v1h1v1h1v1h1v2H7v1H6v1H5v1H3V7H2V6H1V5H0V3h1V2h1V1h1zM3 3v2h2V3z" />
            </svg>
          </button>
        </div>
        <Bar kind="hp" value={player.hp} max={player.maxHp} label="HP" />
        <Bar kind="xp" value={player.xpIntoLevel} max={player.xpToNext} label="XP" />
        <div className="hud-stats">
          <span className="stat" title="Gold">
            <Sprite id="icon-gold" scale={2} />
            <b>{player.gold}</b>
          </span>
          <span className="stat" title={`Day streak (best ${player.bestDayStreak})`}>
            <Sprite id="icon-streak" scale={2} />
            <b>{player.dayStreak}</b>
            <small>day streak</small>
          </span>
          <span className="stat stat-reset" title={`Day resets at ${player.settings.resetTime} ${player.settings.timezone}`}>
            <small>new day in</small> <b>{formatCountdown(msLeft)}</b>
          </span>
        </div>
        {lowHp && <p className="hud-warn">Low HP. Drink a potion from the shop, or level up to refill.</p>}
      </div>
    </header>
  );
}
