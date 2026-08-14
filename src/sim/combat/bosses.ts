/**
 * Поведение боссов (§6).
 *
 * Общая схема для всех троих — конечный автомат:
 *   idle → telegraph → active → recover → idle
 *
 * Требование дизайн-документа: телеграф каждой атаки минимум 0.5 с и читается
 * цветом. Опасности, которые появляются заранее (удар сверху, столбы огня, луч),
 * рисуются красным контуром сами; для снарядов телеграфом служит стадия замаха
 * босса, которую рендер подсвечивает тем же красным.
 */

import { ABYSS_PHASE2_THRESHOLD, ABYSS_SHIELD, ARENA, BOSSES, PLAYER } from '../../core/constants.ts';
import { nextRange, pickWeighted } from '../../core/rng.ts';
import type { Rng } from '../../core/rng.ts';
import type { BossId, BossState, CombatState, Hazard, Minion } from '../../core/types.ts';
import { clamp, sign } from '../physics.ts';

// ---------------------------------------------------------------------------
// Тайминги атак
// ---------------------------------------------------------------------------

interface ActionTiming {
  telegraph: number;
  active: number;
  recover: number;
  gap: number;
}

const TIMINGS: Record<string, ActionTiming> = {
  // Каменный Голем — медленный, длинные окна для контратаки.
  slam: { telegraph: 0.85, active: 0.3, recover: 0.9, gap: 0.6 },
  wave: { telegraph: 0.7, active: 0.25, recover: 0.8, gap: 0.6 },
  rock: { telegraph: 0.65, active: 0.2, recover: 0.7, gap: 0.7 },
  // Пепельная Гарпия. «Быстрая, короткие окна» — это про длину телеграфа
  // (0.5–0.6 с против 0.65–0.85 у Голема), а не про полное отсутствие пауз:
  // без окон на контратаку вампиризм кровавого железа не успевает окупаться,
  // и «ответ» на этого босса перестаёт работать.
  dive: { telegraph: 0.55, active: 0.75, recover: 0.6, gap: 0.45 },
  feathers: { telegraph: 0.5, active: 0.2, recover: 0.45, gap: 0.4 },
  gust: { telegraph: 0.6, active: 0.35, recover: 0.5, gap: 0.45 },
  // Повелитель Бездны.
  pillars: { telegraph: 0.9, active: 0.5, recover: 0.7, gap: 0.5 },
  beam: { telegraph: 0.85, active: 0.6, recover: 0.8, gap: 0.6 },
  summon: { telegraph: 0.7, active: 0.2, recover: 0.6, gap: 0.6 },
};

const DAMAGE = {
  slam: 24,
  wave: 18,
  rock: 20,
  dive: 14,
  feather: 12,
  gust: 13,
  pillar: 22,
  beam: 25,
  minion: 12,
};

const MINION_HP = 60;

// ---------------------------------------------------------------------------
// Создание
// ---------------------------------------------------------------------------

export function createBoss(id: BossId): BossState {
  const def = BOSSES[id];
  const x = ARENA.right - 180;
  const y = id === 'harpy' ? ARENA.groundY - 150 : ARENA.groundY;

  return {
    id,
    x,
    y,
    px: x,
    py: y,
    w: def.w,
    h: def.h,
    facing: -1,
    hp: def.hp,
    hpMax: def.hp,
    armor: def.armor,
    shield: 0,
    phase: 1,
    action: 'none',
    stage: 'idle',
    stageTimer: 0,
    actionCooldown: 1.2,
    hitFlash: 0,
    counter: 0,
    vx: 0,
    vy: 0,
  };
}

// ---------------------------------------------------------------------------
// Общий шаг
// ---------------------------------------------------------------------------

export function stepBoss(combat: CombatState, rng: Rng, dt: number): void {
  const boss = combat.boss;
  boss.px = boss.x;
  boss.py = boss.y;
  if (boss.hitFlash > 0) boss.hitFlash -= dt;

  boss.facing = combat.player.x < boss.x ? -1 : 1;

  if (boss.id === 'abyss') updateAbyssPhase(boss);

  switch (boss.stage) {
    case 'idle':
      moveIdle(combat, boss, dt);
      boss.actionCooldown -= dt;
      if (boss.actionCooldown <= 0) startAction(combat, boss, rng);
      break;

    case 'telegraph':
      boss.stageTimer -= dt;
      if (boss.stageTimer <= 0) {
        boss.stage = 'active';
        boss.stageTimer = TIMINGS[boss.action].active;
        onActiveStart(combat, boss, rng);
      }
      break;

    case 'active':
      onActiveTick(combat, boss, dt);
      boss.stageTimer -= dt;
      if (boss.stageTimer <= 0) {
        if (boss.action === 'dive') endDive(combat);
        boss.stage = 'recover';
        boss.stageTimer = TIMINGS[boss.action].recover;
        onActiveEnd(boss);
      }
      break;

    case 'recover':
      boss.stageTimer -= dt;
      if (boss.stageTimer <= 0) {
        boss.stage = 'idle';
        boss.actionCooldown = gapFor(boss);
        boss.action = 'none';
      }
      break;
  }

  clampBoss(boss);
}

