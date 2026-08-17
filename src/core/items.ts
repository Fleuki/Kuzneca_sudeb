/**
 * Дерево предметов и рецептов ковки.
 *
 * Правило дерева одно и читается с первого взгляда: **два предмета дают один**.
 * Две руды переплавляются в слиток, два слитка — в сплав, два сплава — в
 * сплав следующего уровня. Из одинаковых получается «чистая» ветка, из разных —
 * гибрид, у которого свойства обоих родителей.
 *
 * Зачем так, а не «12 основного + 6 вторичного», как было раньше: старый рецепт
 * был выбором из четырёх строчек, и весь смысл добычи сводился к «набей двенадцать
 * штук одного». Дерево превращает рюкзак в задачу: 8 железа и 8 обсидиана — это
 * осадный сплав, а 4 и 12 — уже нет, и решать это надо ещё до спуска в шахту.
 *
 * Стоимость в сырье удваивается с каждым уровнем: слиток — 2 руды, сплав — 4,
 * третий уровень — 8, четвёртый — 16. Оружие съедает ДВЕ единицы основы, то есть
 * рюкзак на 20 ровно дотягивает до оружия третьего уровня без вставки. Это и есть
 * главный размен фазы добычи, и он выражен числами, а не текстом.
 *
 * Здесь только данные: ни симуляция, ни рендер не хранят характеристики сами.
 */

// ---------------------------------------------------------------------------
// Идентификаторы
// ---------------------------------------------------------------------------

export type ItemId =
  // Уровень 0 — сырьё из шахты
  | 'iron_ore'
  | 'obsidian_ore'
  | 'crystal_ore'
  | 'blood_ore'
  // Уровень 1 — слитки (2 одинаковых сырья)
  | 'iron_bar'
  | 'obsidian_bar'
  | 'crystal_bar'
  | 'blood_bar'
  // Уровень 2 — чистые (2 одинаковых слитка)
  | 'steel'
  | 'basalt'
  | 'prism'
  | 'heartiron'
  // Уровень 2 — гибриды (2 разных слитка)
  | 'shadowsteel'
  | 'chimesteel'
  | 'crimsonsteel'
  | 'voidglass'
  | 'tarblood'
  | 'livecrystal'
  // Уровень 3 — сплавы сплавов
  | 'siege'
  | 'moonsteel'
  | 'quickblood'
  | 'starcore'
  | 'gravemetal'
  | 'soulglass'
  // Уровень 4 — вершина дерева
  | 'dawnsteel'
  | 'doomcore';

/** Ветка дерева — только для группировки в интерфейсе. */
export type ItemKind = 'ore' | 'bar' | 'alloy' | 'core';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Короткая подпись для тесной сетки рюкзака. */
  short: string;
  tier: 0 | 1 | 2 | 3 | 4;
  kind: ItemKind;

  /** Характеристики оружия, если ковать из этого предмета. У сырья их нет. */
  damageMult: number;
  durability: number;
  speedMult: number;
  /** Доля игнорируемой брони, 0..1. */
  armorPierce: number;
  /** Доля урона, проходящая сквозь щиты как магическая, 0..1. */
  magicFraction: number;
  /** Доля нанесённого урона, возвращаемая здоровьем. */
  lifesteal: number;

  color: number;
  darkColor: number;
  /** Чем эта штука интересна — одна строка на карточку. */
  note: string;
}

function def(
  id: ItemId,
  name: string,
  short: string,
  tier: ItemDef['tier'],
  kind: ItemKind,
  stats: Partial<Pick<
    ItemDef,
    'damageMult' | 'durability' | 'speedMult' | 'armorPierce' | 'magicFraction' | 'lifesteal'
  >>,
  color: number,
  darkColor: number,
  note: string,
): ItemDef {
  return {
    id,
    name,
    short,
    tier,
    kind,
    damageMult: stats.damageMult ?? 1,
    durability: stats.durability ?? 100,
    speedMult: stats.speedMult ?? 1,
    armorPierce: stats.armorPierce ?? 0,
    magicFraction: stats.magicFraction ?? 0,
    lifesteal: stats.lifesteal ?? 0,
    color,
    darkColor,
    note,
  };
}

// ---------------------------------------------------------------------------
// Предметы
// ---------------------------------------------------------------------------

