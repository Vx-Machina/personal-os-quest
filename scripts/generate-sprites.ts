/**
 * Renders the pixel-art definitions in packages/sprites into PNG sprite sheets.
 *   npm run sprites
 * Outputs: packages/web/public/sprites/{avatar,items,icons}.png, packages/web/public/favicon.png
 *          docs/sprites-preview.png (8x preview of everything)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHEETS,
  HATS,
  WEAPONS,
  PETS,
  baked,
  buildSheet,
  composeAvatar,
  createImg,
  draw,
  fill,
  scale,
  type SheetName,
} from '@poq/sprites';
import { encodePng } from '@poq/sprites/png';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'packages/web/public/sprites');
mkdirSync(outDir, { recursive: true });

const sheets = {} as Record<SheetName, ReturnType<typeof buildSheet>>;
for (const name of Object.keys(SHEETS) as SheetName[]) {
  sheets[name] = buildSheet(name);
  writeFileSync(join(outDir, SHEETS[name].file), encodePng(sheets[name]));
  console.log(`sprites/${SHEETS[name].file}  ${sheets[name].w}x${sheets[name].h}`);
}

writeFileSync(join(root, 'packages/web/public/favicon.png'), encodePng(scale(baked('body'), 2)));

// Preview board: loadouts, then the item and icon sheets.
const loadouts = [
  {},
  { hat: HATS[0], weapon: WEAPONS[0], pet: PETS[0] },
  { hat: HATS[1], weapon: WEAPONS[3], pet: PETS[1] },
  { hat: HATS[2], weapon: WEAPONS[1], pet: PETS[2] },
  { hat: HATS[3], weapon: WEAPONS[2], pet: PETS[3] },
];
const pad = 4;
const width = Math.max(loadouts.length * (28 + pad), sheets.items.w, sheets.icons.w) + pad;
const board = createImg(width, 16 * 3 + pad * 4);
fill(board, '#17132a');
loadouts.forEach((l, i) => draw(board, composeAvatar(l), pad + i * (28 + pad), pad));
draw(board, sheets.items, pad, 16 + pad * 2);
draw(board, sheets.icons, pad, 32 + pad * 3);
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs/sprites-preview.png'), encodePng(scale(board, 6)));
console.log('docs/sprites-preview.png');
