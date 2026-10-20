/** Which sprite sits where in each generated sheet. Pure data, safe to import in the browser. */
import { CELL } from './art';

export const HATS = ['hat-beanie', 'hat-wizard', 'hat-helmet', 'hat-crown'];
export const WEAPONS = ['wpn-sword', 'wpn-hammer', 'wpn-guitar', 'wpn-staff'];
export const PETS = ['pet-slime', 'pet-cat', 'pet-dog', 'pet-bot'];

export const ICONS = [
  'icon-hp',
  'icon-xp',
  'icon-gold',
  'icon-streak',
  'icon-level',
  'icon-shop',
  'icon-lock',
  'icon-check',
  'icon-reward',
  'dom-health',
  'dom-family',
  'dom-social',
  'dom-love',
  'dom-career',
  'dom-finance',
  'dom-fun',
  'dom-growth',
  'dom-environment',
];

export interface SheetSpec {
  file: string;
  ids: string[];
  /** avatar sheet: row 0 = fills, row 1 = generated outlines (layer outlines under all fills). */
  rows: 1 | 2;
}

export const SHEETS = {
  avatar: { file: 'avatar.png', ids: ['body', ...HATS, ...WEAPONS, ...PETS], rows: 2 } as SheetSpec,
  items: { file: 'items.png', ids: ['potion', ...HATS, ...WEAPONS, ...PETS], rows: 1 } as SheetSpec,
  icons: { file: 'icons.png', ids: ICONS, rows: 1 } as SheetSpec,
};

export type SheetName = keyof typeof SHEETS;

export { CELL };

/** Pixel offset of a sprite inside its sheet, or null if the id is unknown. */
export function frameOf(sheet: SheetName, id: string, row = 0): { x: number; y: number } | null {
  const i = SHEETS[sheet].ids.indexOf(id);
  return i < 0 ? null : { x: i * CELL, y: row * CELL };
}

export function sheetSize(sheet: SheetName): { w: number; h: number } {
  const s = SHEETS[sheet];
  return { w: s.ids.length * CELL, h: s.rows * CELL };
}
