/**
 * Симуляция боя (§6, §7).
 *
 * Арена — один экран без прокрутки, статичная, с одной платформой посередине.
 * У игрока нет блока и парирования: уклонение — единственная защита.
 */

import { ARENA, FEEL, FISTS, PLAYER, SHAPES, VIEW_H } from '../../core/constants.ts';
import type { Rng } from '../../core/rng.ts';
import type { AttackDir, CombatState, GameState, Hazard, Weapon } from '../../core/types.ts';
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
      dashBuffer: 0,
      attackBuffer: 0,
      dashIFrames: 0,
      attackCooldown: 0,
      attackActive: 0,
      attackAnim: 0,
      attackDir: 'side',
      hitThisSwing: [],
      landImpact: 0,
    },
    boss: createBoss(run.bossId),
    hazards: [],
    minions: [],
    nextEntityId: 1,
    elapsed: 0,
    freeze: 0,
    impacts: [],
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
  stepImpacts(combat, dt);
  if (combat.boss.recoil > 0) {
    combat.boss.recoil = Math.max(0, combat.boss.recoil - FEEL.bossRecoilDecay * dt);
  }
  if (combat.boss.hitFlash > 0) combat.boss.hitFlash -= dt;
  for (const m of combat.minions) {
    if (m.hitFlash > 0) m.hitFlash -= dt;
  }

  // Нажатия читаем ДО заморозки и складываем в буферы.
  //
  // Это не мелочь, а починка настоящего бага: на заморозке шаг боя не идёт,
  // а фронты нажатий игровой цикл всё равно съедает в конце кадра. Тап по рывку
  // или прыжку, пришедшийся на эти 30–120 мс, пропадал совсем — и чем чаще
  // игрок попадал по боссу, тем чаще у него «не срабатывала кнопка».
  bufferInput(combat, state.input);

  // Заморозка кадра: бой стоит целиком. Таймеры выше — косметика (искры, тряска,
  // вспышки), они продолжают идти, иначе попадание выглядело бы застывшим кадром
  // без всякой реакции. Буферы нажатий тоже не тают: время для них стоит вместе
  // с боем.
  if (combat.freeze > 0) {
    combat.freeze -= dt;
    return;
  }

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
// Ощущение удара: заморозка, искры, отдача
// ---------------------------------------------------------------------------

/** Складывает фронты нажатий в буферы. Работает и на замороженном кадре. */
function bufferInput(combat: CombatState, input: GameState['input']): void {
  const p = combat.player;
  if (input.jumpPressed) p.jumpBuffer = PLAYER.jumpBufferTime;
  if (input.dashPressed) p.dashBuffer = PLAYER.dashBufferTime;
  if (input.attackPressed) p.attackBuffer = PLAYER.attackBufferTime;
}

function stepImpacts(combat: CombatState, dt: number): void {
  if (combat.impacts.length === 0) return;
  const alive = [];
  for (const im of combat.impacts) {
    im.life -= dt;
    if (im.life > 0) alive.push(im);
  }
  combat.impacts = alive;
}

/** Ставит отметку попадания — по ней рендер рисует искры. */
function addImpact(
  combat: CombatState,
  x: number,
  y: number,
  dir: 1 | -1,
  kind: 'hit' | 'pogo' | 'hurt' | 'break',
  power: number,
): void {
  combat.impacts.push({
    id: combat.nextEntityId++,
    x,
    y,
    dir,
    kind,
    power: Math.max(0, Math.min(1, power)),
    life: FEEL.impactLife,
  });
  // Отметок может накопиться много только при поломке оружия и добивании;
  // старые всё равно уже почти погасли.
  if (combat.impacts.length > FEEL.maxImpacts) combat.impacts.shift();
}

/** Заморозка берётся по самому тяжёлому событию кадра, а не суммируется. */
function freezeFor(combat: CombatState, seconds: number): void {
  combat.freeze = Math.max(combat.freeze, seconds);
}

