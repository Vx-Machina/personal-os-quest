import type { Slot } from './types';

export type ItemSlot = Slot | 'consumable';

export interface ShopItem {
  id: string;
  name: string;
  slot: ItemSlot;
  cost: number;
  unlockLevel: number;
  description: string;
  /** Consumables only. */
  heal?: number;
}

/** Built-in gear. Sprites with the same id live in the generated sprite sheets. */
export const CATALOG: ShopItem[] = [
  { id: 'potion', name: 'Health Potion', slot: 'consumable', cost: 25, unlockLevel: 1, heal: 15, description: 'Restores 15 HP.' },

  { id: 'hat-beanie', name: 'Cozy Beanie', slot: 'hat', cost: 30, unlockLevel: 1, description: 'Warm head, clear mind.' },
  { id: 'hat-wizard', name: 'Wizard Hat', slot: 'hat', cost: 80, unlockLevel: 3, description: 'For deep-focus spellwork.' },
  { id: 'hat-helmet', name: 'Knight Helm', slot: 'hat', cost: 150, unlockLevel: 5, description: 'Deflects distractions.' },
  { id: 'hat-crown', name: 'Crown of Habits', slot: 'hat', cost: 250, unlockLevel: 8, description: 'Worn by those who show up daily.' },

  { id: 'wpn-sword', name: 'Iron Sword', slot: 'weapon', cost: 40, unlockLevel: 2, description: 'Cuts through procrastination.' },
  { id: 'wpn-hammer', name: "Maker's Hammer", slot: 'weapon', cost: 60, unlockLevel: 3, description: 'Build it, ship it.' },
  { id: 'wpn-guitar', name: "Bard's Guitar", slot: 'weapon', cost: 120, unlockLevel: 4, description: 'Practice makes legend.' },
  { id: 'wpn-staff', name: 'Staff of Focus', slot: 'weapon', cost: 200, unlockLevel: 6, description: 'Channels the work block.' },

  { id: 'pet-slime', name: 'Mint Slime', slot: 'pet', cost: 60, unlockLevel: 1, description: 'Bounces when you check a box.' },
  { id: 'pet-cat', name: 'Pixel Cat', slot: 'pet', cost: 100, unlockLevel: 2, description: 'Judges your streaks silently.' },
  { id: 'pet-dog', name: 'Loyal Pup', slot: 'pet', cost: 150, unlockLevel: 4, description: 'Always up for the gym block.' },
  { id: 'pet-bot', name: 'Robo Drone', slot: 'pet', cost: 300, unlockLevel: 7, description: 'Six axes of pure support.' },
];

export function findItem(id: string): ShopItem | undefined {
  return CATALOG.find((i) => i.id === id);
}
