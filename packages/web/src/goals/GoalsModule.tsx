import { useState } from 'react';
import type { GoalLevel, GoalState } from '@poq/core';
import { Dashboard, seasonInfo } from './Dashboard';
import { GoalEditor } from './GoalEditor';
import { Review } from './Review';
import { Today, type GoalActions } from './Today';
import { Toolkit } from './Toolkit';

export type GoalsTab = 'today' | 'dashboard' | 'review' | 'toolkit';

type Target = { id: number } | { create: GoalLevel; parentId: number | null };

export function GoalsModule({ tab, g, a }: { tab: GoalsTab; g: GoalState; a: GoalActions }) {
  const [target, setTarget] = useState<Target | null>(null);
  const info = seasonInfo(g);
  const open = (id: number) => setTarget({ id });

  let editor = null;
  if (target) {
    if ('id' in target) {
      const goal = g.goals.find((x) => x.id === target.id) ?? null;
      if (goal) {
        editor = (
          <GoalEditor
            key={`goal-${goal.id}`}
            goal={goal}
            parent={g.goals.find((x) => x.id === goal.parentId) ?? null}
            level={goal.level}
            g={g}
            a={a}
            onClose={() => setTarget(null)}
            onOpen={open}
            onNewChild={(level, parentId) => setTarget({ create: level, parentId })}
          />
        );
      }
    } else {
      const parent = target.parentId ? (g.goals.find((x) => x.id === target.parentId) ?? null) : null;
      editor = (
        <GoalEditor
          key={`new-${target.create}-${target.parentId}`}
          goal={null}
          parent={parent}
          level={target.create}
          g={g}
          a={a}
          onClose={() => setTarget(parent ? { id: parent.id } : null)}
          onOpen={open}
          onNewChild={(level, parentId) => setTarget({ create: level, parentId })}
        />
      );
    }
  }

  return (
    <>
      {tab === 'today' && <Today g={g} a={a} seasonDay={info ? `Season day ${info.day} of ${info.length}` : null} />}
      {tab === 'dashboard' && <Dashboard g={g} onOpen={open} onNew={() => setTarget({ create: 'season', parentId: null })} />}
      {tab === 'review' && <Review g={g} a={a} />}
      {tab === 'toolkit' && <Toolkit g={g} a={a} />}
      {editor}
    </>
  );
}
