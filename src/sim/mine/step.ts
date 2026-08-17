/**
 * Симуляция фазы добычи (§4).
 *
 * Врагов нет принципиально — опасность создают только ловушки. Ограничение —
 * вместимость рюкзака, а не таймер: рюкзак заставляет выбирать, что нести.
 */

import { MINE, PLAYER, TILE } from '../../core/constants.ts';
import { TILE_POISON, TILE_SOLID, TILE_SPIKE } from '../../core/types.ts';
import { ITEMS } from '../../core/items.ts';
import type { GameState, MineState, OreEntity } from '../../core/types.ts';
import { bodyRect, clamp, moveX, moveY, rectsOverlap } from '../physics.ts';
import type { Rect } from '../physics.ts';
import { addItem, backpackCapacity, backpackTotal } from '../state.ts';

/**
 * В шахте нельзя умереть насмерть: здоровье не опускается ниже этого значения.
 * Смерть до боя ломала бы структуру забега — игрок терял бы забег, ни разу
 * не проверив свою подготовку. Ловушки при этом остаются болезненными,
 * потому что урон переносится в бой.
 */
const MIN_MINE_HP = 1;

export function stepMine(state: GameState, dt: number): void {
  const mine = state.mine;
  const run = state.run;
  if (!mine || !run) return;

  mine.elapsed += dt;
  if (mine.toastTimer > 0) mine.toastTimer -= dt;

  const solids = crumbleSolids(mine);
  stepPlayer(state, mine, dt, solids);
  stepCrumbles(mine, dt);
  stepStalactites(state, mine, dt);
  stepTileHazards(state, mine, dt);
  stepOre(mine, dt);
  updateExit(mine);
}

// ---------------------------------------------------------------------------
// Игрок
// ---------------------------------------------------------------------------

function stepPlayer(state: GameState, mine: MineState, dt: number, solids: Rect[]): void {
  const p = mine.player;
  const input = state.input;
  const isSolid = solidQuery(mine);

  p.px = p.x;
  p.py = p.y;

  if (p.invuln > 0) p.invuln -= dt;
  if (p.swingTimer > 0) p.swingTimer -= dt;
  if (p.swingCooldown > 0) p.swingCooldown -= dt;

  // Горизонтальное движение
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const accel = p.onGround ? PLAYER.accel : PLAYER.airAccel;
  if (dir !== 0) {
    p.vx += dir * accel * dt;
    p.vx = clamp(p.vx, -PLAYER.moveSpeed, PLAYER.moveSpeed);
    p.facing = dir > 0 ? 1 : -1;
  } else if (p.onGround) {
    const drop = PLAYER.friction * dt;
    p.vx = p.vx > 0 ? Math.max(0, p.vx - drop) : Math.min(0, p.vx + drop);
  }

  // Прыжок: койот-тайм и буфер нажатия — иначе платформинг ощущается сухим.
  if (p.onGround) p.coyote = PLAYER.coyoteTime;
  else if (p.coyote > 0) p.coyote -= dt;

  if (input.jumpPressed) p.jumpBuffer = PLAYER.jumpBufferTime;
  else if (p.jumpBuffer > 0) p.jumpBuffer -= dt;

  if (p.jumpBuffer > 0 && p.coyote > 0) {
    p.vy = -PLAYER.jumpVelocity;
    p.jumpBuffer = 0;
    p.coyote = 0;
    p.onGround = false;
    p.jumpCutLock = PLAYER.jumpMinHold;
  }
  // Отпустил кнопку на подъёме — прыжок короче.
  if (p.jumpCutLock > 0) p.jumpCutLock -= dt;
  else if (!input.jump && p.vy < 0) p.vy *= Math.pow(PLAYER.jumpCutMultiplier, dt * 60);

  p.vy = Math.min(p.vy + PLAYER.gravity * dt, PLAYER.maxFall);

  moveX(p, PLAYER.w, PLAYER.h, dt, isSolid, solids);
  moveY(p, PLAYER.w, PLAYER.h, dt, isSolid, solids);

  p.x = clamp(p.x, TILE + PLAYER.w / 2, (mine.width - 1) * TILE - PLAYER.w / 2);

  // Кирка. Читаем удержание, а не фронт нажатия: зажатая кнопка должна бить
  // раз за разом с интервалом перезарядки. По фронту удар происходил ровно один,
  // и на телефоне это читалось как «кнопка не работает».
  if (input.attack && p.swingCooldown <= 0) {
    p.swingTimer = MINE.pickSwing;
    p.swingCooldown = MINE.pickCooldown;
    swingPick(state, mine);
  }
}

