import type { CSSProperties } from 'react';
import { CELL, frameOf, sheetSize, SHEETS, type SheetName } from '@poq/sprites';
import type { Player } from '@poq/core';

const url = (sheet: SheetName) => `/sprites/${SHEETS[sheet].file}`;

function frameStyle(sheet: SheetName, id: string, scale: number, row = 0): CSSProperties | null {
  const f = frameOf(sheet, id, row);
  if (!f) return null;
  const size = sheetSize(sheet);
  return {
    width: CELL * scale,
    height: CELL * scale,
    backgroundImage: `url(${url(sheet)})`,
    backgroundPosition: `-${f.x * scale}px -${f.y * scale}px`,
    backgroundSize: `${size.w * scale}px ${size.h * scale}px`,
  };
}

/** One 16x16 frame from a sprite sheet, scaled with crisp pixels. */
export function Sprite({ sheet = 'icons', id, scale = 2, className = '', title }: { sheet?: SheetName; id: string; scale?: number; className?: string; title?: string }) {
  const style = frameStyle(sheet, id, scale);
  if (!style) return null;
  return <span className={`sprite ${className}`} style={style} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} title={title} />;
}

/**
 * The hero: body + hat + weapon, with every layer's outline drawn under every fill
 * (so a hat's outline never covers the face), and the pet standing alongside.
 */
export function Avatar({ equipped, scale = 6, bob = true }: { equipped: Player['equipped']; scale?: number; bob?: boolean }) {
  const layers = ['body', equipped.hat, equipped.weapon].filter((x): x is string => Boolean(x));
  return (
    <div className={`avatar ${bob ? 'bob' : ''}`} style={{ width: 28 * scale, height: CELL * scale }} aria-hidden>
      <div className="avatar-hero" style={{ width: CELL * scale, height: CELL * scale }}>
        {layers.map((id) => (
          <span key={`o-${id}`} className="sprite layer" style={frameStyle('avatar', id, scale, 1) ?? undefined} />
        ))}
        {layers.map((id) => (
          <span key={`f-${id}`} className="sprite layer" style={frameStyle('avatar', id, scale, 0) ?? undefined} />
        ))}
      </div>
      {equipped.pet && (
        <div className="avatar-pet" style={{ left: 14 * scale, width: CELL * scale, height: CELL * scale }}>
          <span className="sprite layer" style={frameStyle('avatar', equipped.pet, scale, 1) ?? undefined} />
          <span className="sprite layer" style={frameStyle('avatar', equipped.pet, scale, 0) ?? undefined} />
        </div>
      )}
    </div>
  );
}
