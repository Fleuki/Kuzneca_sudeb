/**
 * Все типы состояния симуляции.
 *
 * Правила, идущие от §11 дизайн-документа:
 *  - здесь нет ни одного импорта из PixiJS и вообще из слоя рендера;
 *  - всё состояние — простые данные (числа, строки, массивы, объекты),
 *    чтобы его можно было сериализовать в JSON и восстановить один в один;
 *  - никаких классов с методами, никаких Map/Set/функций внутри состояния.
 */

import type { Rng } from './rng.ts';

// ---------------------------------------------------------------------------
// Идентификаторы
// ---------------------------------------------------------------------------

export type MaterialId = 'iron' | 'obsidian' | 'crystal' | 'bloodiron';
export type ShapeId = 'heavy' | 'light';
export type BossId = 'golem' | 'harpy' | 'abyss';
export type BiomeId = 'upper' | 'volcanic' | 'caverns';
export type UpgradeId = 'roomy_pack' | 'precise_anvil' | 'tempering' | 'bellows' | 'deep_vein';

export type Phase =
  | 'menu'
  | 'bossSelect'
  | 'biomeSelect'
  | 'mine'
  | 'forge'
  | 'combat'
  | 'result'
  | 'upgrades';

/** Материалы в рюкзаке / на складе. */
export type Backpack = Record<MaterialId, number>;

// ---------------------------------------------------------------------------
// Ввод
// ---------------------------------------------------------------------------

/**
 * Состояние ввода на текущий тик. Симуляция читает только это —
 * она ничего не знает про клавиатуру, а бот в балансировщике
 * подставляет сюда свои значения.
 */
export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  /** Нажатие прыжка именно в этом тике (для контроля высоты прыжка). */
  jumpPressed: boolean;
  attack: boolean;
  attackPressed: boolean;
  dash: boolean;
  dashPressed: boolean;
}

export function emptyInput(): InputState {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    jumpPressed: false,
    attack: false,
    attackPressed: false,
    dash: false,
    dashPressed: false,
  };
}

// ---------------------------------------------------------------------------
// Оружие
// ---------------------------------------------------------------------------

/**
 * Выкованное оружие. Все производные характеристики посчитаны один раз
 * в момент ковки и дальше не пересчитываются — бой читает готовые числа.
 */
export interface Weapon {
  shape: ShapeId;
  primary: MaterialId;
  /** null — ковали только из основного материала, без вторичного бонуса. */
  secondary: MaterialId | null;

  /** Урон за одно попадание, уже с учётом материалов и мини-игры. */
  damage: number;
  /** Интервал между ударами в секундах. */
  interval: number;
  /** Дальность хитбокса в пикселях. */
  range: number;

  durabilityMax: number;
  durability: number;
  /** Сколько прочности снимает одно попадание (снижается «Закалкой»). */
  durabilityCost: number;

  /** Доля игнорируемой брони, 0..1 (обсидиан). */
  armorPierce: number;
  /** Доля урона, которая проходит как магическая и игнорирует щиты, 0..1 (кристалл). */
  magicFraction: number;
  /** Доля нанесённого урона, возвращаемая здоровьем (кровавое железо). */
  lifesteal: number;

  /** Итоги мини-игры ковки — показываются на экране оружия. */
  forgeResults: ForgeStrikeResult[];
}

export type ForgeStrikeResult = 'perfect' | 'good' | 'miss';

// ---------------------------------------------------------------------------
// Мета-прогрессия (переживает забеги)
// ---------------------------------------------------------------------------

export interface MetaState {
  /** Валюта: по одному клейму за победу над боссом. */
  brands: number;
  /** Купленные апгрейды кузницы. */
  upgrades: UpgradeId[];
  /** Боссы, побеждённые хотя бы раз — открывают следующих. */
  defeated: BossId[];
  /**
   * Материалы, оставшиеся с прошлых забегов.
   * §8: «Ресурсы в рюкзаке сохраняются» при поражении.
   */
  backpack: Backpack;
  /** Счётчики для экрана статистики. */
  runsStarted: number;
  runsWon: number;
}