function gapFor(boss: BossState): number {
  const base = TIMINGS[boss.action]?.gap ?? 0.6;
  // Во второй фазе Повелитель давит сильнее.
  return boss.id === 'abyss' && boss.phase === 2 ? Math.max(0.25, base - 0.15) : base;
}

function clampBoss(boss: BossState): void {
  boss.x = clamp(boss.x, ARENA.left + boss.w / 2, ARENA.right - boss.w / 2);
  if (boss.id === 'harpy') {
    // Нижняя граница — пол: только на пикировании Гарпия опускается так низко.
    boss.y = clamp(boss.y, ARENA.ceiling + boss.h, ARENA.groundY);
  } else {
    boss.y = ARENA.groundY;
  }
}

function updateAbyssPhase(boss: BossState): void {
  if (boss.phase === 1 && boss.hp <= boss.hpMax * ABYSS_PHASE2_THRESHOLD) {
    boss.phase = 2;
    boss.shield = ABYSS_SHIELD;
  }
}

// ---------------------------------------------------------------------------
// Выбор действия
// ---------------------------------------------------------------------------

function startAction(combat: CombatState, boss: BossState, rng: Rng): void {
  const action = chooseAction(combat, boss, rng);
  boss.action = action;
  boss.stage = 'telegraph';
  boss.stageTimer = TIMINGS[action].telegraph;
  boss.counter = 0;
  onTelegraphStart(combat, boss, rng);
}

function chooseAction(combat: CombatState, boss: BossState, rng: Rng): string {
  const dx = Math.abs(combat.player.x - boss.x);

  if (boss.id === 'golem') {
    // Вблизи — удар сверху, издалека — камень; волна работает на любой дистанции.
    const actions = ['slam', 'wave', 'rock'];
    const weights = [dx < 190 ? 55 : 8, 30, dx > 260 ? 45 : 15];
    return pickWeighted(rng, actions, weights);
  }

  if (boss.id === 'harpy') {
    const actions = ['dive', 'feathers', 'gust'];
    const weights = [40, 40, dx < 200 ? 35 : 12];
    return pickWeighted(rng, actions, weights);
  }

  // Повелитель Бездны: во второй фазе меньше призывов, больше давления.
  const actions = ['pillars', 'beam', 'summon'];
  const alive = combat.minions.length;
  const weights =
    boss.phase === 1 ? [45, 25, alive > 0 ? 0 : 30] : [50, 40, alive > 0 ? 0 : 14];
  return pickWeighted(rng, actions, weights);
}

// ---------------------------------------------------------------------------
// Перемещение вне атак
// ---------------------------------------------------------------------------

function moveIdle(combat: CombatState, boss: BossState, dt: number): void {
  const player = combat.player;

  if (boss.id === 'golem') {
    // Тяжёлый шаг: подходит медленно, не поджимая игрока вплотную.
    const want = player.x + (boss.x < player.x ? -170 : 170);
    boss.x += sign(want - boss.x) * 42 * dt;
    return;
  }

  if (boss.id === 'harpy') {
    const targetX = player.x + (boss.x < player.x ? -150 : 150);
    boss.x += sign(targetX - boss.x) * 150 * dt;
    // Покачивание в воздухе — читается как «висит», а не «застыла».
    boss.counter += dt;
    const targetY = ARENA.groundY - 170 + Math.sin(boss.counter * 2.2) * 22;
    boss.y += (targetY - boss.y) * Math.min(1, dt * 3);
    return;
  }

  const targetX = player.x + (boss.x < player.x ? -220 : 220);
  boss.x += sign(targetX - boss.x) * 55 * dt;
}

// ---------------------------------------------------------------------------
// Стадии атак
// ---------------------------------------------------------------------------

