/**
 * Каким устройством сейчас играют — только для формулировки подсказок.
 *
 * Это единственное, что рендер знает про ввод, и оно намеренно не хранится
 * в GameState: способ управления не влияет на симуляцию и не должен попадать
 * ни в сохранение, ни в реплей (§11). Иначе один и тот же сид давал бы разные
 * состояния на телефоне и на десктопе.
 */

let touchMode = false;

export function setTouchMode(value: boolean): void {
  touchMode = value;
}

export function isTouchMode(): boolean {
  return touchMode;
}

/** Выбирает формулировку подсказки под текущий способ управления. */
export function hintFor(keyboard: string, touch: string): string {
  return touchMode ? touch : keyboard;
}
