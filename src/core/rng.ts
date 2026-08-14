/**
 * Детерминированный ГПСЧ (mulberry32).
 *
 * Состояние — обычное число, поэтому оно сериализуется вместе с остальным
 * состоянием игры и переживает сохранение/загрузку. Один сид → один результат,
 * что требуется §11 дизайн-документа для балансировки ботами и реплеев.
 *
 * ВАЖНО: слой рендера НИКОГДА не должен трогать этот ГПСЧ. Для косметики
 * (частицы, тряска экрана) в рендере используется отдельный источник случайности,
 * иначе детерминизм симуляции ломается.
 */

export interface Rng {
  /** Внутренний счётчик. 32 бита без знака. */
  s: number;
}

export function createRng(seed: number): Rng {
  // Приводим к uint32 и уводим от нуля, чтобы сид 0 не давал вырожденную последовательность.
  return { s: (seed >>> 0) || 0x9e3779b9 };
}

export function cloneRng(rng: Rng): Rng {
  return { s: rng.s };
}

/** Следующее целое [0, 2^32). */
export function nextU32(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Следующее дробное [0, 1). */
export function nextFloat(rng: Rng): number {
  return nextU32(rng) / 4294967296;
}

/** Дробное в диапазоне [min, max). */
export function nextRange(rng: Rng, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

/** Целое в диапазоне [min, max] включительно. */
export function nextInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + (nextU32(rng) % (max - min + 1));
}

/** Случайный элемент непустого массива. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[nextU32(rng) % arr.length];
}

/** Событие с вероятностью p. */
export function chance(rng: Rng, p: number): boolean {
  return nextFloat(rng) < p;
}

/**
 * Взвешенный выбор. weights должен быть той же длины, что и items,
 * и содержать неотрицательные числа с ненулевой суммой.
 */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  let roll = nextFloat(rng) * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Перемешивание Фишера — Йетса на месте. */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextU32(rng) % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Сид из строки — для сидов, вводимых игроком, и для тестов. */
export function seedFromString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
