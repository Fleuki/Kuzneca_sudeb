/**
 * Мини-игра ковки (§5).
 *
 * Три удара молотом по полосе с бегунком. Попадание в зону: +10% к случайной
 * характеристике, идеальная зона: +20%, промах: −5%.
 *
 * Это единственный элемент прямого мастерства в фазе подготовки — и, по замыслу,
 * эмоциональный пик забега. Симуляция здесь отвечает только за числа;
 * вспышка и звук на идеальном попадании живут в слое рендера.
 */

import { FORGE, RECIPE_PRIMARY, RECIPE_SECONDARY } from '../../core/constants.ts';
import { nextInt, nextRange } from '../../core/rng.ts';
import type { Rng } from '../../core/rng.ts';
import type { ForgeState, ForgeStrikeResult, GameState, MaterialId } from '../../core/types.ts';
import { durabilityCost, hasUpgrade } from '../state.ts';
import { buildWeapon } from './weapon.ts';

export function createForgeState(state: GameState): ForgeState {
  const strikes = FORGE.baseStrikes + (hasUpgrade(state.meta, 'precise_anvil') ? 1 : 0);
  const zoneHalf =
    FORGE.baseZoneHalf * (hasUpgrade(state.meta, 'bellows') ? 1 + FORGE.bellowsBonus : 1);

  return {
    stage: 'select',
    shape: 'heavy',
    primary: null,
    secondary: null,
    cursorRow: 0,
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

/** Сколько единиц материала нужно с учётом того, что основной и вторичный могут совпадать. */
export function requiredAmount(
  material: MaterialId,
  primary: MaterialId | null,
  secondary: MaterialId | null,
): number {
  let need = 0;
  if (primary === material) need += RECIPE_PRIMARY;
  if (secondary === material) need += RECIPE_SECONDARY;
  return need;
}

/** Хватает ли материалов на выбранный рецепт. */
export function canForge(state: GameState): boolean {
  const forge = state.forge;
  if (!forge || forge.primary === null) return false;
  const bp = state.meta.backpack;
  const mats: MaterialId[] = ['iron', 'obsidian', 'crystal', 'bloodiron'];
  for (const m of mats) {
    if (bp[m] < requiredAmount(m, forge.primary, forge.secondary)) return false;
  }
  return true;
}

/** Списывает материалы и запускает мини-игру. */
export function beginMinigame(state: GameState): boolean {
  const forge = state.forge;
  if (!forge || forge.stage !== 'select' || !canForge(state)) return false;

  const bp = state.meta.backpack;
  const mats: MaterialId[] = ['iron', 'obsidian', 'crystal', 'bloodiron'];
  for (const m of mats) bp[m] -= requiredAmount(m, forge.primary, forge.secondary);

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
  if (!forge || forge.stage !== 'minigame') return;

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
  if (!forge || !run || forge.primary === null) return;

  forge.forged = buildWeapon(
    forge.shape,
    forge.primary,
    forge.secondary,
    { damage: forge.bonusDamage, durability: forge.bonusDurability, speed: forge.bonusSpeed },
    durabilityCost(state.meta),
    forge.results,
  );
  forge.stage = 'done';
  run.weapon = forge.forged;
}
