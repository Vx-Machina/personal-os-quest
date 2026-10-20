import type { GameState } from '../api';
import { Sprite } from './Sprite';

const ICON: Record<string, string> = {
  complete: 'icon-check',
  undo: 'icon-check',
  habit_up: 'icon-xp',
  habit_down: 'icon-hp',
  reset: 'icon-streak',
  level_up: 'icon-level',
  faint: 'icon-hp',
  buy_reward: 'icon-reward',
  buy_item: 'icon-shop',
  potion: 'icon-hp',
};

function describe(e: GameState['events'][number]): string {
  switch (e.type) {
    case 'complete':
      return `Completed “${e.text}”`;
    case 'undo':
      return `Unchecked “${e.text}”`;
    case 'habit_up':
      return `+ ${e.text}`;
    case 'habit_down':
      return `− ${e.text}`;
    case 'reset': {
      try {
        const r = JSON.parse(e.text) as { done: number; due: number; damage: number; forced: boolean };
        return `${r.forced ? 'Manual day reset' : 'Day reset'}: ${r.done}/${r.due} dailies`;
      } catch {
        return 'Day reset';
      }
    }
    case 'buy_reward':
      return `Bought reward “${e.text}”`;
    case 'buy_item':
      return `Bought ${e.text}`;
    case 'potion':
      return `Drank a ${e.text}`;
    default:
      return e.text;
  }
}

function deltas(e: GameState['events'][number]): string {
  const parts: string[] = [];
  if (e.xp) parts.push(`${e.xp > 0 ? '+' : ''}${e.xp} XP`);
  if (e.gold) parts.push(`${e.gold > 0 ? '+' : ''}${e.gold} gold`);
  if (e.hp) parts.push(`${e.hp > 0 ? '+' : ''}${e.hp} HP`);
  return parts.join(' · ');
}

export function Log({ state }: { state: GameState }) {
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZone: state.player.settings.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <section className="panel log">
      <h2>Adventure log</h2>
      <ul>
        {state.events.map((e) => (
          <li key={e.id} className={`log-${e.type}`}>
            <Sprite id={ICON[e.type] ?? 'icon-xp'} scale={1} />
            <span className="log-text">{describe(e)}</span>
            <span className="log-delta">{deltas(e)}</span>
            <time dateTime={e.ts}>{fmt.format(new Date(e.ts))}</time>
          </li>
        ))}
        {state.events.length === 0 && <li className="empty">Nothing yet. Check off your first quest.</li>}
      </ul>
    </section>
  );
}
