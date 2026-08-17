/**
 * Создание и вспомогательные запросы к состоянию.
 * Ни одной зависимости от рендера.
 */

import { createRng } from '../core/rng.ts';
import {
  BOSSES,
  BOSS_ORDER,
  MINE,
  PLAYER,
  SAVE_VERSION,
  TEMPERING_REDUCTION,
  UPGRADES,
  WEAPON_BASE_COST,
} from '../core/constants.ts';
import { FORGEABLE_ITEMS, ITEM_ORDER, findRecipe } from '../core/items.ts';
import type { ItemId } from '../core/items.ts';
import { emptyInput } from '../core/types.ts';
import type { BossId, GameState, Inventory, MetaState, UpgradeId } from '../core/types.ts';

/** Пустой рюкзак: все узлы дерева присутствуют нулями, чтобы сейв был стабильным. */
export function emptyInventory(): Inventory {
  const inv = {} as Inventory;
  for (const id of ITEM_ORDER) inv[id] = 0;
  return inv;
}

export function createMeta(): MetaState {
  return {
    brands: 0,
    upgrades: [],
    defeated: [],
    backpack: emptyInventory(),
    known: [],
    runsStarted: 0,
    runsWon: 0,
  };
}

export function createGameState(seed: number): GameState {
  return {
    version: SAVE_VERSION,
    tick: 0,
    phase: 'menu',
    rng: createRng(seed),
    input: emptyInput(),
    meta: createMeta(),
    run: null,
    mine: null,
    forge: null,
    combat: null,
    result: null,
    menuCursor: 0,
    notice: '',
    noticeTimer: 0,
  };
}

// ---------------------------------------------------------------------------
// Запросы по мета-прогрессии
// ---------------------------------------------------------------------------

export function hasUpgrade(meta: MetaState, id: UpgradeId): boolean {
  return meta.upgrades.indexOf(id) >= 0;
}

export function backpackCapacity(meta: MetaState): number {
  return MINE.backpackBase + (hasUpgrade(meta, 'roomy_pack') ? MINE.backpackBonus : 0);
}

/** Сколько всего единиц лежит в рюкзаке. Единица любого уровня — один слот. */
export function backpackTotal(bp: Inventory): number {
  let total = 0;
  for (const id of ITEM_ORDER) total += bp[id];
  return total;
}

export function oreYield(meta: MetaState): number {
  return MINE.oreAmount + (hasUpgrade(meta, 'deep_vein') ? MINE.oreAmountBonus : 0);
}

export function durabilityCost(meta: MetaState): number {
  return hasUpgrade(meta, 'tempering') ? 1 - TEMPERING_REDUCTION : 1;
}

export function canAfford(meta: MetaState, id: UpgradeId): boolean {
  return !hasUpgrade(meta, id) && meta.brands >= UPGRADES[id].cost;
}

/**
 * Боссы, доступные на экране выбора.
 * §12, открытый вопрос 2: показываем до трёх — открываются по мере побед,
 * так что первый забег даёт одного, а к финалу выбор становится настоящим.
 */
export function availableBosses(meta: MetaState): BossId[] {
  const out: BossId[] = [];
  for (const id of BOSS_ORDER) {
    const req = BOSSES[id].requires;
    if (req === null || meta.defeated.indexOf(req) >= 0) out.push(id);
  }
  return out;
}

export function isDefeated(meta: MetaState, id: BossId): boolean {
  return meta.defeated.indexOf(id) >= 0;
}

// ---------------------------------------------------------------------------
// Рюкзак
// ---------------------------------------------------------------------------

/**
 * Кладёт в рюкзак сколько влезет, возвращает реально положенное количество.
 * Рюкзак — единственное ограничение фазы добычи (§4), поэтому переполнение
 * должно быть видимым, а не молча съедаться.
 */
export function addItem(bp: Inventory, item: ItemId, amount: number, capacity: number): number {
  const free = Math.max(0, capacity - backpackTotal(bp));
  const put = Math.min(free, amount);
  bp[item] += put;
  return put;
}

/** Списывает предметы, если их хватает. Возвращает false и ничего не трогает, если нет. */
export function takeItems(bp: Inventory, cost: Partial<Record<ItemId, number>>): boolean {
  for (const key of Object.keys(cost) as ItemId[]) {
    if (bp[key] < (cost[key] ?? 0)) return false;
  }
  for (const key of Object.keys(cost) as ItemId[]) {
    bp[key] -= cost[key] ?? 0;
  }
  return true;
}

/** Что реально лежит в рюкзаке — в порядке дерева. Основа сетки на экране кузницы. */
export function ownedItems(bp: Inventory): ItemId[] {
  return ITEM_ORDER.filter((id) => bp[id] > 0);
}

/** Предметы, из которых прямо сейчас хватает на оружие (нужно две единицы). */
export function forgeableItems(bp: Inventory): ItemId[] {
  return FORGEABLE_ITEMS.filter((id) => bp[id] >= WEAPON_BASE_COST);
}

/** Есть ли хоть одна пара, которую можно соединить на верстаке. */
export function canCraftAnything(bp: Inventory): boolean {
  const owned = ownedItems(bp);
  for (let i = 0; i < owned.length; i++) {
    for (let j = i; j < owned.length; j++) {
      const a = owned[i];
      const b = owned[j];
      if (a === b && bp[a] < 2) continue;
      if (findRecipe(a, b)) return true;
    }
  }
  return false;
}

/**
 * Может ли игрок хоть что-то сделать в кузнице: сковать оружие или хотя бы
 * соединить два предмета. Если нет — он в тупике, и ему нужно предложить выход.
 */
export function canForgeAnything(meta: MetaState): boolean {
  return forgeableItems(meta.backpack).length > 0 || canCraftAnything(meta.backpack);
}

/** Отметить узел дерева открытым — рецепт перестаёт показываться как «???». */
export function markKnown(meta: MetaState, item: ItemId): void {
  if (meta.known.indexOf(item) < 0) meta.known.push(item);
}

export function isKnown(meta: MetaState, item: ItemId): boolean {
  return meta.known.indexOf(item) >= 0;
}

export function hpMaxFor(): number {
  return PLAYER.hpMax;
}