function swingPick(state: GameState, mine: MineState): void {
  const p = mine.player;
  const capacity = backpackCapacity(state.meta);

  let best: OreEntity | null = null;
  let bestDist = Infinity;
  const cx = p.x + p.facing * MINE.pickRange * 0.4;
  const cy = p.y - PLAYER.h / 2;

  for (const ore of mine.ore) {
    if (ore.mined) continue;
    const dx = ore.x - cx;
    const dy = ore.y - cy;
    const d = Math.abs(dx) + Math.abs(dy) * 0.8;
    // Бьём только вперёд и близко — кирка не должна собирать пол-экрана.
    if (Math.abs(dx) > MINE.pickRange || Math.abs(dy) > MINE.pickRange) continue;
    if (d < bestDist) {
      bestDist = d;
      best = ore;
    }
  }

  if (!best) {
    mine.sweetStreak = 0;
    return;
  }

  best.hitFlash = 0.18;

  // Удар в слабое место раскалывает жилу целиком, чем бы она ни была.
  // Крупная жила в пять ударов при этом ломается за два — ради этого и стоит
  // бить в ритм, а не держать кнопку.
  const onSweet = best.sweet > 0;
  if (onSweet) {
    best.hp = 0;
    mine.sweetStreak += 1;
  } else {
    best.hp -= 1;
    mine.sweetStreak = 0;
  }

  if (best.hp > 0) {
    // Порода отзывается не сразу: пауза — это и есть окно для ритма.
    best.sweetDelay = MINE.sweetDelay;
    best.sweet = 0;
    return;
  }

  best.mined = true;
  best.sweet = 0;
  best.sweetDelay = 0;

  const amount = best.amount + (onSweet ? MINE.sweetBonus : 0);
  const put = addItem(state.meta.backpack, best.item, amount, capacity);
  mine.collected[best.item] += put;

  const name = ITEMS[best.item].name;
  if (put < amount) {
    mine.toast = put === 0 ? 'Рюкзак полон' : `Рюкзак полон: влезло только ${put}`;
  } else if (best.size === 'nugget') {
    mine.toast = `Самородок! +${put} · ${name}`;
  } else if (onSweet) {
    mine.toast = `Точный скол! +${put} · ${name}`;
  } else {
    mine.toast = `+${put} · ${name}`;
  }
  mine.toastTimer = MINE.toastTime;
}

// ---------------------------------------------------------------------------
// Ловушки
// ---------------------------------------------------------------------------

function damagePlayer(state: GameState, amount: number, invuln: number): void {
  const run = state.run;
  const mine = state.mine;
  if (!run || !mine) return;
  if (mine.player.invuln > 0) return;

  run.hp = Math.max(MIN_MINE_HP, run.hp - amount);
  mine.player.invuln = invuln;

  if (run.hp <= MIN_MINE_HP) {
    mine.toast = 'На последнем издыхании — в бой идти уже не с чем';
    mine.toastTimer = MINE.toastTime;
  }
}

function stepTileHazards(state: GameState, mine: MineState, dt: number): void {
  const p = mine.player;
  const rect = bodyRect(p.x, p.y, PLAYER.w, PLAYER.h);
  const tx0 = Math.floor(rect.x / TILE);
  const tx1 = Math.floor((rect.x + rect.w) / TILE);
  const ty0 = Math.floor(rect.y / TILE);
  const ty1 = Math.floor((rect.y + rect.h) / TILE);

  let inPoison = false;
  let onSpike = false;

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || ty < 0 || tx >= mine.width || ty >= mine.height) continue;
      const t = mine.tiles[ty * mine.width + tx];
      if (t === TILE_SPIKE) onSpike = true;
      else if (t === TILE_POISON) inPoison = true;
    }
  }

  if (onSpike) damagePlayer(state, MINE.spikeDamage, PLAYER.hitInvuln);
  // Яд бьёт постоянно и не даёт неуязвимости — из лужи надо выходить.
  if (inPoison && state.run) {
    state.run.hp = Math.max(MIN_MINE_HP, state.run.hp - MINE.poisonDps * dt);
  }
}

