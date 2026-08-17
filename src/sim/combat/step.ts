/**
 * Симуляция боя (§6, §7).
 *
 * Арена — один экран без прокрутки, статичная, с одной платформой посередине.
 * У игрока нет блока и парирования: уклонение — единственная защита.
 */

import { ARENA, FISTS, PLAYER, SHAPES, VIEW_H } from '../../core/constants.ts';
import type { Rng } from '../../core/rng.ts';
import type { CombatState, GameState, Hazard, Weapon } from '../../core/types.ts';
import { bodyRect, clamp, rectsOverlap, sign } from '../physics.ts';
import type { Rect } from '../physics.ts';
import { createBoss, minionDamage, stepBoss, stepMinions } from './bosses.ts';
import { computeDamage, lifestealFor } from './damage.ts';

/** Пауза после исхода боя — чтобы досмотреть добивание, а не прыгнуть в меню. */
const OUTCOME_DELAY = 1.5;
/** Хитбокс атаки активен не весь интервал, а короткое окно в начале. */
const SWING_WINDOW = 0.12;

export function createCombat(state: GameState): CombatState {
  const run = state.run;
  if (!run) throw new Error('createCombat: нет активного забега');

  const x = ARENA.left + 130;
  return {
    player: {
      x,
      y: ARENA.groundY,
      vx: 0,
      vy: 0,
      px: x,
      py: ARENA.groundY,
      facing: 1,
      onGround: true,
      hp: run.hp,
      hpMax: run.hpMax,
      coyote: 0,
      jumpBuffer: 0,
      jumpCutLock: 0,
      invuln: 0,
      dashCooldown: 0,
      dashTimer: 0,
      dashIFrames: 0,
      attackCooldown: 0,
      attackActive: 0,
      attackAnim: 0,
      hitThisSwing: [],
    },
    boss: createBoss(run.bossId),
    hazards: [],
    minions: [],
    nextEntityId: 1,
    elapsed: 0,
    outcome: 'fight',
    outcomeTimer: 0,
    shake: 0,
    damageDealt: 0,
    weaponBroken: false,
  };
}

export function stepCombat(state: GameState, dt: number): void {
  const combat = state.combat;
  const run = state.run;
  if (!combat || !run) return;

  if (combat.shake > 0) combat.shake = Math.max(0, combat.shake - dt * 3);

  if (combat.outcome !== 'fight') {
    combat.outcomeTimer -= dt;
    stepHazards(state, combat, dt);
    return;
  }

  combat.elapsed += dt;
  stepPlayer(state, combat, dt);
  stepBoss(combat, state.rng, dt);
  stepMinions(combat, dt);
  stepHazards(state, combat, dt);
  stepMinionContact(state, combat);
  resolveOutcome(combat);

  run.hp = combat.player.hp;
}

// ---------------------------------------------------------------------------
// Игрок
// ---------------------------------------------------------------------------

function activeWeapon(state: GameState): Weapon | null {
  const w = state.run?.weapon ?? null;
  if (!w || w.durability <= 0) return null;
  return w;
}

function stepPlayer(state: GameState, combat: CombatState, dt: number): void {
  const p = combat.player;
  const input = state.input;
  const weapon = activeWeapon(state);

  p.px = p.x;
  p.py = p.y;

  if (p.invuln > 0) p.invuln -= dt;
  if (p.dashCooldown > 0) p.dashCooldown -= dt;
  if (p.dashIFrames > 0) p.dashIFrames -= dt;
  if (p.attackCooldown > 0) p.attackCooldown -= dt;
  if (p.attackActive > 0) p.attackActive -= dt;
  if (p.attackAnim > 0) p.attackAnim -= dt;

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  // Рывок: короткий, с окном неуязвимости 0.15 с (§7).
  if (input.dashPressed && p.dashCooldown <= 0 && p.dashTimer <= 0) {
    p.dashTimer = PLAYER.dashDuration;
    p.dashIFrames = PLAYER.dashIFrames;
    p.dashCooldown = PLAYER.dashCooldown;
    if (dir !== 0) p.facing = dir > 0 ? 1 : -1;
  }

  if (p.dashTimer > 0) {
    p.dashTimer -= dt;
    p.vx = p.facing * PLAYER.dashSpeed;
    p.vy = 0;
  } else {
    if (dir !== 0) {
      const accel = p.onGround ? PLAYER.accel : PLAYER.airAccel;
      p.vx += dir * accel * dt;
      p.vx = clamp(p.vx, -PLAYER.moveSpeed, PLAYER.moveSpeed);
      p.facing = dir > 0 ? 1 : -1;
    } else {
      if (p.onGround) {
        const drop = PLAYER.friction * dt;
        p.vx = p.vx > 0 ? Math.max(0, p.vx - drop) : Math.min(0, p.vx + drop);
      }
      // Стоим на месте — разворачиваемся к боссу, чтобы удар не уходил в пустоту.
      if (Math.abs(p.vx) < 20) p.facing = combat.boss.x < p.x ? -1 : 1;
    }

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
    if (p.jumpCutLock > 0) p.jumpCutLock -= dt;
    else if (!input.jump && p.vy < 0) p.vy *= Math.pow(PLAYER.jumpCutMultiplier, dt * 60);

    p.vy = Math.min(p.vy + PLAYER.gravity * dt, PLAYER.maxFall);
  }

  moveInArena(p, dt, input.down);

  // Атака. Как и кирка, повторяется, пока кнопка зажата.
  if (input.attack && p.attackCooldown <= 0) {
    const interval = weapon ? weapon.interval : FISTS.interval;
    p.attackCooldown = interval;
    p.attackActive = Math.min(SWING_WINDOW, interval * 0.6);
    p.attackAnim = Math.min(0.25, interval * 0.8);
    p.hitThisSwing = [];
  }

  if (p.attackActive > 0) resolveSwing(combat, weapon);
}

