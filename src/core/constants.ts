/**
 * Все числа баланса в одном месте.
 *
 * Правило: ни один магический литерал не живёт в коде симуляции. Если число
 * влияет на ощущение игры — оно здесь, чтобы балансировщик ботами (tools/balance.ts)
 * и правки после плейтестов не требовали лазить по всей кодовой базе.
 */

import type { BiomeId, BossId, MaterialId, ShapeId, UpgradeId } from './types.ts';

// ---------------------------------------------------------------------------
// Цикл симуляции (§11: фиксированный шаг 60 Гц)
// ---------------------------------------------------------------------------

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** Больше этого за один кадр не досимулируем — защита от «спирали смерти». */
export const MAX_FRAME_TIME = 0.25;

export const SAVE_VERSION = 1;

// ---------------------------------------------------------------------------
// Логическое разрешение. Рендер масштабирует его под окно.
// ---------------------------------------------------------------------------

export const VIEW_W = 960;
export const VIEW_H = 540;

// ---------------------------------------------------------------------------
// Материалы (§3)
// ---------------------------------------------------------------------------

export interface MaterialDef {
  id: MaterialId;
  name: string;
  short: string;
  damageMult: number;
  durability: number;
  speedMult: number;
  /** Доля игнорируемой брони. */
  armorPierce: number;
  /** Доля урона, проходящая сквозь щиты как магическая. */
  magicFraction: number;
  /** Вампиризм: доля нанесённого урона возвращается здоровьем. */
  lifesteal: number;
  color: number;
  darkColor: number;
  note: string;
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  iron: {
    id: 'iron',
    name: 'Железо',
    short: 'Жл',
    damageMult: 1.0,
    durability: 120,
    speedMult: 1.0,
    armorPierce: 0,
    magicFraction: 0,
    lifesteal: 0,
    color: 0xb9c2cc,
    darkColor: 0x6d7580,
    note: 'Нейтральный, стартовый',
  },
  obsidian: {
    id: 'obsidian',
    name: 'Обсидиан',
    short: 'Об',
    damageMult: 1.3,
    durability: 200,
    speedMult: 0.75,
    armorPierce: 1,
    magicFraction: 0,
    lifesteal: 0,
    color: 0x6b4fa0,
    darkColor: 0x2e2145,
    note: 'Игнорирует броню',
  },
  crystal: {
    id: 'crystal',
    name: 'Светящийся кристалл',
    short: 'Кр',
    damageMult: 1.6,
    durability: 50,
    speedMult: 1.0,
    armorPierce: 0,
    magicFraction: 1,
    lifesteal: 0,
    color: 0x63e0d8,
    darkColor: 0x1f6b68,
    note: 'Магический урон, проходит сквозь щиты',
  },
  bloodiron: {
    id: 'bloodiron',
    name: 'Кровавое железо',
    short: 'Кв',
    damageMult: 0.9,
    durability: 100,
    speedMult: 1.1,
    armorPierce: 0,
    magicFraction: 0,
    lifesteal: 0.08,
    color: 0xc4404a,
    darkColor: 0x5e1a20,
    note: '8% урона возвращается здоровьем',
  },
};

export const MATERIAL_ORDER: MaterialId[] = ['iron', 'obsidian', 'crystal', 'bloodiron'];

/** Вторичный материал даёт 40% от своего эффекта (§5). */
export const SECONDARY_WEIGHT = 0.4;

// ---------------------------------------------------------------------------
// Формы оружия (§5)
// ---------------------------------------------------------------------------

export interface ShapeDef {
  id: ShapeId;
  name: string;
  damage: number;
  interval: number;
  range: number;
  /** Высота хитбокса — у молота широкий замах. */
  hitH: number;
  note: string;
}

export const SHAPES: Record<ShapeId, ShapeDef> = {
  heavy: {
    id: 'heavy',
    name: 'Молот',
    damage: 30,
    interval: 1.2,
    range: 84,
    hitH: 72,
    note: 'Бьёт с дистанции, но почти не прощает промах по таймингу',
  },
  light: {
    id: 'light',
    name: 'Парные клинки',
    damage: 12,
    interval: 0.4,
    range: 48,
    hitH: 44,
    note: 'DPS выше, но стоять вплотную придётся намного дольше',
  },
};

export const SHAPE_ORDER: ShapeId[] = ['heavy', 'light'];

/** Рецепт: 12 основного + 6 вторичного (§5). */
export const RECIPE_PRIMARY = 12;
export const RECIPE_SECONDARY = 6;

/** Кулаки, когда оружие сломалось прямо в бою. */
export const FISTS = {
  damage: 5,
  interval: 0.5,
  range: 30,
  hitH: 40,
};

// ---------------------------------------------------------------------------
// Мини-игра ковки (§5)
// ---------------------------------------------------------------------------

