import type { Notice, Player } from '@poq/core';
import { Avatar, Sprite } from './Sprite';

export interface Toast {
  id: number;
  kind: Notice['kind'] | 'error';
  text: string;
}

const ICON: Partial<Record<Toast['kind'], string>> = {
  error: 'icon-hp',
  gain: 'icon-xp',
  loss: 'icon-xp',
  damage: 'icon-hp',
  heal: 'icon-hp',
  unlock: 'icon-shop',
  streak: 'icon-streak',
  reset: 'icon-streak',
  buy: 'icon-reward',
  levelDown: 'icon-level',
  info: 'icon-check',
};

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast toast-${t.kind}`} onClick={() => onDismiss(t.id)}>
          {ICON[t.kind] && <Sprite id={ICON[t.kind]!} scale={1} />}
          <span>{t.text}</span>
        </button>
      ))}
    </div>
  );
}

/** Big moment: level-ups and faints get a modal with the hero. */
export function Spotlight({ notice, extra = [], equipped, onClose }: { notice: Notice; extra?: string[]; equipped: Player['equipped']; onClose: () => void }) {
  const levelUp = notice.kind === 'levelUp';
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`spotlight panel ${levelUp ? 'is-level' : 'is-faint'}`} role="alertdialog" aria-label={levelUp ? 'Level up' : 'You fainted'}>
        <div className="spotlight-rays" aria-hidden />
        <Sprite id={levelUp ? 'icon-level' : 'icon-hp'} scale={3} />
        <h2>{levelUp ? 'LEVEL UP!' : 'YOU FAINTED'}</h2>
        <Avatar equipped={equipped} scale={6} />
        <p>{notice.text}</p>
        {extra.length > 0 && (
          <ul className="spotlight-extra">
            {extra.map((t) => (
              <li key={t}>
                <Sprite id="icon-shop" scale={1} /> {t}
              </li>
            ))}
          </ul>
        )}
        <button className="btn btn-primary" onClick={onClose} autoFocus>
          {levelUp ? 'Onward' : 'Get back up'}
        </button>
      </div>
    </div>
  );
}
