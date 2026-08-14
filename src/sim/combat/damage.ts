/**
 * Расчёт урона по боссу.
 *
 * Здесь сходятся все три «ответа» из §6:
 *   - броня Голема режет физический урон, обсидиан её игнорирует;
 *   - щит второй фазы Повелителя режет физический урон, магия кристалла
 *     проходит сквозь него;
 *   - вампиризм кровавого железа окупает чип-урон Гарпии.
 */

import type { Weapon } from '../../core/types.ts';

export interface DamageBreakdown {
  /** Итоговый урон после брони и щита. */
  total: number;
  /** Физическая часть после всех снижений. */
  physical: number;
  /** Магическая часть — не режется ничем. */
  magical: number;
  /** Сколько урона съели защиты — для подсказки на экране поражения. */
  blocked: number;
}

export function computeDamage(weapon: Weapon, armor: number, shield: number): DamageBreakdown {
  const raw = weapon.damage;

  // Броня — физическая защита: её снимает только пробой обсидиана.
  // Магия сквозь броню НЕ проходит, иначе кристалл стал бы ответом сразу на всё,
  // и «обсидиан против Голема» перестал бы быть решением.
  const effectiveArmor = armor * (1 - weapon.armorPierce);
  const afterArmor = raw * (1 - effectiveArmor);

  // Щит — магический барьер: его гасит только магическая доля урона.
  const magical = afterArmor * weapon.magicFraction;
  const physical = (afterArmor - magical) * (1 - shield);

  const total = physical + magical;
  return { total, physical, magical, blocked: raw - total };
}

/** Здоровье, возвращаемое вампиризмом за это попадание. */
export function lifestealFor(weapon: Weapon, damageDealt: number): number {
  return damageDealt * weapon.lifesteal;
}