function onTelegraphStart(combat: CombatState, boss: BossState, rng: Rng): void {
  switch (boss.action) {
    case 'gust': {
      // Зона вихря видна весь замах (0.6 с). Раньше она возникала мгновенно
      // в момент удара — уйти из прямоугольника 300×210 было физически нельзя.
      const dir = sign(combat.player.x - boss.x) || 1;
      spawn(combat, {
        kind: 'gust',
        x: boss.x + dir * 150,
        y: ARENA.groundY,
        w: 300,
        h: 210,
        damage: DAMAGE.gust,
        vx: dir * 60,
        telegraph: TIMINGS.gust.telegraph,
        life: TIMINGS.gust.active,
      });
      break;
    }
    case 'dive':
      // Гарпия падает на линию пола ещё во время замаха. Линия всегда одна и та же,
      // и её видно 0.55 с — пикирование читается и перепрыгивается. Довыцеливание
      // по высоте игрока сделало бы телеграф бессмысленным.
      boss.y = ARENA.groundY;
      break;
    case 'slam': {
      // Опасная зона видна всё время замаха — 0.85 с красного контура.
      const x = boss.x + boss.facing * 92;
      spawn(combat, {
        kind: 'pillar',
        x,
        y: ARENA.groundY,
        w: 168,
        h: 140,
        damage: DAMAGE.slam,
        telegraph: TIMINGS.slam.telegraph,
        life: TIMINGS.slam.active,
      });
      break;
    }
    case 'pillars': {
      const count = boss.phase === 1 ? 3 : 5;
      const spread = boss.phase === 1 ? 150 : 120;
      for (let i = 0; i < count; i++) {
        // Столбы ставятся вокруг игрока, но с разбросом — чтобы был выход.
        const offset = (i - (count - 1) / 2) * spread + nextRange(rng, -26, 26);
        spawn(combat, {
          kind: 'pillar',
          x: clamp(combat.player.x + offset, ARENA.left + 30, ARENA.right - 30),
          y: ARENA.groundY,
          w: 62,
          h: 190,
          damage: DAMAGE.pillar,
          telegraph: TIMINGS.pillars.telegraph,
          life: TIMINGS.pillars.active,
        });
      }
      break;
    }
    case 'beam': {
      // §6: луч — атака, «требующая рывка». Он бьёт на высоте пояса от Повелителя
      // в сторону игрока и до самого края арены, поэтому убежать по горизонтали
      // нельзя: единственное безопасное место — за спиной босса, а попасть туда
      // можно только рывком сквозь луч, на кадрах неуязвимости.
      // Луч намеренно НЕ перекрывает всю арену: иначе уклонение было бы
      // невозможно — 0.15 с неуязвимости не покрывают 0.6 с активной фазы.
      const dir = boss.facing;
      const edge = dir > 0 ? ARENA.right : ARENA.left;
      const width = Math.abs(edge - boss.x);
      spawn(combat, {
        kind: 'beam',
        x: boss.x + (dir * width) / 2,
        y: ARENA.groundY,
        // Высокий и до самого пола: перепрыгнуть нельзя, отсидеться негде.
        // Уйти можно только за спину Повелителю, а на это 0.85 с телеграфа
        // хватает ровно с рывком — отсюда «атака, требующая рывка».
        w: width,
        h: 150,
        damage: DAMAGE.beam,
        telegraph: TIMINGS.beam.telegraph,
        life: TIMINGS.beam.active,
      });
      break;
    }
    default:
      break;
  }
}