export const ITEMS: Record<ItemId, ItemDef> = {
  // --- Уровень 0: сырьё -----------------------------------------------------
  iron_ore: def('iron_ore', 'Железная руда', 'Жл', 0, 'ore', {}, 0xb9c2cc, 0x6d7580,
    'Сырьё. Ковать из руды нельзя — сначала в горн'),
  obsidian_ore: def('obsidian_ore', 'Обсидиановый скол', 'Об', 0, 'ore', {}, 0x6b4fa0, 0x2e2145,
    'Сырьё. Тяжёлое и острое, но само по себе крошится'),
  crystal_ore: def('crystal_ore', 'Осколок кристалла', 'Кр', 0, 'ore', {}, 0x63e0d8, 0x1f6b68,
    'Сырьё. Светится в темноте и звенит от удара'),
  blood_ore: def('blood_ore', 'Кровавая руда', 'Кв', 0, 'ore', {}, 0xc4404a, 0x5e1a20,
    'Сырьё. Тёплая на ощупь, что бы это ни значило'),

  // --- Уровень 1: слитки ----------------------------------------------------
  iron_bar: def('iron_bar', 'Железный слиток', 'Жл1', 1, 'bar',
    { damageMult: 0.85, durability: 90, speedMult: 1.0 },
    0xc8d2dd, 0x77808c, 'Честная заготовка без единой особенности'),
  obsidian_bar: def('obsidian_bar', 'Обсидиановая пластина', 'Об1', 1, 'bar',
    { damageMult: 1.05, durability: 130, speedMult: 0.85, armorPierce: 0.5 },
    0x7d5ebb, 0x35264f, 'Наполовину проходит сквозь броню'),
  crystal_bar: def('crystal_bar', 'Кристаллическая призма', 'Кр1', 1, 'bar',
    { damageMult: 1.2, durability: 40, speedMult: 1.0, magicFraction: 0.6 },
    0x7af0e8, 0x24807c, 'Бьёт магией, но живёт недолго'),
  blood_bar: def('blood_bar', 'Кровавый слиток', 'Кв1', 1, 'bar',
    { damageMult: 0.8, durability: 80, speedMult: 1.08, lifesteal: 0.05 },
    0xd4515b, 0x6c1f26, 'Немного возвращает здоровье за удар'),

  // --- Уровень 2: чистые ----------------------------------------------------
  steel: def('steel', 'Сталь', 'Ст', 2, 'alloy',
    { damageMult: 1.1, durability: 170, speedMult: 1.0 },
    0xdfe6ee, 0x828d9a, 'Ничего лишнего, зато не подводит и не ломается'),
  basalt: def('basalt', 'Литой обсидиан', 'Лт', 2, 'alloy',
    { damageMult: 1.5, durability: 230, speedMult: 0.82, armorPierce: 1 },
    0x8a63d6, 0x3a2857, 'Броню не замечает вовсе, но замах тяжёлый'),
  prism: def('prism', 'Гранёная призма', 'Гр', 2, 'alloy',
    { damageMult: 1.7, durability: 60, speedMult: 1.02, magicFraction: 1 },
    0x8ff8f0, 0x2a8f8a, 'Чистая магия. Рассыпается на шестидесятом ударе'),
  heartiron: def('heartiron', 'Сердечное железо', 'Сд', 2, 'alloy',
    { damageMult: 1.0, durability: 140, speedMult: 1.12, lifesteal: 0.09 },
    0xe0616b, 0x78242c, 'Возвращает каждый одиннадцатый удар здоровьем'),

  // --- Уровень 2: гибриды ---------------------------------------------------
  shadowsteel: def('shadowsteel', 'Теневая сталь', 'Тн', 2, 'alloy',
    { damageMult: 1.28, durability: 190, speedMult: 0.94, armorPierce: 0.65 },
    0x9a92b8, 0x48425e, 'Прочная и проходит сквозь броню больше чем наполовину'),
  chimesteel: def('chimesteel', 'Звонкая сталь', 'Зв', 2, 'alloy',
    { damageMult: 1.3, durability: 110, speedMult: 1.05, magicFraction: 0.5 },
    0xa8e2e0, 0x467a7a, 'Половина урона идёт магией — щит держит её плохо'),
  crimsonsteel: def('crimsonsteel', 'Багровая сталь', 'Бг', 2, 'alloy',
    { damageMult: 1.05, durability: 150, speedMult: 1.05, lifesteal: 0.06 },
    0xd08a86, 0x6b3634, 'Крепкая сталь, которая понемногу лечит'),
  voidglass: def('voidglass', 'Пустотное стекло', 'Пс', 2, 'alloy',
    { damageMult: 1.5, durability: 85, speedMult: 0.9, armorPierce: 0.6, magicFraction: 0.6 },
    0x8f7ce0, 0x3c3170, 'И броню, и щит проходит наполовину. Хрупкое'),
  tarblood: def('tarblood', 'Смоляная кровь', 'См', 2, 'alloy',
    { damageMult: 1.28, durability: 175, speedMult: 0.85, armorPierce: 0.5, lifesteal: 0.03 },
    0x8c4a5a, 0x3f2029, 'Тяжёлое, живучее, слегка вампирское'),
  livecrystal: def('livecrystal', 'Живой кристалл', 'Жк', 2, 'alloy',
    { damageMult: 1.3, durability: 75, speedMult: 1.05, magicFraction: 0.7, lifesteal: 0.07 },
    0x9df0c0, 0x2f7a5a, 'Пьёт здоровье и бьёт магией. Живёт мало'),

  // --- Уровень 3 ------------------------------------------------------------
  siege: def('siege', 'Осадный сплав', 'Ос', 3, 'core',
    { damageMult: 1.6, durability: 320, speedMult: 0.75, armorPierce: 1 },
    0xb9a06a, 0x5c4c2a, 'Ответ на любую броню. Медленный, как осада'),
  moonsteel: def('moonsteel', 'Лунная сталь', 'Лн', 3, 'core',
    { damageMult: 1.45, durability: 240, speedMult: 1.0, magicFraction: 0.55 },
    0xd6dcf5, 0x5f6790, 'Ровное всё: урон, скорость, запас, половина магии'),
  quickblood: def('quickblood', 'Скорая кровь', 'Ск', 3, 'core',
    { damageMult: 1.2, durability: 190, speedMult: 1.22, lifesteal: 0.16 },
    0xf0707a, 0x87282f, 'Часто бьёт и много возвращает — держит чип-урон'),
  starcore: def('starcore', 'Звёздное ядро', 'Зд', 3, 'core',
    { damageMult: 1.95, durability: 110, speedMult: 1.0, armorPierce: 0.4, magicFraction: 1 },
    0xa8fff8, 0x2f9a94, 'Вся магия целиком и огромный урон. Сто десять ударов'),
  gravemetal: def('gravemetal', 'Могильный металл', 'Мг', 3, 'core',
    { damageMult: 1.5, durability: 300, speedMult: 0.8, armorPierce: 1, lifesteal: 0.07 },
    0x7d6a86, 0x362d40, 'Броню не замечает, себя чинит, спешить не умеет'),
  soulglass: def('soulglass', 'Душевное стекло', 'Дш', 3, 'core',
    { damageMult: 1.8, durability: 105, speedMult: 1.1, magicFraction: 1, lifesteal: 0.12 },
    0xb6ffd8, 0x35916a, 'Магия и вампиризм разом — если успеешь за сто ударов'),

  // --- Уровень 4 ------------------------------------------------------------
  dawnsteel: def('dawnsteel', 'Сталь Рассвета', 'Рс', 4, 'core',
    { damageMult: 1.7, durability: 280, speedMult: 1.12, magicFraction: 0.45, lifesteal: 0.09 },
    0xffe6a8, 0x9c7f3a, 'Быстрая, живучая и почти наполовину магическая'),
  doomcore: def('doomcore', 'Ядро Погибели', 'Пг', 4, 'core',
    { damageMult: 2.2, durability: 260, speedMult: 0.94, armorPierce: 1, magicFraction: 0.85 },
    0xff9d5c, 0x7e3a18, 'Проходит и броню, и щит. Медленное и очень злое'),
};

