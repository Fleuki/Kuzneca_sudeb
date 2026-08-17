/**
 * Фаза кузницы: верстак, наковальня и мини-игра на тайминг (§5).
 *
 * Кузница делится надвое. **Верстак** — дерево предметов: два предмета дают
 * один следующего уровня. **Наковальня** — сборка оружия: форма, основа и
 * вставка, а дальше три удара молотом по полосе с бегунком.
 *
 * Мини-игра осталась прежней: попадание в зону +10% к случайной характеристике,
 * идеальная зона +20%, промах −5%. Это единственный элемент прямого мастерства
 * в фазе подготовки — и, по замыслу, эмоциональный пик забега.
 */

import { FORGE, WEAPON_BASE_COST, WEAPON_INLAY_COST } from '../../core/constants.ts';
import { ITEMS } from '../../core/items.ts';
import type { ItemId } from '../../core/items.ts';
import { nextInt, nextRange } from '../../core/rng.ts';
import type { Rng } from '../../core/rng.ts';
import type { ForgeState, ForgeStrikeResult, GameState } from '../../core/types.ts';
import { durabilityCost, forgeableItems, hasUpgrade } from '../state.ts';
import { buildWeapon } from './weapon.ts';

export function createForgeState(state: GameState): ForgeState {
  const strikes = FORGE.baseStrikes + (hasUpgrade(state.meta, 'precise_anvil') ? 1 : 0);
  const zoneHalf =
    FORGE.baseZoneHalf * (hasUpgrade(state.meta, 'bellows') ? 1 + FORGE.bellowsBonus : 1);

  // Верстак открыт первым: пока в рюкзаке одна руда, ковать всё равно нечего,
  // а вот соединять — есть что.
  const ready = forgeableItems(state.meta.backpack);

  return {
    stage: 'plan',
    tab: ready.length > 0 ? 'assemble' : 'craft',

    cursor: 0,
    slotA: null,
    slotB: null,
    lastCraft: null,
    craftFlash: 0,
    craftCount: 0,

    shape: 'heavy',
    base: bestBase(state),
    inlay: null,
    assembleRow: 0,

    strikesTotal: strikes,
    strikesDone: 0,
    results: [],
    marker: 0,
    markerDir: 1,
    markerSpeed: FORGE.baseSpeed,
    zoneCenter: 0.5,
    zoneHalf,
    perfectHalf: zoneHalf * FORGE.perfectRatio,
    bonusDamage: 1,
    bonusDurability: 1,
    bonusSpeed: 1,
    forged: null,
    strikeFlash: 0,
    lastResult: null,
  };
}

/** Осмысленный стартовый выбор основы: самый высокий узел, на который хватает. */
export function bestBase(state: GameState): ItemId | null {
  const ready = forgeableItems(state.meta.backpack);
  if (ready.length === 0) return null;
  let best = ready[0];
  for (const id of ready) {
    if (ITEMS[id].tier > ITEMS[best].tier) best = id;
  }
  return best;
}

/** Сколько единиц предмета съест текущий рецепт оружия. */
export function requiredAmount(item: ItemId, base: ItemId | null, inlay: ItemId | null): number {
  let need = 0;
  if (base === item) need += WEAPON_BASE_COST;
  if (inlay === item) need += WEAPON_INLAY_COST;
  return need;
}

/** Хватает ли предметов на выбранный рецепт оружия. */
export function canForge(state: GameState): boolean {
  const forge = state.forge;
  if (!forge || forge.base === null) return false;
  const bp = state.meta.backpack;
  if (bp[forge.base] < requiredAmount(forge.base, forge.base, forge.inlay)) return false;
  if (forge.inlay && bp[forge.inlay] < requiredAmount(forge.inlay, forge.base, forge.inlay)) {
    return false;
  }
  return true;
}

/** Списывает предметы и запускает мини-игру. */
export function beginMinigame(state: GameState): boolean {
  const forge = state.forge;
  if (!forge || forge.stage !== 'plan' || forge.base === null || !canForge(state)) return false;

  const bp = state.meta.backpack;
  bp[forge.base] -= WEAPON_BASE_COST;
  if (forge.inlay) bp[forge.inlay] -= WEAPON_INLAY_COST;

  forge.stage = 'minigame';
  forge.marker = 0;
  forge.markerDir = 1;
  forge.markerSpeed = FORGE.baseSpeed;
  randomizeZone(forge, state.rng);
  return true;
}

function randomizeZone(forge: ForgeState, rng: Rng): void {
  forge.zoneCenter = nextRange(rng, FORGE.zoneMargin, 1 - FORGE.zoneMargin);
}

export function stepForge(state: GameState, dt: number): void {
  const forge = state.forge;
  if (!forge) return;

  if (forge.craftFlash > 0) forge.craftFlash -= dt;
  if (forge.stage !== 'minigame') return;

  if (forge.strikeFlash > 0) {
    forge.strikeFlash -= dt;
    // Пока показываем результат удара, бегунок стоит.
    if (forge.strikeFlash <= 0 && forge.strikesDone >= forge.strikesTotal) finishForge(state);
    return;
  }

  forge.marker += forge.markerDir * forge.markerSpeed * dt;
  if (forge.marker >= 1) {
    forge.marker = 1 - (forge.marker - 1);
    forge.markerDir = -1;
  } else if (forge.marker <= 0) {
    forge.marker = -forge.marker;
    forge.markerDir = 1;
  }
}

/** Удар молотом. Возвращает результат или null, если бить сейчас нельзя. */
export function forgeStrike(state: GameState): ForgeStrikeResult | null {
  const forge = state.forge;
  if (!forge || forge.stage !== 'minigame') return null;
  if (forge.strikeFlash > 0 || forge.strikesDone >= forge.strikesTotal) return null;

  const d = Math.abs(forge.marker - forge.zoneCenter);
  let result: ForgeStrikeResult;
  let delta: number;

  if (d <= forge.perfectHalf) {
    result = 'perfect';
    delta = FORGE.perfectBonus;
  } else if (d <= forge.zoneHalf) {
    result = 'good';
    delta = FORGE.goodBonus;
  } else {
    result = 'miss';
    delta = FORGE.missPenalty;
  }

  applyBonus(state, forge, delta);

  forge.results.push(result);
  forge.lastResult = result;
  forge.strikesDone += 1;
  forge.strikeFlash = FORGE.flashTime;
  forge.markerSpeed += FORGE.speedStep;
  randomizeZone(forge, state.rng);

  return result;
}

/** Бонус падает на случайную характеристику — это и есть «случайной характеристике» из §5. */
function applyBonus(state: GameState, forge: ForgeState, delta: number): void {
  const stat = nextInt(state.rng, 0, 2);
  if (stat === 0) forge.bonusDamage *= 1 + delta;
  else if (stat === 1) forge.bonusDurability *= 1 + delta;
  else forge.bonusSpeed *= 1 + delta;
}

function finishForge(state: GameState): void {
  const forge = state.forge;
  const run = state.run;
  if (!forge || !run || forge.base === null) return;

  forge.forged = buildWeapon(
    forge.shape,
    forge.base,
    forge.inlay,
    { damage: forge.bonusDamage, durability: forge.bonusDurability, speed: forge.bonusSpeed },
    durabilityCost(state.meta),
    forge.results,
  );
  forge.stage = 'done';
  run.weapon = forge.forged;
}