// ---------------------------------------------------------------------------
// Забег
// ---------------------------------------------------------------------------

export interface RunState {
  seed: number;
  /** Босс, выбранный ДО похода в шахту — главная механика игры (§1). */
  bossId: BossId;
  biome: BiomeId | null;
  /** HP игрока, переносится между фазами: урон в шахте идёт в бой (§4). */
  hp: number;
  hpMax: number;
  weapon: Weapon | null;
  /** Боссы, предложенные на экране выбора в этом забеге. */
  offered: BossId[];
}

// ---------------------------------------------------------------------------
// Шахта
// ---------------------------------------------------------------------------

export const TILE_EMPTY = 0;
export const TILE_SOLID = 1;
export const TILE_SPIKE = 2;
export const TILE_POISON = 3;
export const TILE_EXIT = 4;
export const TILE_DIRT = 5;

export interface OreEntity {
  id: number;
  x: number;
  y: number;
  material: MaterialId;
  /** Сколько ударов киркой осталось. */
  hp: number;
  amount: number;
  mined: boolean;
  /** Таймер вспышки после удара — читает только рендер. */
  hitFlash: number;
}

export interface CrumbleEntity {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 'idle' — держит, 'shaking' — игрок наступил, 'falling' — падает, 'gone' — исчезла. */
  state: 'idle' | 'shaking' | 'falling' | 'gone';
  timer: number;
  vy: number;
}

export interface StalactiteEntity {
  id: number;
  x: number;
  y: number;
  startY: number;
  state: 'idle' | 'warning' | 'falling' | 'broken';
  timer: number;
  vy: number;
}

export interface MinePlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Позиция на прошлом тике — для интерполяции в рендере. */
  px: number;
  py: number;
  facing: 1 | -1;
  onGround: boolean;
  coyote: number;
  jumpBuffer: number;
  /** Осталось кадров неуязвимости после урона. */
  invuln: number;
  /** Таймер замаха киркой. */
  swingTimer: number;
  swingCooldown: number;
}

export interface MineState {
  width: number;
  height: number;
  /** Плоский массив тайлов, индекс = y * width + x. */
  tiles: number[];
  player: MinePlayer;
  ore: OreEntity[];
  crumbles: CrumbleEntity[];
  stalactites: StalactiteEntity[];
  /** Собрано за этот заход — для итогового экрана. */
  collected: Backpack;
  /** Позиция выхода в пикселях. */
  exitX: number;
  exitY: number;
  /** Игрок стоит в зоне выхода — можно уйти. */
  atExit: boolean;
  elapsed: number;
  /** Всплывающие подсказки/уведомления для HUD. */
  toast: string;
  toastTimer: number;
}

// ---------------------------------------------------------------------------
// Ковка
// ---------------------------------------------------------------------------

export interface ForgeState {
  stage: 'select' | 'minigame' | 'done';
  shape: ShapeId;
  primary: MaterialId | null;
  secondary: MaterialId | null;

  /** Курсор на панели выбора: 0 — форма, 1 — основной, 2 — вторичный. */
  cursorRow: number;

  strikesTotal: number;
  strikesDone: number;
  results: ForgeStrikeResult[];

  /** Позиция бегунка 0..1 и направление движения. */
  marker: number;
  markerDir: 1 | -1;
  markerSpeed: number;
  zoneCenter: number;
  zoneHalf: number;
  perfectHalf: number;

  /** Накопленные множители от мини-игры. */
  bonusDamage: number;
  bonusDurability: number;
  bonusSpeed: number;

  /** Готовое оружие после последнего удара. */
  forged: Weapon | null;
  /** Пауза после удара, чтобы игрок увидел результат. */
  strikeFlash: number;
  lastResult: ForgeStrikeResult | null;
}

