import { useState, type FormEvent } from 'react';
import { CATALOG, type ShopItem } from '@poq/core';
import type { GameState } from '../api';
import { Sprite } from './Sprite';

export interface ShopActions {
  buyReward: (id: number) => void;
  deleteReward: (id: number) => void;
  addReward: (title: string, cost: number) => Promise<boolean>;
  buyItem: (id: string) => void;
  equip: (id: string) => void;
}

const GROUPS: { slot: ShopItem['slot']; label: string }[] = [
  { slot: 'consumable', label: 'Potions' },
  { slot: 'hat', label: 'Hats' },
  { slot: 'weapon', label: 'Weapons' },
  { slot: 'pet', label: 'Pets' },
];

function Price({ cost }: { cost: number }) {
  return (
    <span className="price">
      <Sprite id="icon-gold" scale={1} />
      {cost}
    </span>
  );
}

export function Shop({ state, actions }: { state: GameState; actions: ShopActions }) {
  const { player } = state;
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('30');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await actions.addReward(title.trim(), Number(cost))) setTitle('');
  };

  return (
    <div className="shop">
      <section className="panel">
        <div className="column-head">
          <h2>Rewards</h2>
          <span className="wallet">
            <Sprite id="icon-gold" scale={2} />
            <b>{player.gold}</b>
          </span>
        </div>
        <p className="hint">Your own treats, priced in gold. Buy one when you have earned it.</p>
        <ul className="reward-list">
          {state.rewards.map((r) => (
            <li key={r.id} className="reward">
              <Sprite id="icon-reward" scale={2} />
              <div className="reward-text">
                <b>{r.title}</b>
                {r.notes && <small>{r.notes}</small>}
              </div>
              <button className="btn btn-gold" disabled={player.gold < r.cost} onClick={() => actions.buyReward(r.id)} aria-label={`Buy ${r.title} for ${r.cost} gold`}>
                <Price cost={r.cost} />
              </button>
              <button className="btn btn-ghost btn-icon" onClick={() => actions.deleteReward(r.id)} aria-label={`Delete reward ${r.title}`}>
                ✕
              </button>
            </li>
          ))}
          {state.rewards.length === 0 && <li className="empty">No rewards yet. Add one below.</li>}
        </ul>
        <form className="quick-add" onSubmit={submit}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New reward…" aria-label="Reward title" maxLength={120} />
          <input className="cost" type="number" min={1} max={100000} value={cost} onChange={(e) => setCost(e.target.value)} aria-label="Cost in gold" />
          <button className="btn btn-small" disabled={!title.trim() || !(Number(cost) >= 1)}>
            Add
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="column-head">
          <h2>Gear</h2>
          <span className="count">Level {player.level}</span>
        </div>
        {GROUPS.map((g) => (
          <div key={g.slot} className="gear-group">
            <h3>{g.label}</h3>
            <div className="gear-grid">
              {CATALOG.filter((i) => i.slot === g.slot).map((item) => {
                const locked = player.level < item.unlockLevel;
                const owned = player.inventory.includes(item.id);
                const equipped = item.slot !== 'consumable' && player.equipped[item.slot] === item.id;
                return (
                  <div key={item.id} className={`gear ${locked ? 'locked' : ''} ${equipped ? 'equipped' : ''}`}>
                    <div className="gear-art">
                      <Sprite sheet="items" id={item.id} scale={3} />
                      {locked && <Sprite id="icon-lock" scale={1} className="gear-lock" />}
                    </div>
                    <b>{item.name}</b>
                    <small>{item.description}</small>
                    {locked ? (
                      <span className="gear-state">Unlocks at level {item.unlockLevel}</span>
                    ) : owned ? (
                      <button className={`btn btn-small ${equipped ? 'btn-primary' : ''}`} onClick={() => actions.equip(item.id)}>
                        {equipped ? 'Equipped' : 'Equip'}
                      </button>
                    ) : (
                      <button className="btn btn-gold btn-small" disabled={player.gold < item.cost || (item.slot === 'consumable' && player.hp >= player.maxHp)} onClick={() => actions.buyItem(item.id)}>
                        <Price cost={item.cost} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