export const FORGE = {
  baseStrikes: 3,
  /** Скорость бегунка в долях полосы за секунду. */
  baseSpeed: 0.85,
  /** С каждым ударом бегунок ускоряется. */
  speedStep: 0.12,
  baseZoneHalf: 0.11,
  perfectRatio: 0.28,
  /** Насколько «Мехи» расширяют зону. */
  bellowsBonus: 0.3,
  goodBonus: 0.1,
  perfectBonus: 0.2,
  missPenalty: -0.05,
  /** Пауза после удара, чтобы увидеть результат. */
  flashTime: 0.35,
  /** Зона не подходит вплотную к краям полосы. */
  zoneMargin: 0.18,
};

// ---------------------------------------------------------------------------
// Игрок (§7)
// ---------------------------------------------------------------------------

export const PLAYER = {
  hpMax: 100,
  w: 22,
  h: 34,
  moveSpeed: 205,
  accel: 2400,
  friction: 2600,
  airAccel: 1500,
  // Высота прыжка — 97 px, чуть больше четырёх тайлов. Она задаёт сразу две вещи:
  // шаг между платформами в шахте (три тайла с запасом на неидеальный прыжок)
  // и досягаемость платформы на арене. При прежних 545 прыжок брал 76 px, и на
  // арену запрыгнуть было физически нельзя — платформа висела в 132 px над полом.
  jumpVelocity: 615,
  /** Отпустил прыжок — гасим скорость вверх, получается контроль высоты. */
  jumpCutMultiplier: 0.45,
  /**
   * Сколько прыжок защищён от гашения высоты.
   *
   * Без этого короткий тап давал микроподскок: палец успевал оторваться раньше,
   * чем тик обрабатывал буферизованное нажатие, и гашение срабатывало в тот же
   * тик, что и сам прыжок. На клавиатуре это почти незаметно, на телефоне —
   * основной способ прыгать.
   */
  jumpMinHold: 0.11,
  /**
   * Сколько экранная кнопка прыжка считается зажатой после короткого тапа.
   *
   * На телефоне прыгают тапом, а не удержанием, и без этого палец отрывался
   * задолго до вершины: гашение высоты срезало прыжок до 59 px при ступеньке
   * в шахте в 72 px — забраться было нельзя. Должно быть не меньше времени
   * подъёма до вершины (jumpVelocity / gravity), иначе тап снова не долетит.
   */
  touchJumpHold: 0.34,
  gravity: 1950,
  maxFall: 900,
  coyoteTime: 0.1,
  jumpBufferTime: 0.12,

  dashSpeed: 640,
  dashDuration: 0.18,
  dashCooldown: 1.2,
  /** §7: неуязвимость 0.15 с. */
  dashIFrames: 0.15,

  /** Неуязвимость после получения урона. */
  hitInvuln: 0.8,
};

// ---------------------------------------------------------------------------
// Шахта (§4)
// ---------------------------------------------------------------------------

export const TILE = 24;

export const MINE = {
  /** Базовая вместимость рюкзака. */
  backpackBase: 20,
  backpackBonus: 5,
  /** Сколько ударов киркой держит руда. */
  oreHp: 2,
  oreAmount: 2,
  oreAmountBonus: 1,
  /** Дальность и длительность замаха киркой. */
  pickRange: 40,
  pickSwing: 0.12,
  pickCooldown: 0.32,

  spikeDamage: 12,
  poisonDps: 14,
  stalactiteDamage: 15,
  /** Задержка между «дрожит» и падением сталактита. */
  stalactiteWarning: 0.55,
  stalactiteTrigger: 60,
  /** Сколько игрок стоит на осыпающейся платформе до обвала. */
  crumbleShake: 0.45,
  crumbleFall: 1.4,

  /** Сколько комнат собирается в уровень. */
  roomsPerRun: 4,
  toastTime: 2.2,
};

export interface BiomeDef {
  id: BiomeId;
  name: string;
  note: string;
  /** Веса выпадения материалов из руды. */
  weights: Record<MaterialId, number>;
  bgColor: number;
  tileColor: number;
  tileEdge: number;
  danger: string;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  upper: {
    id: 'upper',
    name: 'Верхние штольни',
    note: 'Железо в изобилии, немного всего остального',
    weights: { iron: 70, obsidian: 12, crystal: 8, bloodiron: 10 },
    bgColor: 0x1a1712,
    tileColor: 0x4a3f33,
    tileEdge: 0x655547,
    danger: 'Спокойно',
  },
  volcanic: {
    id: 'volcanic',
    name: 'Вулканические слои',
    note: 'Обсидиан, но ловушек заметно больше',
    weights: { iron: 22, obsidian: 60, crystal: 6, bloodiron: 12 },
    bgColor: 0x1e1210,
    tileColor: 0x53302a,
    tileEdge: 0x7a4436,
    danger: 'Опасно',
  },
  caverns: {
    id: 'caverns',
    name: 'Кристальные каверны',
    note: 'Кристалл и кровавое железо, тяжёлая навигация',
    weights: { iron: 16, obsidian: 10, crystal: 42, bloodiron: 32 },
    bgColor: 0x101725,
    tileColor: 0x2c3a56,
    tileEdge: 0x415777,
    danger: 'Очень опасно',
  },
};

