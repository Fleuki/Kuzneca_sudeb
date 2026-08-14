/**
 * Бот для автоматической балансировки.
 *
 * Он изображает не идеального игрока, а *компетентного*: ищет ближайшую
 * безопасную точку, а не убегает от первой попавшейся опасности; прыгает через
 * низкие атаки; тратит рывок, когда уйти пешком уже не успеть; и бьёт всегда,
 * когда достаёт, потому что замах в этой игре ничему не мешает.
 *
 * Такой бот и нужен для баланса: если он не вытягивает босса «правильным»
 * материалом, значит сломаны числа, а не руки.
 *
 * Бот работает через тот же интерфейс, что и живой игрок: заполняет InputState
 * и отдаёт его командой INPUT. Прямого доступа к состоянию у него нет.
 */

import { ARENA, PLAYER } from '../src/core/constants.ts';
import { emptyInput } from '../src/core/types.ts';
import type { CombatState, Hazard, InputState, Weapon } from '../src/core/types.ts';
import { hazardRect } from '../src/sim/combat/step.ts';
import { rectsOverlap } from '../src/sim/physics.ts';
import type { Rect } from '../src/sim/physics.ts';

export interface BotMemory {
  jumpHeld: boolean;
}

export function createBotMemory(): BotMemory {
  return { jumpHeld: false };
}

/** На сколько вперёд экстраполируются летящие снаряды. */
const LOOKAHEAD = 0.35;
/** Запас вокруг игрока: уклоняемся чуть раньше, чем впритык. */
const PAD = 10;
/** Телеграф длиннее этого — ещё рано реагировать. */
const REACT_WINDOW = 0.65;
/** Шаги поиска безопасной точки по горизонтали. */
const SEARCH_STEP = 26;
const SEARCH_MAX = 320;

interface Danger {
  rect: Rect;
  /** Низкая: перепрыгивается. */
  low: boolean;
  /** Низкая и быстрая: убегать бесполезно, догонит — надо прыгать. */
  mustJump: boolean;
  /** Сработает вот-вот — пешком уже не уйти. */
  imminent: boolean;
}

export function botInput(combat: CombatState, weapon: Weapon | null, mem: BotMemory): InputState {
  const input = emptyInput();
  const p = combat.player;
  const boss = combat.boss;

  const dangers = collectDangers(combat);

  if (dangers.length === 0) {
    mem.jumpHeld = false;
    moveToRange(input, combat, weapon);
  } else {
    evade(input, combat, dangers, mem);
  }

  // Атака независима от движения: замах не блокирует ни бег, ни рывок.
  const range = weapon ? weapon.range : 30;
  const reach = boss.w / 2 + range;
  if (p.attackCooldown <= 0 && Math.abs(boss.x - p.x) <= reach && verticalOverlap(p.y, boss)) {
    input.attack = true;
    input.attackPressed = true;
  }

  return input;
}

// ---------------------------------------------------------------------------
// Уклонение
// ---------------------------------------------------------------------------

function evade(input: InputState, combat: CombatState, dangers: Danger[], mem: BotMemory): void {
  const p = combat.player;

  // От быстрой низкой атаки убежать нельзя — она догонит. Прыгаем сразу.
  if (dangers.some((d) => d.mustJump) && p.onGround) {
    input.jump = true;
    input.jumpPressed = !mem.jumpHeld;
    mem.jumpHeld = true;
    return;
  }

  const safeX = findSafeX(p.x, p.y, dangers);

  if (safeX !== null) {
    const dx = safeX - p.x;
    if (Math.abs(dx) < 4) {
      // Уже стоим в безопасном месте — просто не двигаемся.
      mem.jumpHeld = false;
      return;
    }
    if (dx > 0) input.right = true;
    else input.left = true;

    // Далеко и времени нет — рывок и быстрее, и даёт неуязвимость.
    const urgent = dangers.some((d) => d.imminent);
    if (urgent && Math.abs(dx) > 70 && p.dashCooldown <= 0 && p.dashTimer <= 0) {
      input.dash = true;
      input.dashPressed = true;
    }
    mem.jumpHeld = false;
    return;
  }

  // Безопасной точки по горизонтали нет.
  const allLow = dangers.every((d) => d.low);
  if (allLow && p.onGround) {
    input.jump = true;
    input.jumpPressed = !mem.jumpHeld;
    mem.jumpHeld = true;
    return;
  }
  mem.jumpHeld = false;

  // Остаётся рывок на кадрах неуязвимости — это и есть «атака, требующая рывка».
  if (p.dashCooldown <= 0 && p.dashTimer <= 0) {
    input.dash = true;
    input.dashPressed = true;
    // Рвёмся в сторону, где больше места.
    if (p.x < (ARENA.left + ARENA.right) / 2) input.right = true;
    else input.left = true;
  }
}

