/**
 * Создание и вспомогательные запросы к состоянию.
 * Ни одной зависимости от рендера.
 */

import { createRng } from '../core/rng.ts';
import {
  BOSSES,
  BOSS_ORDER,
  MATERIAL_ORDER,
  MINE,
  RECIPE_PRIMARY,
  PLAYER,
  SAVE_VERSION,
  TEMPERING_REDUCTION,
  UPGRADES,
} from '../core/constants.ts';
import { emptyInput } from '../core/types.ts';
import type {
  Backpack,
  BossId,
  GameState,
  MetaState,
  MaterialId,
  UpgradeId,
} from '../core/types.ts';

export function emptyBackpack(): Backpack {
  return { iron: 0, obsidian: 0, crystal: 0, bloodiron: 0 };
}

export function createMeta(): MetaState {
  return {
    brands: 0,
    upgrades: [],
    defeated: [],
    backpack: emptyBackpack(),
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

export function backpackTotal(bp: Backpack): number {
  return bp.iron + bp.obsidian + bp.crystal + bp.bloodiron;
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
// Ресурсы
// ---------------------------------------------------------------------------

/**
 * Кладёт в рюкзак сколько влезет, возвращает реально положенное количество.
 * Рюкзак — единственное ограничение фазы добычи (§4), поэтому переполнение
 * должно быть видимым, а не молча съедаться.
 */
export function addToBackpack(
  bp: Backpack,
  material: MaterialId,
  amount: number,
  capacity: number,
): number {
  const free = Math.max(0, capacity - backpackTotal(bp));
  const put = Math.min(free, amount);
  bp[material] += put;
  return put;
}

/**
 * Хватает ли материала хоть на какое-нибудь оружие.
 *
 * Если нет — игрок в тупике, и ему нужно предложить выход: спуститься ещё раз
 * или выбросить лишнее из полного рюкзака.
 */
export function canForgeAnything(meta: MetaState): boolean {
  for (const m of MATERIAL_ORDER) {
    if (meta.backpack[m] >= RECIPE_PRIMARY) return true;
  }
  return false;
}

export function hpMaxFor(): number {
  return PLAYER.hpMax;
}