// ---------------------------------------------------------------------------
// Бой
// ---------------------------------------------------------------------------

export interface CombatPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  facing: 1 | -1;
  onGround: boolean;
  hp: number;
  hpMax: number;
  coyote: number;
  jumpBuffer: number;

  invuln: number;
  dashCooldown: number;
  dashTimer: number;
  /** Кадры неуязвимости внутри рывка. */
  dashIFrames: number;

  attackCooldown: number;
  /** Сколько ещё активен хитбокс атаки. */
  attackActive: number;
  /** Таймер общей анимации замаха (для рендера). */
  attackAnim: number;
  /** id целей, уже задетых текущим замахом — один удар не бьёт дважды. */
  hitThisSwing: number[];
}

/** Опасность на арене: снаряд, волна, столб огня, луч. */
export interface Hazard {
  id: number;
  kind: 'rock' | 'wave' | 'feather' | 'pillar' | 'beam' | 'gust' | 'dive';
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  damage: number;
  /** Пока > 0 — это телеграф, урона нет, рисуется красным контуром. */
  telegraph: number;
  /** Сколько ещё живёт активная фаза. */
  life: number;
  /** Уже задел игрока — повторно не бьёт. */
  spent: boolean;
  gravity: number;
}

export interface Minion {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  hp: number;
  hpMax: number;
  attackTimer: number;
  hitFlash: number;
}

export interface BossState {
  id: BossId;
  x: number;
  y: number;
  px: number;
  py: number;
  w: number;
  h: number;
  facing: 1 | -1;
  hp: number;
  hpMax: number;
  /** Постоянное снижение физического урона, 0..1 (броня Голема). */
  armor: number;
  /** Дополнительное снижение физического урона от щита второй фазы, 0..1. */
  shield: number;
  phase: number;

  /** Текущее действие и его стадия. */
  action: string;
  stage: 'idle' | 'telegraph' | 'active' | 'recover';
  stageTimer: number;
  /** Пауза между действиями. */
  actionCooldown: number;
  hitFlash: number;
  /** Служебные счётчики конкретных атак (сколько снарядов уже выпущено и т.п.). */
  counter: number;
  vx: number;
  vy: number;
}

export interface CombatState {
  player: CombatPlayer;
  boss: BossState;
  hazards: Hazard[];
  minions: Minion[];
  nextEntityId: number;
  elapsed: number;
  /** 'fight' — идёт бой, дальше — исход. */
  outcome: 'fight' | 'won' | 'lost';
  /** Задержка перед экраном результата, чтобы досмотреть добивание. */
  outcomeTimer: number;
  shake: number;
  /** Урон, нанесённый игроком — для итогового экрана. */
  damageDealt: number;
  weaponBroken: boolean;
}

// ---------------------------------------------------------------------------
// Результат забега
// ---------------------------------------------------------------------------

export interface ResultState {
  won: boolean;
  bossId: BossId;
  brandsEarned: number;
  damageDealt: number;
  timeSeconds: number;
  weaponBroken: boolean;
  /** Подсказка «что пошло не так» — рамка «я неправильно подготовился» (§1). */
  hint: string;
}

// ---------------------------------------------------------------------------
// Корневое состояние
// ---------------------------------------------------------------------------

export interface GameState {
  /** Версия схемы сохранения. Несовпадение — сейв отбрасывается. */
  version: number;
  tick: number;
  phase: Phase;
  rng: Rng;
  input: InputState;

  meta: MetaState;
  run: RunState | null;
  mine: MineState | null;
  forge: ForgeState | null;
  combat: CombatState | null;
  result: ResultState | null;

  /** Курсор на экранах выбора (босс, биом, апгрейды). */
  menuCursor: number;
  /** Всплывающее сообщение поверх меню. */
  notice: string;
  noticeTimer: number;
}
