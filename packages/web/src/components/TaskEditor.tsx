import { useState, type FormEvent } from 'react';
import { DIFFICULTIES, DOMAINS, DOMAIN_INFO, WEEKDAY_SHORT, damageFor, rewardFor, type Difficulty, type Domain } from '@poq/core';
import type { TaskView } from '../api';
import { Modal } from './Modal';
import { Sprite } from './Sprite';

export function TaskEditor({
  task,
  onSave,
  onDelete,
  onClose,
}: {
  task: TaskView;
  onSave: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [domain, setDomain] = useState<Domain>(task.domain);
  const [difficulty, setDifficulty] = useState<Difficulty>(task.difficulty);
  const [timeLabel, setTimeLabel] = useState(task.timeLabel);
  const [days, setDays] = useState<number[]>(task.days);
  const [allowUp, setAllowUp] = useState(task.allowUp);
  const [allowDown, setAllowDown] = useState(task.allowDown);
  const [forgiving, setForgiving] = useState(task.forgiving);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reward = rewardFor(difficulty);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ title, notes, domain, difficulty, timeLabel, days, allowUp, allowDown, forgiving });
  };
  const kind = task.type === 'todo' ? 'To-do' : task.type === 'daily' ? 'Daily' : 'Habit';

  return (
    <Modal title={`Edit ${kind} #${task.id}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </label>
        <label>
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
        </label>

        <fieldset>
          <legend>Life domain</legend>
          <div className="domain-picker">
            {DOMAINS.map((d) => (
              <button type="button" key={d} className={`domain-option ${domain === d ? 'active' : ''}`} onClick={() => setDomain(d)} aria-pressed={domain === d}>
                <Sprite id={DOMAIN_INFO[d].icon} scale={2} />
                <span>{DOMAIN_INFO[d].short}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Difficulty</legend>
          <div className="segmented">
            {DIFFICULTIES.map((d) => (
              <button type="button" key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)} aria-pressed={difficulty === d}>
                {d}
              </button>
            ))}
          </div>
          <p className="hint">
            +{reward.xp} XP · +{reward.gold} gold · +{reward.stat} {DOMAIN_INFO[domain].label}
            {task.type !== 'todo' && ` · miss/− costs ${damageFor(difficulty)} HP`}
          </p>
        </fieldset>

        {task.type === 'daily' && (
          <>
            <label>
              Time slot (optional)
              <input value={timeLabel} onChange={(e) => setTimeLabel(e.target.value)} placeholder="e.g. 10:00-12:00" maxLength={40} />
            </label>
            <fieldset>
              <legend>Due on</legend>
              <div className="segmented days">
                {WEEKDAY_SHORT.map((label, i) => (
                  <button
                    type="button"
                    key={label}
                    className={days.includes(i) ? 'active' : ''}
                    aria-pressed={days.includes(i)}
                    onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort())}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {task.type === 'habit' && (
          <fieldset>
            <legend>Buttons</legend>
            <label className="check-label">
              <input type="checkbox" checked={allowUp} onChange={(e) => setAllowUp(e.target.checked)} /> + (good habit)
            </label>
            <label className="check-label">
              <input type="checkbox" checked={allowDown} onChange={(e) => setAllowDown(e.target.checked)} /> − (habit to break)
            </label>
          </fieldset>
        )}

        {task.type === 'daily' && (
          <>
            <label className="check-label">
              <input type="checkbox" checked={forgiving} onChange={(e) => setForgiving(e.target.checked)} /> Forgiving: missing it breaks the streak but costs no HP
            </label>
            <p className="hint">
              Streak {task.streak} · best {task.bestStreak}
            </p>
          </>
        )}

        <div className="form-actions">
          {confirmDelete ? (
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              Really delete?
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim() || (task.type === 'habit' && !allowUp && !allowDown)}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