function moveInArena(
  p: { x: number; y: number; vx: number; vy: number; onGround: boolean },
  dt: number,
  dropThrough: boolean,
): void {
  p.x += p.vx * dt;
  p.x = clamp(p.x, ARENA.left + PLAYER.w / 2, ARENA.right - PLAYER.w / 2);

  const prevY = p.y;
  p.y += p.vy * dt;
  p.onGround = false;

  // Платформа посередине — односторонняя: сквозь неё можно запрыгнуть снизу
  // и спрыгнуть вниз, зажав «вниз».
  if (
    !dropThrough &&
    p.vy > 0 &&
    prevY <= ARENA.platformY &&
    p.y >= ARENA.platformY &&
    p.x + PLAYER.w / 2 > ARENA.platformX1 &&
    p.x - PLAYER.w / 2 < ARENA.platformX2
  ) {
    p.y = ARENA.platformY;
    p.vy = 0;
    p.onGround = true;
  }

  if (p.y >= ARENA.groundY) {
    p.y = ARENA.groundY;
    p.vy = 0;
    p.onGround = true;
  }
  if (p.y - PLAYER.h < ARENA.ceiling) {
    p.y = ARENA.ceiling + PLAYER.h;
    if (p.vy < 0) p.vy = 0;
  }
}

// ---------------------------------------------------------------------------
// Удар игрока
// ---------------------------------------------------------------------------

function swingRect(combat: CombatState, weapon: Weapon | null): Rect {
  const p = combat.player;
  const range = weapon ? weapon.range : FISTS.range;
  const hitH = weapon ? SHAPES[weapon.shape].hitH : FISTS.hitH;
  const cy = p.y - PLAYER.h / 2;
  return {
    x: p.facing > 0 ? p.x : p.x - range,
    y: cy - hitH / 2,
    w: range,
    h: hitH,
  };
}