/** Порядок показа в рюкзаке: сверху дерева вниз, слева направо. */
export const ITEM_ORDER: ItemId[] = [
  'iron_ore', 'obsidian_ore', 'crystal_ore', 'blood_ore',
  'iron_bar', 'obsidian_bar', 'crystal_bar', 'blood_bar',
  'steel', 'basalt', 'prism', 'heartiron',
  'shadowsteel', 'chimesteel', 'crimsonsteel', 'voidglass', 'tarblood', 'livecrystal',
  'siege', 'moonsteel', 'quickblood', 'starcore', 'gravemetal', 'soulglass',
  'dawnsteel', 'doomcore',
];

/** Сырьё, которое выпадает из руды. */
export const ORE_ITEMS: ItemId[] = ['iron_ore', 'obsidian_ore', 'crystal_ore', 'blood_ore'];

/** Слиток, который получается из этого сырья — самородки отдают его сразу. */
export const BAR_OF_ORE: Record<string, ItemId> = {
  iron_ore: 'iron_bar',
  obsidian_ore: 'obsidian_bar',
  crystal_ore: 'crystal_bar',
  blood_ore: 'blood_bar',
};

// ---------------------------------------------------------------------------
// Рецепты
// ---------------------------------------------------------------------------

/**
 * Рецепт всегда «два предмета → один». Если `a === b`, нужны две штуки одного.
 * Список закрытый: неизвестная пара не даёт ничего, и это нормально — Terraria
 * тоже не выдаёт сплав из любой мешанины.
 */