/**
 * Длина заморозки: тяжёлый редкий удар держит кадр дольше частого лёгкого.
 * Иначе клинки с их 2.5 удара в секунду превращали бой в мигание, а молот
 * ощущался бы точно так же, как они.
 */
function hitstopForDamage(damage: number, interval: number): number {
  const weight = Math.min(2, interval / FEEL.hitstopIntervalRef);
  return Math.min(FEEL.hitstopMax, FEEL.hitstopBase * weight + damage * FEEL.hitstopPerDamage);
}

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

  if (p.dashBuffer > 0) p.dashBuffer -= dt;
  if (p.attackBuffer > 0) p.attackBuffer -= dt;

  // Рывок: короткий, с окном неуязвимости 0.15 с (§7).
  if (p.dashBuffer > 0 && p.dashCooldown <= 0 && p.dashTimer <= 0) {
    p.dashBuffer = 0;
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

    // Наполняет буфер bufferInput — здесь он только тает.
    if (p.jumpBuffer > 0) p.jumpBuffer -= dt;

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

  const fallSpeed = p.vy;
  const wasAirborne = !p.onGround;
  moveInArena(p, dt, input.down);
  // Приземление: рендер поднимает пыль, если падали быстро.
  p.landImpact = wasAirborne && p.onGround && fallSpeed > FEEL.landDustSpeed ? fallSpeed : 0;

  // Атака. Как и кирка, повторяется, пока кнопка зажата.
  //
  // Направление берётся из зажатых стрелок: вверх — над головой, вниз в воздухе —
  // тот самый удар с отскоком. На земле удар вниз смысла не имеет, поэтому там
  // он остаётся боковым.
  // Удержание ИЛИ буферизованное нажатие: короткий тап, пришедшийся на заморозку
  // кадра, обязан сработать так же, как зажатая кнопка.
  if ((input.attack || p.attackBuffer > 0) && p.attackCooldown <= 0) {
    p.attackBuffer = 0;
    const interval = weapon ? weapon.interval : FISTS.interval;
    p.attackCooldown = interval;
    p.attackActive = Math.min(SWING_WINDOW, interval * 0.6);
    p.attackAnim = Math.min(0.25, interval * 0.8);
    p.attackDir = swingDirection(input.up, input.down, p.onGround);
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

/** Куда бьём: вверх, вниз (только в воздухе) или в сторону. */
function swingDirection(up: boolean, down: boolean, onGround: boolean): AttackDir {
  if (down && !onGround) return 'down';
  if (up) return 'up';
  return 'side';
}

function swingRect(combat: CombatState, weapon: Weapon | null): Rect {
  const p = combat.player;
  const range = weapon ? weapon.range : FISTS.range;
  const hitH = weapon ? SHAPES[weapon.shape].hitH : FISTS.hitH;
  const cy = p.y - PLAYER.h / 2;

  // Вертикальные удары бьют уже, но дальше: замах уходит вверх или под ноги.
  if (p.attackDir === 'up') {
    return { x: p.x - hitH / 2, y: p.y - PLAYER.h - range, w: hitH, h: range };
  }
  if (p.attackDir === 'down') {
    return { x: p.x - hitH / 2, y: p.y, w: hitH, h: range };
  }

  return {
    x: p.facing > 0 ? p.x : p.x - range,
    y: cy - hitH / 2,
    w: range,
    h: hitH,
  };
}

/**
 * Отскок от удара вниз.
 *
 * Ради него и стоит бить в воздухе: попал по боссу, снаряду или прислужнику —
 * подпрыгнул и остался наверху, промахнулся — падаешь ровно туда, откуда бил.
 * Это единственный способ висеть над ареной долго, и он требует точности.
 */
function pogo(combat: CombatState, x: number, y: number): void {
  const p = combat.player;
  p.vy = -FEEL.pogoVelocity;
  p.onGround = false;
  p.jumpCutLock = PLAYER.jumpMinHold;
  if (FEEL.pogoRefundsDash) p.dashCooldown = 0;
  combat.shake = Math.min(1, combat.shake + FEEL.shakePogo);
  addImpact(combat, x, y, p.facing, 'pogo', 0.7);
}

/** Отдача: попадание толкает бьющего назад. В воздухе — сильнее. */
function recoil(combat: CombatState, weapon: Weapon | null): void {
  const p = combat.player;
  if (p.attackDir === 'down') return; // вниз бьём с отскоком, а не с отдачей
  const base = p.onGround ? FEEL.recoilGround : FEEL.recoilAir;
  const mult = weapon && weapon.shape === 'heavy' ? FEEL.recoilHeavyMult : 1;
  const dir = p.attackDir === 'up' ? 0 : -p.facing;
  p.vx = dir * base * mult;
}

function resolveSwing(combat: CombatState, weapon: Weapon | null): void {
  const p = combat.player;
  const rect = swingRect(combat, weapon);
  let connected = false;
  let pogoed = false;

  const boss = combat.boss;
  const bossRect = bodyRect(boss.x, boss.y, boss.w, boss.h);
  if (p.hitThisSwing.indexOf(0) < 0 && rectsOverlap(rect, bossRect)) {
    p.hitThisSwing.push(0);
    connected = true;

    let dealt: number;
    if (weapon) {
      const dmg = computeDamage(weapon, boss.armor, boss.shield);
      dealt = dmg.total;
      boss.hp = Math.max(0, boss.hp - dealt);
      combat.damageDealt += dealt;
      if (weapon.lifesteal > 0) {
        p.hp = Math.min(p.hpMax, p.hp + lifestealFor(weapon, dealt));
      }
    } else {
      // Кулаки бьют как чистая физика и упираются во все защиты.
      dealt = FISTS.damage * (1 - boss.armor) * (1 - boss.shield);
      boss.hp = Math.max(0, boss.hp - dealt);
      combat.damageDealt += dealt;
    }

    boss.hitFlash = 0.12;
    boss.recoil = FEEL.bossRecoil;
    combat.shake = Math.min(1, combat.shake + FEEL.shakeHit);
    freezeFor(combat, hitstopForDamage(dealt, weapon ? weapon.interval : FISTS.interval));
    addImpact(
      combat,
      contactX(rect, boss.x),
      contactY(rect, boss.y - boss.h / 2),
      p.facing,
      'hit',
      Math.min(1, dealt / 60),
    );
  }

  for (const m of combat.minions) {
    if (p.hitThisSwing.indexOf(m.id) >= 0) continue;
    const mr = bodyRect(m.x, m.y, 30, 40);
    if (!rectsOverlap(rect, mr)) continue;
    p.hitThisSwing.push(m.id);
    connected = true;
    m.hp -= weapon ? weapon.damage : FISTS.damage;
    m.hitFlash = 0.12;
    // Прислужник лёгкий — его по-настоящему отбрасывает.
    m.vx = sign(m.x - p.x || p.facing) * FEEL.minionKnockback;
    freezeFor(combat, FEEL.hitstopBase);
    addImpact(combat, m.x, m.y - 20, p.facing, 'hit', 0.4);
  }
  combat.minions = combat.minions.filter((m) => m.hp > 0);

  // Отскок от снаряда. Сбивать снаряды боковым ударом нельзя — иначе зажатая
  // кнопка выметала бы веер перьев, и уклонение перестало бы быть нужным.
  // Ударом вниз — можно, и это единственный способ остаться в воздухе.
  if (p.attackDir === 'down' && !p.onGround) {
    for (const h of combat.hazards) {
      if (h.telegraph > 0 || h.spent || !isPogoable(h)) continue;
      if (p.hitThisSwing.indexOf(h.id) >= 0) continue;
      if (!rectsOverlap(rect, hazardRect(h))) continue;

      p.hitThisSwing.push(h.id);
      // Летящий снаряд от такого удара разбивается, столб огня — нет.
      // Разбитый снаряд помечаем потраченным: он уже не тело, а обломки,
      // и бить игрока в том же кадре не должен.
      if (h.kind === 'rock' || h.kind === 'feather') {
        h.life = 0;
        h.spent = true;
      }
      freezeFor(combat, FEEL.hitstopBase);
      pogo(combat, h.x, h.y - h.h / 2);
      connected = true;
      pogoed = true;
      break;
    }
  }

  if (connected && !pogoed) {
    if (p.attackDir === 'down' && !p.onGround) pogo(combat, p.x, p.y + 10);
    else recoil(combat, weapon);
  }

  // Прочность тратится за попадание, а не за замах: промах ничего не стоит.
  if (connected && weapon) {
    weapon.durability -= weapon.durabilityCost;
    if (weapon.durability <= 0) {
      weapon.durability = 0;
      combat.weaponBroken = true;
      combat.shake = 1;
      freezeFor(combat, FEEL.hitstopFinish);
      addImpact(combat, p.x, p.y - PLAYER.h / 2, p.facing, 'break', 1);
    }
  }
}

/** От чего можно оттолкнуться ударом вниз. Луч и вихрь — нет: это не тела. */
function isPogoable(h: Hazard): boolean {
  return h.kind === 'rock' || h.kind === 'feather' || h.kind === 'pillar' || h.kind === 'wave';
}

/** Точка контакта: середина пересечения замаха и цели, чтобы искры били по месту. */
function contactX(rect: Rect, targetX: number): number {
  return clamp(targetX, rect.x, rect.x + rect.w);
}

function contactY(rect: Rect, targetY: number): number {
  return clamp(targetY, rect.y, rect.y + rect.h);
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
        damagePlayer(state, combat, h.damage, h.x);
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
    damagePlayer(state, combat, minionDamage(), m.x);
    break;
  }
}

/**
 * Урон игроку.
 *
 * Пропущенный удар — самое важное событие боя, поэтому он читается сильнее
 * своего: длиннее заморозка, полная тряска и отбрасывание от источника.
 * Отбрасывание — не только косметика: оно выносит из зоны, где игрока добьют
 * второй раз, но и отнимает у него позицию, которую он занимал.
 */
function damagePlayer(
  state: GameState,
  combat: CombatState,
  amount: number,
  sourceX: number,
): void {
  const p = combat.player;
  p.hp = Math.max(0, p.hp - amount);
  p.invuln = PLAYER.hitInvuln;
  combat.shake = FEEL.shakeHurt;

  const away = sign(p.x - sourceX) || -p.facing;
  p.vx = away * FEEL.hurtKnockback;
  p.vy = -FEEL.hurtLift;
  p.dashTimer = 0;

  freezeFor(combat, FEEL.hitstopHurt);
  addImpact(combat, p.x, p.y - PLAYER.h / 2, away > 0 ? 1 : -1, 'hurt', Math.min(1, amount / 25));

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
    // Добивание держим дольше любого другого удара: это конец забега.
    combat.freeze = Math.max(combat.freeze, FEEL.hitstopFinish);
    addImpact(combat, combat.boss.x, combat.boss.y - combat.boss.h / 2, 1, 'break', 1);
    return;
  }
  if (combat.player.hp <= 0) {
    combat.outcome = 'lost';
    combat.outcomeTimer = OUTCOME_DELAY;
    combat.shake = 1;
    combat.freeze = Math.max(combat.freeze, FEEL.hitstopFinish);
  }
}

/** Используется балансировщиком: бой закончился и пора снимать результат. */
export function combatFinished(combat: CombatState): boolean {
  return combat.outcome !== 'fight' && combat.outcomeTimer <= 0;
}

export function bossRng(state: GameState): Rng {
  return state.rng;
}
