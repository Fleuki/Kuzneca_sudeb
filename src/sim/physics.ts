/**
 * Коллизии и общая математика симуляции.
 *
 * Тела задаются как «x — центр по горизонтали, y — ступни». Такой якорь удобен
 * для платформера: приземление это просто y = верх тайла.
 *
 * Тоннелирование не проверяется намеренно: при 60 Гц самая быстрая сущность
 * (рывок, 640 px/с) проходит ~10.7 px за тик при тайле в 24 px, так что
 * перепрыгнуть стену за один шаг невозможно.
 */

import { TILE } from '../core/constants.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Тело, которое умеет двигаться и сталкиваться. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export type SolidQuery = (tx: number, ty: number) => boolean;

// ---------------------------------------------------------------------------
// Прямоугольники
// ---------------------------------------------------------------------------

/** AABB по якорю «центр/ступни». */
export function bodyRect(x: number, y: number, w: number, h: number): Rect {
  return { x: x - w / 2, y: y - h, w, h };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function approach(value: number, target: number, delta: number): number {
  if (value < target) return Math.min(value + delta, target);
  if (value > target) return Math.max(value - delta, target);
  return value;
}

export function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// ---------------------------------------------------------------------------
// Столкновение с тайловой сеткой
// ---------------------------------------------------------------------------

const EPS = 0.001;

function tileRange(from: number, to: number): [number, number] {
  return [Math.floor(from / TILE), Math.floor(to / TILE)];
}

/**
 * Двигает тело по X на vx*dt и разрешает столкновения с тайлами и
 * дополнительными твёрдыми прямоугольниками (осыпающиеся платформы).
 */
export function moveX(
  body: Body,
  w: number,
  h: number,
  dt: number,
  isSolid: SolidQuery,
  solids: Rect[],
): void {
  const dx = body.vx * dt;
  if (dx === 0) return;
  body.x += dx;

  const left = body.x - w / 2;
  const right = body.x + w / 2;
  const [ty0, ty1] = tileRange(body.y - h + EPS, body.y - EPS);

  if (dx > 0) {
    const tx = Math.floor((right - EPS) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (isSolid(tx, ty)) {
        body.x = tx * TILE - w / 2 - EPS;
        body.vx = 0;
        break;
      }
    }
  } else {
    const tx = Math.floor(left / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (isSolid(tx, ty)) {
        body.x = (tx + 1) * TILE + w / 2 + EPS;
        body.vx = 0;
        break;
      }
    }
  }

  // Динамические платформы — те же правила, но по произвольным прямоугольникам.
  for (const s of solids) {
    const me = bodyRect(body.x, body.y, w, h);
    if (!rectsOverlap(me, s)) continue;
    if (dx > 0) body.x = s.x - w / 2 - EPS;
    else body.x = s.x + s.w + w / 2 + EPS;
    body.vx = 0;
  }
}

/**
 * Двигает тело по Y и разрешает столкновения.
 * Ставит onGround, если приземлились сверху на что-то твёрдое.
 */
export function moveY(
  body: Body,
  w: number,
  h: number,
  dt: number,
  isSolid: SolidQuery,
  solids: Rect[],
): void {
  body.onGround = false;
  const dy = body.vy * dt;
  if (dy !== 0) {
    body.y += dy;

    const [tx0, tx1] = tileRange(body.x - w / 2 + EPS, body.x + w / 2 - EPS);

    if (dy > 0) {
      const ty = Math.floor((body.y - EPS) / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (isSolid(tx, ty)) {
          body.y = ty * TILE - EPS;
          body.vy = 0;
          body.onGround = true;
          break;
        }
      }
    } else {
      const ty = Math.floor((body.y - h) / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (isSolid(tx, ty)) {
          body.y = (ty + 1) * TILE + h + EPS;
          body.vy = 0;
          break;
        }
      }
    }
  }

  for (const s of solids) {
    const me = bodyRect(body.x, body.y, w, h);
    if (!rectsOverlap(me, s)) continue;
    if (body.vy >= 0) {
      body.y = s.y - EPS;
      body.vy = 0;
      body.onGround = true;
    } else {
      body.y = s.y + s.h + h + EPS;
      body.vy = 0;
    }
  }

  // Стоим вплотную к земле, но vy обнулилась раньше — всё равно считаем,
  // что опора есть, иначе прыжок «залипает» на краях тайлов.
  if (!body.onGround && body.vy >= 0) {
    const [tx0, tx1] = tileRange(body.x - w / 2 + EPS, body.x + w / 2 - EPS);
    const ty = Math.floor((body.y + 1) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolid(tx, ty)) {
        body.onGround = true;
        break;
      }
    }
    if (!body.onGround) {
      const feet = { x: body.x - w / 2, y: body.y, w, h: 2 };
      for (const s of solids) {
        if (rectsOverlap(feet, s)) {
          body.onGround = true;
          break;
        }
      }
    }
  }
}