export interface Recipe {
  a: ItemId;
  b: ItemId;
  out: ItemId;
}

export const RECIPES: Recipe[] = [
  // Переплавка: 2 руды → слиток
  { a: 'iron_ore', b: 'iron_ore', out: 'iron_bar' },
  { a: 'obsidian_ore', b: 'obsidian_ore', out: 'obsidian_bar' },
  { a: 'crystal_ore', b: 'crystal_ore', out: 'crystal_bar' },
  { a: 'blood_ore', b: 'blood_ore', out: 'blood_bar' },

  // Чистая ветка: 2 одинаковых слитка
  { a: 'iron_bar', b: 'iron_bar', out: 'steel' },
  { a: 'obsidian_bar', b: 'obsidian_bar', out: 'basalt' },
  { a: 'crystal_bar', b: 'crystal_bar', out: 'prism' },
  { a: 'blood_bar', b: 'blood_bar', out: 'heartiron' },

  // Гибриды: 2 разных слитка
  { a: 'iron_bar', b: 'obsidian_bar', out: 'shadowsteel' },
  { a: 'iron_bar', b: 'crystal_bar', out: 'chimesteel' },
  { a: 'iron_bar', b: 'blood_bar', out: 'crimsonsteel' },
  { a: 'obsidian_bar', b: 'crystal_bar', out: 'voidglass' },
  { a: 'obsidian_bar', b: 'blood_bar', out: 'tarblood' },
  { a: 'crystal_bar', b: 'blood_bar', out: 'livecrystal' },

  // Третий уровень
  { a: 'steel', b: 'basalt', out: 'siege' },
  { a: 'steel', b: 'chimesteel', out: 'moonsteel' },
  { a: 'heartiron', b: 'crimsonsteel', out: 'quickblood' },
  { a: 'prism', b: 'voidglass', out: 'starcore' },
  { a: 'basalt', b: 'tarblood', out: 'gravemetal' },
  { a: 'prism', b: 'livecrystal', out: 'soulglass' },

  // Вершина
  { a: 'moonsteel', b: 'quickblood', out: 'dawnsteel' },
  { a: 'siege', b: 'starcore', out: 'doomcore' },
];

/** Рецепт для пары предметов в любом порядке. */
export function findRecipe(a: ItemId | null, b: ItemId | null): Recipe | null {
  if (!a || !b) return null;
  for (const r of RECIPES) {
    if ((r.a === a && r.b === b) || (r.a === b && r.b === a)) return r;
  }
  return null;
}

/** Из чего получается этот предмет. Нужно книге рецептов. */
export function recipeFor(out: ItemId): Recipe | null {
  for (const r of RECIPES) if (r.out === out) return r;
  return null;
}

/** Во что этот предмет входит как ингредиент. */
export function recipesUsing(item: ItemId): Recipe[] {
  return RECIPES.filter((r) => r.a === item || r.b === item);
}

/** Сколько сырья стоит одна единица предмета — цена в единицах рюкзака. */
export function rawCost(id: ItemId): number {
  const r = recipeFor(id);
  if (!r) return 1;
  return rawCost(r.a) + rawCost(r.b);
}

/** Ковать оружие можно из всего, кроме сырья. */
export function isForgeable(id: ItemId): boolean {
  return ITEMS[id].tier >= 1;
}

export const FORGEABLE_ITEMS: ItemId[] = ITEM_ORDER.filter(isForgeable);