function resolveSwing(combat: CombatState, weapon: Weapon | null): void {
  const p = combat.player;
  const rect = swingRect(combat, weapon);
  let connected = false;

  const boss = combat.boss;
  const bossRect = bodyRect(boss.x, boss.y, boss.w, boss.h);
  if (p.hitThisSwing.indexOf(0) < 0 && rectsOverlap(rect, bossRect)) {
    p.hitThisSwing.push(0);
    connected = true;

    if (weapon) {
      const dmg = computeDamage(weapon, boss.armor, boss.shield);
      boss.hp = Math.max(0, boss.hp - dmg.total);
      combat.damageDealt += dmg.total;
      if (weapon.lifesteal > 0) {
        p.hp = Math.min(p.hpMax, p.hp + lifestealFor(weapon, dmg.total));
      }
    } else {
      // Кулаки бьют как чистая физика и упираются во все защиты.
      const dmg = FISTS.damage * (1 - boss.armor) * (1 - boss.shield);
      boss.hp = Math.max(0, boss.hp - dmg);
      combat.damageDealt += dmg;
    }

    boss.hitFlash = 0.12;
    combat.shake = Math.min(1, combat.shake + 0.35);
  }

  for (const m of combat.minions) {
    if (p.hitThisSwing.indexOf(m.id) >= 0) continue;
    const mr = bodyRect(m.x, m.y, 30, 40);
    if (!rectsOverlap(rect, mr)) continue;
    p.hitThisSwing.push(m.id);
    connected = true;
    m.hp -= weapon ? weapon.damage : FISTS.damage;
    m.hitFlash = 0.12;
  }
  combat.minions = combat.minions.filter((m) => m.hp > 0);

  // Прочность тратится за попадание, а не за замах: промах ничего не стоит.
  if (connected && weapon) {
    weapon.durability -= weapon.durabilityCost;
    if (weapon.durability <= 0) {
      weapon.durability = 0;
      combat.weaponBroken = true;
      combat.shake = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Опасности
// ---------------------------------------------------------------------------

export function hazardRect(h: Hazard): Rect {
  return { x: h.x - h.w / 2, y: h.y - h.h, w: h.w, h: h.h };
}

function stepHazards(state: GameState, combat: CombatState, dt: number): void {
  const p = combat.player;
  const boss = combat.boss;
  const alive: Hazard[] = [];

  for (const h of combat.hazards) {
    h.px = h.x;
    h.py = h.y;

    // Пикирование Гарпии — хитбокс висит на самой Гарпии.
    // Скорость копируем с босса: без неё опасность выглядит стоящей на месте
    // и для рендера, и для бота, хотя летит через весь экран.
    if (h.kind === 'dive') {
      h.x = boss.x;
      h.y = boss.y;
      h.vx = boss.vx;
    }

    if (h.telegraph > 0) {
      h.telegraph -= dt;
      alive.push(h);
      continue;
    }

    if (h.kind !== 'dive' && h.kind !== 'pillar' && h.kind !== 'beam') {
      h.vy += h.gravity * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
    }

    h.life -= dt;

    // Камень разбивается о землю, снаряды исчезают за краем арены.
    if (h.kind === 'rock' && h.y >= ARENA.groundY) h.life = 0;
    if (h.x < ARENA.left - 120 || h.x > ARENA.right + 120) h.life = 0;
    if (h.y > VIEW_H + 80 || h.y < -80) h.life = 0;

    if (!h.spent && combat.outcome === 'fight' && p.invuln <= 0 && p.dashIFrames <= 0) {
      const pr = bodyRect(p.x, p.y, PLAYER.w, PLAYER.h);
      if (rectsOverlap(hazardRect(h), pr)) {
        h.spent = true;
        damagePlayer(state, combat, h.damage);
        if (h.kind === 'gust') {
          // Вихрь отталкивает — это его смысл, а не просто урон.
          p.vx = sign(h.vx || 1) * 420;
          p.vy = -260;
        }
      }
    }

    if (h.life > 0) alive.push(h);
  }

  combat.hazards = alive;
}

function stepMinionContact(state: GameState, combat: CombatState): void {
  const p = combat.player;
  if (p.invuln > 0 || p.dashIFrames > 0) return;

  const pr = bodyRect(p.x, p.y, PLAYER.w, PLAYER.h);
  for (const m of combat.minions) {
    if (m.attackTimer > 0) continue;
    if (!rectsOverlap(pr, bodyRect(m.x, m.y, 30, 40))) continue;
    m.attackTimer = 1.1;
    damagePlayer(state, combat, minionDamage());
    break;
  }
}

function damagePlayer(state: GameState, combat: CombatState, amount: number): void {
  const p = combat.player;
  p.hp = Math.max(0, p.hp - amount);
  p.invuln = PLAYER.hitInvuln;
  combat.shake = 1;
  if (state.run) state.run.hp = p.hp;
}

// ---------------------------------------------------------------------------
// Исход
// ---------------------------------------------------------------------------

function resolveOutcome(combat: CombatState): void {
  if (combat.outcome !== 'fight') return;

  if (combat.boss.hp <= 0) {
    combat.outcome = 'won';
    combat.outcomeTimer = OUTCOME_DELAY;
    combat.minions = [];
    combat.shake = 1;
    return;
  }
  if (combat.player.hp <= 0) {
    combat.outcome = 'lost';
    combat.outcomeTimer = OUTCOME_DELAY;
    combat.shake = 1;
  }
}

/** Используется балансировщиком: бой закончился и пора снимать результат. */
export function combatFinished(combat: CombatState): boolean {
  return combat.outcome !== 'fight' && combat.outcomeTimer <= 0;
}

export function bossRng(state: GameState): Rng {
  return state.rng;
}