function onActiveStart(combat: CombatState, boss: BossState, rng: Rng): void {
  switch (boss.action) {
    case 'wave': {
      const dir = boss.facing;
      spawn(combat, {
        kind: 'wave',
        x: boss.x + dir * 60,
        y: ARENA.groundY,
        w: 46,
        h: 44,
        vx: dir * 300,
        damage: DAMAGE.wave,
        life: 4,
      });
      break;
    }
    case 'rock': {
      // Навесом в текущую позицию игрока: успеть уйти можно, если читать замах.
      const dx = combat.player.x - boss.x;
      const t = 1.05;
      const g = 900;
      spawn(combat, {
        kind: 'rock',
        x: boss.x + boss.facing * 40,
        y: ARENA.groundY - boss.h * 0.75,
        w: 30,
        h: 30,
        vx: dx / t,
        vy: -g * t * 0.5,
        gravity: g,
        damage: DAMAGE.rock,
        life: 4,
      });
      break;
    }
    case 'feathers': {
      const count = 5;
      // Веер целится в корпус игрока, а не в ступни.
      const originY = boss.y - boss.h / 2;
      const targetY = combat.player.y - PLAYER.h / 2;
      const baseAngle = Math.atan2(targetY - originY, combat.player.x - boss.x);
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + (i - (count - 1) / 2) * 0.16;
        const speed = 330;
        spawn(combat, {
          kind: 'feather',
          x: boss.x,
          y: boss.y - boss.h / 2,
          w: 22,
          h: 10,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          damage: DAMAGE.feather,
          life: 3,
        });
      }
      break;
    }
    case 'dive': {
      // Хитбокс пикирования привязан к самой Гарпии и обновляется каждый тик.
      spawn(combat, {
        kind: 'dive',
        x: boss.x,
        y: boss.y,
        w: boss.w * 0.8,
        // Опасны когти внизу, а не весь силуэт: прыжок должен уверенно уносить.
        h: boss.h * 0.5,
        damage: DAMAGE.dive,
        life: TIMINGS.dive.active,
      });
      // Высота уже взята на стадии замаха — здесь только разгон.
      // Довыцеливание в момент старта сделало бы телеграф бессмысленным:
      // Гарпия била бы всегда точно туда, где игрок стоит сейчас.
      boss.vx = sign(combat.player.x - boss.x) * 520;
      boss.vy = 0;
      break;
    }
    case 'summon': {
      for (let i = 0; i < 2; i++) {
        const x = clamp(
          boss.x + (i === 0 ? -110 : 110) + nextRange(rng, -30, 30),
          ARENA.left + 40,
          ARENA.right - 40,
        );
        const minion: Minion = {
          id: combat.nextEntityId++,
          x,
          y: ARENA.groundY,
          px: x,
          py: ARENA.groundY,
          vx: 0,
          vy: 0,
          hp: MINION_HP,
          hpMax: MINION_HP,
          attackTimer: 0.6,
          hitFlash: 0,
        };
        combat.minions.push(minion);
      }
      break;
    }
    default:
      break;
  }
}

function onActiveTick(combat: CombatState, boss: BossState, dt: number): void {
  if (boss.action !== 'dive') return;

  boss.x += boss.vx * dt;

  // Долетев до края арены, пикирование заканчивается сразу. Иначе хитбокс
  // ещё полсекунды висел бы у стены неподвижным «пикированием» и добивал
  // того, кто как раз туда приземлился.
  if (boss.x <= ARENA.left + boss.w / 2 || boss.x >= ARENA.right - boss.w / 2) {
    boss.vx = 0;
    boss.stageTimer = 0;
    endDive(combat);
  }
}

/** Снимает хитбокс пикирования: он живёт ровно столько, сколько длится рывок. */
function endDive(combat: CombatState): void {
  for (const h of combat.hazards) {
    if (h.kind === 'dive') h.life = 0;
  }
}

function onActiveEnd(boss: BossState): void {
  boss.vx = 0;
  boss.vy = 0;
}

// ---------------------------------------------------------------------------
// Прислужники
// ---------------------------------------------------------------------------

export function stepMinions(combat: CombatState, dt: number): void {
  const player = combat.player;
  for (const m of combat.minions) {
    m.px = m.x;
    m.py = m.y;
    if (m.hitFlash > 0) m.hitFlash -= dt;

    const dir = sign(player.x - m.x);
    m.x += dir * 118 * dt;
    m.x = clamp(m.x, ARENA.left + 12, ARENA.right - 12);

    if (m.attackTimer > 0) m.attackTimer -= dt;
  }
}

export function minionDamage(): number {
  return DAMAGE.minion;
}

// ---------------------------------------------------------------------------
// Опасности
// ---------------------------------------------------------------------------

type HazardSpawn = Partial<Hazard> & Pick<Hazard, 'kind' | 'x' | 'y' | 'w' | 'h' | 'damage'>;

function spawn(combat: CombatState, h: HazardSpawn): void {
  combat.hazards.push({
    id: combat.nextEntityId++,
    kind: h.kind,
    x: h.x,
    y: h.y,
    px: h.x,
    py: h.y,
    vx: h.vx ?? 0,
    vy: h.vy ?? 0,
    w: h.w,
    h: h.h,
    damage: h.damage,
    telegraph: h.telegraph ?? 0,
    life: h.life ?? 1,
    spent: false,
    gravity: h.gravity ?? 0,
  });
}
