import { ART, CELL } from './art';
import { OUTLINE, PALETTE } from './palette';
import { SHEETS, type SheetName } from './layout';

/** Minimal RGBA bitmap. */
export interface Img {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export function createImg(w: number, h: number): Img {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

function rgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

const COLORS: Record<string, [number, number, number, number]> = Object.fromEntries(
  Object.entries(PALETTE).map(([k, v]) => [k, rgba(v)]),
);

export function gridToImg(id: string): Img {
  const grid = ART[id];
  if (!grid) throw new Error(`Unknown sprite "${id}"`);
  if (grid.length !== CELL) throw new Error(`Sprite "${id}" has ${grid.length} rows, expected ${CELL}`);
  const img = createImg(CELL, CELL);
  grid.forEach((row, y) => {
    if (row.length !== CELL) throw new Error(`Sprite "${id}" row ${y} has ${row.length} columns, expected ${CELL}`);
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const c = COLORS[ch];
      if (!c) throw new Error(`Sprite "${id}" row ${y} uses unknown colour "${ch}"`);
      img.data.set(c, (y * img.w + x) * 4);
    });
  });
  return img;
}

function alpha(img: Img, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return 0;
  return img.data[(y * img.w + x) * 4 + 3];
}

/** 1px outline around opaque pixels (4-neighbourhood, so corners stay round). */
export function outlineOf(img: Img): Img {
  const out = createImg(img.w, img.h);
  const c = rgba(OUTLINE);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (alpha(img, x, y)) continue;
      if (alpha(img, x - 1, y) || alpha(img, x + 1, y) || alpha(img, x, y - 1) || alpha(img, x, y + 1)) {
        out.data.set(c, (y * out.w + x) * 4);
      }
    }
  }
  return out;
}

/**
 * Copy opaque pixels of `src` onto `dst` at (dx, dy).
 * mode "over" paints everywhere; mode "under" only fills transparent destination pixels
 * (used for outlines so a hat's outline never covers the face it sits on).
 */
export function draw(dst: Img, src: Img, dx = 0, dy = 0, mode: 'over' | 'under' = 'over'): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const si = (y * src.w + x) * 4;
      if (!src.data[si + 3]) continue;
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      const di = (ty * dst.w + tx) * 4;
      if (mode === 'under' && dst.data[di + 3]) continue;
      dst.data.set(src.data.subarray(si, si + 4), di);
    }
  }
}

/** Sprite with its outline baked in. */
export function baked(id: string): Img {
  const fill = gridToImg(id);
  const img = createImg(CELL, CELL);
  draw(img, fill);
  draw(img, outlineOf(fill), 0, 0, 'under');
  return img;
}

/** Moves the visible pixels to the centre of the cell (for shop thumbnails of hats/weapons). */
export function centered(img: Img): Img {
  let minX = img.w, minY = img.h, maxX = -1, maxY = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (alpha(img, x, y)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return img;
  const out = createImg(img.w, img.h);
  const dx = Math.floor((img.w - (maxX - minX + 1)) / 2) - minX;
  const dy = Math.floor((img.h - (maxY - minY + 1)) / 2) - minY;
  draw(out, img, dx, dy);
  return out;
}

export function scale(img: Img, k: number): Img {
  const out = createImg(img.w * k, img.h * k);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const si = (Math.floor(y / k) * img.w + Math.floor(x / k)) * 4;
      out.data.set(img.data.subarray(si, si + 4), (y * out.w + x) * 4);
    }
  }
  return out;
}

export function fill(img: Img, hex: string): void {
  const c = rgba(hex);
  for (let i = 0; i < img.w * img.h; i++) img.data.set(c, i * 4);
}

/** Builds one of the sheets described in layout.ts. */
export function buildSheet(name: SheetName): Img {
  const spec = SHEETS[name];
  const sheet = createImg(spec.ids.length * CELL, spec.rows * CELL);
  spec.ids.forEach((id, i) => {
    if (name === 'avatar') {
      const f = gridToImg(id);
      draw(sheet, f, i * CELL, 0);
      draw(sheet, outlineOf(f), i * CELL, CELL);
    } else if (name === 'items') {
      draw(sheet, centered(baked(id)), i * CELL, 0);
    } else {
      draw(sheet, baked(id), i * CELL, 0);
    }
  });
  return sheet;
}

export interface Loadout {
  hat?: string | null;
  weapon?: string | null;
  pet?: string | null;
}

/** Hero + gear + pet on one transparent canvas (28x16), as shown on Discord. */
export function composeAvatar(loadout: Loadout): Img {
  const img = createImg(28, CELL);
  const layers = ['body', loadout.hat, loadout.weapon].filter((x): x is string => Boolean(x && ART[x]));
  const fills = layers.map(gridToImg);
  for (const f of fills) draw(img, f);
  for (const f of fills) draw(img, outlineOf(f), 0, 0, 'under');
  if (loadout.pet && ART[loadout.pet]) draw(img, baked(loadout.pet), 14, 0);
  return img;
}