function stepCrumbles(mine: MineState, dt: number): void {
  const p = mine.player;
  const feet: Rect = { x: p.x - PLAYER.w / 2, y: p.y - 2, w: PLAYER.w, h: 6 };

  for (const c of mine.crumbles) {
    if (c.state === 'gone') continue;

    if (c.state === 'idle') {
      const platform: Rect = { x: c.x, y: c.y, w: c.w, h: c.h };
      if (rectsOverlap(feet, platform)) {
        c.state = 'shaking';
        c.timer = MINE.crumbleShake;
      }
    } else if (c.state === 'shaking') {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'falling';
        c.timer = MINE.crumbleFall;
        c.vy = 0;
      }
    } else if (c.state === 'falling') {
      c.vy = Math.min(c.vy + PLAYER.gravity * dt, PLAYER.maxFall);
      c.y += c.vy * dt;
      c.timer -= dt;
      if (c.timer <= 0 || c.y > mine.height * TILE) c.state = 'gone';
    }
  }
}

function stepStalactites(state: GameState, mine: MineState, dt: number): void {
  const p = mine.player;
  const isSolid = solidQuery(mine);

  for (const s of mine.stalactites) {
    if (s.state === 'broken') continue;

    if (s.state === 'idle') {
      if (Math.abs(s.x - p.x) < MINE.stalactiteTrigger && p.y > s.y) {
        s.state = 'warning';
        s.timer = MINE.stalactiteWarning;
      }
    } else if (s.state === 'warning') {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.state = 'falling';
        s.vy = 0;
      }
    } else if (s.state === 'falling') {
      s.vy = Math.min(s.vy + PLAYER.gravity * dt, PLAYER.maxFall);
      s.y += s.vy * dt;

      const rect: Rect = { x: s.x - 9, y: s.y - 22, w: 18, h: 22 };
      const pr = bodyRect(p.x, p.y, PLAYER.w, PLAYER.h);
      if (rectsOverlap(rect, pr)) {
        damagePlayer(state, MINE.stalactiteDamage, PLAYER.hitInvuln);
        s.state = 'broken';
        continue;
      }

      const tx = Math.floor(s.x / TILE);
      const ty = Math.floor(s.y / TILE);
      if (ty >= mine.height - 1 || isSolid(tx, ty)) s.state = 'broken';
    }
  }
}

/**
 * Жилы: вспышка от удара и окно слабого места.
 *
 * После удара порода «оседает» (`sweetDelay`), затем на ней загорается точка
 * (`sweet`). Пока точка горит, следующий удар раскалывает жилу целиком.
 * Окно короткое, но перезарядка кирки в него укладывается — попадание
 * зависит от ритма, а не от везения.
 */
function stepOre(mine: MineState, dt: number): void {
  for (const ore of mine.ore) {
    if (ore.hitFlash > 0) ore.hitFlash -= dt;
    if (ore.mined) continue;

    if (ore.sweetDelay > 0) {
      ore.sweetDelay -= dt;
      if (ore.sweetDelay <= 0) ore.sweet = MINE.sweetWindow;
    } else if (ore.sweet > 0) {
      ore.sweet -= dt;
    }
  }
}

function updateExit(mine: MineState): void {
  const p = mine.player;
  mine.atExit = Math.abs(p.x - mine.exitX) < 44 && Math.abs(p.y - mine.exitY) < TILE * 2.5;
}

// ---------------------------------------------------------------------------
// Вспомогательное
// ---------------------------------------------------------------------------

export function solidQuery(mine: MineState) {
  return (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= mine.width || ty >= mine.height) return true;
    return mine.tiles[ty * mine.width + tx] === TILE_SOLID;
  };
}

function crumbleSolids(mine: MineState): Rect[] {
  const out: Rect[] = [];
  for (const c of mine.crumbles) {
    if (c.state === 'idle' || c.state === 'shaking') {
      out.push({ x: c.x, y: c.y, w: c.w, h: c.h });
    }
  }
  return out;
}

export function backpackFull(state: GameState): boolean {
  return backpackTotal(state.meta.backpack) >= backpackCapacity(state.meta);
}
