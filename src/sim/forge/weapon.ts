/**
 * Вывод характеристик оружия из формы, предметов дерева и результата мини-игры (§5).
 *
 * Считается один раз в момент ковки. Бой уже работает с готовыми числами и
 * ничего не пересчитывает — так проще и балансировать, и показывать игроку
 * итоговую карточку оружия перед выходом на арену.
 */

import { INLAY_WEIGHT, SHAPES } from '../../core/constants.ts';
import { ITEMS } from '../../core/items.ts';
import type { ItemId } from '../../core/items.ts';
import type { ForgeStrikeResult, ShapeId, Weapon } from '../../core/types.ts';

/**
 * Нейтральная точка отсчёта по прочности. Эффект вставки меряется от неё:
 * вставка не «добавляет свою прочность», а сдвигает основу в свою сторону.
 */
const NEUTRAL_DURABILITY = 150;

/**
 * Вставка даёт 40% своего эффекта, а не 40% своего значения.
 * Эффект — это отклонение от нейтрали, поэтому нейтральная вставка
 * ничего не портит и ничего не даёт.
 */
function blendMult(base: number, inlay: number | null): number {
  if (inlay === null) return base;
  return base * (1 + INLAY_WEIGHT * (inlay - 1));
}

function blendFlag(base: number, inlay: number | null): number {
  if (inlay === null) return base;
  return Math.min(1, base + INLAY_WEIGHT * inlay);
}

export interface ForgeBonuses {
  damage: number;
  durability: number;
  speed: number;
}

export const NEUTRAL_BONUSES: ForgeBonuses = { damage: 1, durability: 1, speed: 1 };

export function buildWeapon(
  shapeId: ShapeId,
  baseId: ItemId,
  inlayId: ItemId | null,
  bonuses: ForgeBonuses,
  durabilityCost: number,
  results: ForgeStrikeResult[],
): Weapon {
  const shape = SHAPES[shapeId];
  const base = ITEMS[baseId];
  const inlay = inlayId ? ITEMS[inlayId] : null;

  const damageMult = blendMult(base.damageMult, inlay ? inlay.damageMult : null);
  const speedMult = blendMult(base.speedMult, inlay ? inlay.speedMult : null);
  const durabilityRatio = inlay ? inlay.durability / NEUTRAL_DURABILITY : null;
  const durability = blendMult(base.durability, durabilityRatio);

  const damage = shape.damage * damageMult * bonuses.damage;
  const interval = shape.interval / (speedMult * bonuses.speed);
  const durMax = Math.max(5, Math.round(durability * bonuses.durability));

  return {
    shape: shapeId,
    base: baseId,
    inlay: inlayId,
    damage,
    interval,
    range: shape.range,
    durabilityMax: durMax,
    durability: durMax,
    durabilityCost,
    armorPierce: blendFlag(base.armorPierce, inlay ? inlay.armorPierce : null),
    magicFraction: blendFlag(base.magicFraction, inlay ? inlay.magicFraction : null),
    lifesteal: base.lifesteal + (inlay ? INLAY_WEIGHT * inlay.lifesteal : 0),
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

/** Название оружия одной строкой: «Молот из осадного сплава». */
export function weaponName(w: Weapon): string {
  const base = ITEMS[w.base];
  const shape = SHAPES[w.shape];
  return `${shape.name} · ${base.name}`;
}
