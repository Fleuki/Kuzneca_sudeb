/**
 * Верстак: соединение двух предметов в один.
 *
 * Правило одно на всё дерево — кладёшь два предмета, получаешь один следующего
 * уровня. Пары, которых нет в таблице рецептов, честно не соединяются: смысл
 * дерева в том, что комбинация — это находка, а не результат перебора.
 *
 * Симуляция здесь отвечает только за предметы и списание. Вспышка при открытии
 * нового узла живёт в слое рендера.
 */

import { ITEMS, findRecipe } from '../../core/items.ts';
import type { ItemId, Recipe } from '../../core/items.ts';
import type { ForgeState, GameState } from '../../core/types.ts';
import { markKnown, ownedItems } from '../state.ts';

/** Сколько единиц нужно для соединения именно этого предмета. */
export function craftNeed(recipe: Recipe, item: ItemId): number {
  let n = 0;
  if (recipe.a === item) n += 1;
  if (recipe.b === item) n += 1;
  return n;
}

/** Хватает ли в рюкзаке на то, что лежит в слотах верстака. */
export function canCraft(state: GameState): boolean {
  const forge = state.forge;
  if (!forge) return false;
  const recipe = findRecipe(forge.slotA, forge.slotB);
  if (!recipe) return false;

  const bp = state.meta.backpack;
  if (recipe.a === recipe.b) return bp[recipe.a] >= 2;
  return bp[recipe.a] >= 1 && bp[recipe.b] >= 1;
}

/** Кладёт предмет в свободный слот верстака. Повторный клик по слоту его освобождает. */
export function putInSlot(forge: ForgeState, item: ItemId): void {
  if (forge.slotA === null) {
    forge.slotA = item;
    return;
  }
  if (forge.slotB === null) {
    forge.slotB = item;
    return;
  }
  // Оба слота заняты — новый предмет вытесняет первый, слоты едут влево.
  forge.slotA = forge.slotB;
  forge.slotB = item;
}

export function clearSlots(forge: ForgeState): void {
  forge.slotA = null;
  forge.slotB = null;
}

/**
 * Соединяет содержимое слотов. Возвращает получившийся предмет или null,
 * если пара не складывается или в рюкзаке уже не хватает.
 */
export function craft(state: GameState): ItemId | null {
  const forge = state.forge;
  if (!forge || forge.stage !== 'plan') return null;

  const recipe = findRecipe(forge.slotA, forge.slotB);
  if (!recipe || !canCraft(state)) return null;

  const bp = state.meta.backpack;
  bp[recipe.a] -= 1;
  bp[recipe.b] -= 1;
  bp[recipe.out] += 1;

  markKnown(state.meta, recipe.out);
  forge.lastCraft = recipe.out;
  forge.craftFlash = 0.6;

  // Слоты не чистим, пока хватает материала: одинаковые соединения игрок делает
  // подряд, и заново набирать пару на каждый слиток — лишняя работа пальцами.
  if (!canCraft(state)) clearSlots(forge);

  // Курсор мог указывать на предмет, который только что кончился.
  clampCursor(state);
  return recipe.out;
}

/** Держит курсор сетки внутри списка того, что реально лежит в рюкзаке. */
export function clampCursor(state: GameState): void {
  const forge = state.forge;
  if (!forge) return;
  const owned = ownedItems(state.meta.backpack);
  if (owned.length === 0) {
    forge.cursor = 0;
    return;
  }
  forge.cursor = Math.max(0, Math.min(owned.length - 1, forge.cursor));
}

/** Предмет под курсором сетки. */
export function itemAtCursor(state: GameState): ItemId | null {
  const forge = state.forge;
  if (!forge) return null;
  const owned = ownedItems(state.meta.backpack);
  return owned[forge.cursor] ?? null;
}

/**
 * Что покажет верстак под слотами: имя результата, если узел уже открывали,
 * «???» для неизвестного рецепта и прочерк, если пара не складывается.
 */
export function craftPreview(state: GameState): { text: string; item: ItemId | null } {
  const forge = state.forge;
  if (!forge) return { text: '', item: null };
  if (forge.slotA === null || forge.slotB === null) {
    return { text: 'Выбери два предмета', item: null };
  }

  const recipe = findRecipe(forge.slotA, forge.slotB);
  if (!recipe) return { text: 'Не соединяется', item: null };
  if (!canCraft(state)) return { text: 'Не хватает второй единицы', item: null };
  if (state.meta.known.indexOf(recipe.out) < 0) {
    return { text: '??? — попробуй и узнаешь', item: null };
  }
  return { text: ITEMS[recipe.out].name, item: recipe.out };
}
