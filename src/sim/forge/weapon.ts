/**
 * Вывод характеристик оружия из формы, материалов и результата мини-игры (§5).
 *
 * Считается один раз в момент ковки. Бой уже работает с готовыми числами и
 * ничего не пересчитывает — так проще и балансировать, и показывать игроку
 * итоговую карточку оружия перед выходом на арену.
 */

import { MATERIALS, SECONDARY_WEIGHT, SHAPES } from '../../core/constants.ts';
import type { ForgeStrikeResult, MaterialId, ShapeId, Weapon } from '../../core/types.ts';

/** Нейтральная точка отсчёта — железо. Эффект вторичного материала меряется от неё. */
const NEUTRAL_DURABILITY = MATERIALS.iron.durability;

/**
 * Вторичный материал даёт 40% своего эффекта, а не 40% своего значения.
 * Эффект — это отклонение от нейтрального железа, поэтому вторичное железо
 * не портит характеристики, а просто ничего не меняет.
 */
function blendMult(primary: number, secondary: number | null): number {
  if (secondary === null) return primary;
  return primary * (1 + SECONDARY_WEIGHT * (secondary - 1));
}

function blendFlag(primary: number, secondary: number | null): number {
  if (secondary === null) return primary;
  return Math.min(1, primary + SECONDARY_WEIGHT * secondary);
}

export interface ForgeBonuses {
  damage: number;
  durability: number;
  speed: number;
}

export const NEUTRAL_BONUSES: ForgeBonuses = { damage: 1, durability: 1, speed: 1 };

export function buildWeapon(
  shapeId: ShapeId,
  primaryId: MaterialId,
  secondaryId: MaterialId | null,
  bonuses: ForgeBonuses,
  durabilityCost: number,
  results: ForgeStrikeResult[],
): Weapon {
  const shape = SHAPES[shapeId];
  const pm = MATERIALS[primaryId];
  const sm = secondaryId ? MATERIALS[secondaryId] : null;

  const damageMult = blendMult(pm.damageMult, sm ? sm.damageMult : null);
  const speedMult = blendMult(pm.speedMult, sm ? sm.speedMult : null);
  const durabilityRatio = sm ? sm.durability / NEUTRAL_DURABILITY : null;
  const durability = blendMult(pm.durability, durabilityRatio);

  const damage = shape.damage * damageMult * bonuses.damage;
  const interval = shape.interval / (speedMult * bonuses.speed);
  const durMax = Math.max(5, Math.round(durability * bonuses.durability));

  return {
    shape: shapeId,
    primary: primaryId,
    secondary: secondaryId,
    damage,
    interval,
    range: shape.range,
    durabilityMax: durMax,
    durability: durMax,
    durabilityCost,
    armorPierce: blendFlag(pm.armorPierce, sm ? sm.armorPierce : null),
    magicFraction: blendFlag(pm.magicFraction, sm ? sm.magicFraction : null),
    lifesteal: pm.lifesteal + (sm ? SECONDARY_WEIGHT * sm.lifesteal : 0),
    forgeResults: results.slice(),
  };
}

/** DPS без учёта брони — для карточки оружия. */
export function weaponDps(w: Weapon): number {
  return w.damage / w.interval;
}

/** Сколько попаданий выдержит оружие. */
export function weaponHits(w: Weapon): number {
  return Math.floor(w.durabilityMax / w.durabilityCost);
}