/** Ближайшая позиция по X, где игрока не заденет ни одна из опасностей. */
function findSafeX(x: number, y: number, dangers: Danger[]): number | null {
  for (let offset = 0; offset <= SEARCH_MAX; offset += SEARCH_STEP) {
    for (const dir of offset === 0 ? [0] : [-1, 1]) {
      const candidate = x + dir * offset;
      if (candidate < ARENA.left + PLAYER.w) continue;
      if (candidate > ARENA.right - PLAYER.w) continue;
      if (isSafe(candidate, y, dangers)) return candidate;
    }
  }
  return null;
}

function isSafe(x: number, y: number, dangers: Danger[]): boolean {
  const me = playerRect(x, y);
  for (const d of dangers) if (rectsOverlap(me, d.rect)) return false;
  return true;
}

function playerRect(x: number, y: number): Rect {
  return {
    x: x - PLAYER.w / 2 - PAD,
    y: y - PLAYER.h - PAD,
    w: PLAYER.w + PAD * 2,
    h: PLAYER.h + PAD * 2,
  };
}

// ---------------------------------------------------------------------------
// Оценка опасностей
// ---------------------------------------------------------------------------

function collectDangers(combat: CombatState): Danger[] {
  const out: Danger[] = [];
  const p = combat.player;
  const me = playerRect(p.x, p.y);

  for (const h of combat.hazards) {
    if (h.telegraph > REACT_WINDOW) continue;

    const rect = sweptRect(h);
    // Далёкие опасности не влияют на выбор точки — иначе бот шарахается от всего.
    if (Math.abs(h.x - p.x) > 460) continue;
    if (h.telegraph <= 0 && !rectsOverlap(rect, playerRect(p.x, p.y))) {
      // Активная опасность, которая уже не заденет — игнорируем.
      if (!willReach(h, me)) continue;
    }

    const low = rect.y + rect.h >= ARENA.groundY - 10 && rect.h <= 60;
    out.push({
      rect,
      low,
      // Волна и пикирование идут быстрее бега — от них уходят вверх, а не вбок.
      mustJump: low && (Math.abs(h.vx) > 250 || h.kind === 'dive'),
      imminent: h.telegraph <= 0.2,
    });
  }

  for (const m of combat.minions) {
    const rect: Rect = { x: m.x - 18, y: m.y - 44, w: 36, h: 44 };
    if (Math.abs(m.x - p.x) > 200) continue;
    out.push({ rect, low: true, mustJump: false, imminent: true });
  }

  return out;
}

/** Прямоугольник, заметённый опасностью за LOOKAHEAD секунд. */
function sweptRect(h: Hazard): Rect {
  const now = hazardRect(h);
  if (h.vx === 0 && h.vy === 0 && h.gravity === 0) return now;

  const t = LOOKAHEAD;
  const fx = now.x + h.vx * t;
  const fy = now.y + h.vy * t + 0.5 * h.gravity * t * t;
  return {
    x: Math.min(now.x, fx),
    y: Math.min(now.y, fy),
    w: Math.abs(fx - now.x) + now.w,
    h: Math.abs(fy - now.y) + now.h,
  };
}

function willReach(h: Hazard, me: Rect): boolean {
  return rectsOverlap(sweptRect(h), me);
}

// ---------------------------------------------------------------------------
// Подход
// ---------------------------------------------------------------------------

/** Держимся у самой границы досягаемости: ближе — лишний риск. */
function moveToRange(input: InputState, combat: CombatState, weapon: Weapon | null): void {
  const p = combat.player;
  const boss = combat.boss;
  const range = weapon ? weapon.range : 30;
  const ideal = boss.w / 2 + range * 0.6;
  const dx = boss.x - p.x;
  const dist = Math.abs(dx);

  if (dist > ideal + 10) {
    if (dx > 0) input.right = true;
    else input.left = true;
  } else if (dist < ideal - 30) {
    if (dx > 0) input.left = true;
    else input.right = true;
  }

  // Гарпия висит в воздухе — иногда нужно подпрыгнуть, чтобы достать.
  if (boss.id === 'harpy' && p.onGround && dist <= ideal + 20 && !verticalOverlap(p.y, boss)) {
    input.jump = true;
    input.jumpPressed = true;
  }
}

function verticalOverlap(playerY: number, boss: { y: number; h: number }): boolean {
  const top = playerY - PLAYER.h;
  return top < boss.y && playerY > boss.y - boss.h;
}
