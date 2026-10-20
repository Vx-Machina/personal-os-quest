import { useState, type FormEvent } from 'react';
import type { PlayerView } from '@poq/core';
import type { PlayerSummary } from '../api';
import { Modal } from './Modal';

const ZONES = ['Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];

export function Settings({
  player,
  players,
  currentPid,
  onSave,
  onForceReset,
  onSwitch,
  onCreatePlayer,
  onClose,
}: {
  player: PlayerView;
  players: PlayerSummary[];
  currentPid: string;
  onSave: (body: Record<string, unknown>) => void;
  onForceReset: () => void;
  onSwitch: (pid: string) => void;
  onCreatePlayer: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [timezone, setTimezone] = useState(player.settings.timezone);
  const [resetTime, setResetTime] = useState(player.settings.resetTime);
  const [threshold, setThreshold] = useState(String(Math.round(player.settings.streakThreshold * 100)));
  const [resting, setResting] = useState(player.settings.resting);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newName, setNewName] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ name, settings: { timezone, resetTime, streakThreshold: Number(threshold) / 100, resting } });
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Hero name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        </label>
        <div className="form-row">
          <label>
            Time zone
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} list="zones" required />
            <datalist id="zones">
              {ZONES.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </label>
          <label>
            Day resets at
            <input type="time" value={resetTime} onChange={(e) => setResetTime(e.target.value)} required />
          </label>
        </div>
        <label>
          A day counts toward the streak at
          <select value={threshold} onChange={(e) => setThreshold(e.target.value)}>
            {[50, 60, 75, 90, 100].map((v) => (
              <option key={v} value={v}>
                {v}% of due dailies
              </option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input type="checkbox" checked={resting} onChange={(e) => setResting(e.target.checked)} />
          Rest mode (travel, shoots, sick days): no damage, streaks frozen
        </label>
        <div className="form-actions">
          <span className="spacer" />
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>

      <div className="form-section">
        <h3>Day reset</h3>
        <p className="hint">
          Runs automatically at {player.settings.resetTime} ({player.settings.timezone}). Running it now ends today: unchecked dailies cost HP.
        </p>
        {confirmReset ? (
          <button className="btn btn-danger" onClick={onForceReset}>
            End the day now
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
            Run day reset now…
          </button>
        )}
      </div>

      <div className="form-section">
        <h3>Players</h3>
        <ul className="players">
          {players.map((p) => {
            const active = String(p.id) === currentPid || (p.local && currentPid === 'local');
            return (
              <li key={p.id}>
                <span>
                  {p.name} · L{p.level}
                  {p.local && <span className="pill">local</span>}
                  {p.discordLinked && <span className="pill">Discord</span>}
                </span>
                <button className="btn btn-small btn-ghost" disabled={active} onClick={() => onSwitch(p.local ? 'local' : String(p.id))}>
                  {active ? 'Playing' : 'Switch'}
                </button>
              </li>
            );
          })}
        </ul>
        <form
          className="quick-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) onCreatePlayer(newName.trim());
            setNewName('');
          }}
        >
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New player name…" aria-label="New player name" maxLength={40} />
          <button className="btn btn-small" disabled={!newName.trim()}>
            Add player
          </button>
        </form>
      </div>
    </Modal>
  );
}