export const BIOME_ORDER: BiomeId[] = ['upper', 'volcanic', 'caverns'];

// ---------------------------------------------------------------------------
// Боссы (§6)
// ---------------------------------------------------------------------------

export interface BossDef {
  id: BossId;
  name: string;
  hp: number;
  armor: number;
  w: number;
  h: number;
  /** Краткое описание слабости на экране выбора — суть игры (§1). */
  weakness: string;
  answer: MaterialId;
  rhythm: string;
  role: string;
  /** Какой босс должен быть побеждён, чтобы этот открылся. */
  requires: BossId | null;
  color: number;
  accent: number;
}

export const BOSSES: Record<BossId, BossDef> = {
  golem: {
    id: 'golem',
    name: 'Каменный Голем',
    hp: 900,
    armor: 0.4,
    w: 128,
    h: 168,
    weakness: 'Броня режет физический урон на 40%. Обсидиан проходит насквозь.',
    answer: 'obsidian',
    rhythm: 'Медленный, длинные окна для контратаки',
    role: 'Обучающий: прощает тайминг, наказывает за материал',
    requires: null,
    color: 0x6f6a5e,
    accent: 0x9c8f6a,
  },
  harpy: {
    id: 'harpy',
    name: 'Пепельная Гарпия',
    hp: 600,
    armor: 0,
    w: 120,
    h: 96,
    weakness: 'Частые атаки по 12–15. Чип-урон неизбежен — окупается вампиризмом.',
    answer: 'bloodiron',
    rhythm: 'Быстрый, короткие окна',
    role: 'Проверка реакции: обсидиан не успевает',
    requires: 'golem',
    color: 0x8a5a4a,
    accent: 0xd08a5a,
  },
  abyss: {
    id: 'abyss',
    name: 'Повелитель Бездны',
    hp: 1200,
    armor: 0,
    w: 136,
    h: 196,
    weakness: 'Ниже 50% поднимает щит: −80% физического урона. Магия проходит сквозь.',
    answer: 'crystal',
    rhythm: 'Две фазы, во второй время на исходе',
    role: 'Финал: заставляет идти в самый опасный биом за самым хрупким материалом',
    requires: 'harpy',
    color: 0x3d3358,
    accent: 0x8f6ad0,
  },
};

export const BOSS_ORDER: BossId[] = ['golem', 'harpy', 'abyss'];

/** Щит второй фазы Повелителя Бездны. */
export const ABYSS_PHASE2_THRESHOLD = 0.5;
export const ABYSS_SHIELD = 0.8;

// ---------------------------------------------------------------------------
// Арена (§6: статична, одна платформа посередине, без прокрутки)
// ---------------------------------------------------------------------------

export const ARENA = {
  left: 40,
  right: VIEW_W - 40,
  groundY: 468,
  ceiling: 60,
  platformX1: 396,
  platformX2: 564,
  // На 82 px над полом: запрыгивается с запасом, и под ней свободно проходит игрок.
  platformY: 386,
  platformH: 16,
};

// ---------------------------------------------------------------------------
// Мета-прогрессия (§8)
// ---------------------------------------------------------------------------

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  cost: number;
  effect: string;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  roomy_pack: { id: 'roomy_pack', name: 'Вместительный рюкзак', cost: 1, effect: '+5 слотов' },
  precise_anvil: { id: 'precise_anvil', name: 'Точная наковальня', cost: 1, effect: '+1 удар в ковке' },
  tempering: { id: 'tempering', name: 'Закалка', cost: 2, effect: '−20% расхода прочности' },
  bellows: { id: 'bellows', name: 'Мехи', cost: 2, effect: 'Зона в ковке шире на 30%' },
  deep_vein: { id: 'deep_vein', name: 'Глубокая жила', cost: 3, effect: 'Руда даёт +1 единицу' },
};

export const UPGRADE_ORDER: UpgradeId[] = [
  'roomy_pack',
  'precise_anvil',
  'tempering',
  'bellows',
  'deep_vein',
];

export const TEMPERING_REDUCTION = 0.2;

/**
 * §12, открытый вопрос 1: ломается ли оружие при поражении.
 * Пока — ломается, как записано в §8. Флаг оставлен на видном месте,
 * чтобы проверить оба варианта на плейтесте восьмой недели.
 */
export const KEEP_WEAPON_ON_DEFEAT = false;
