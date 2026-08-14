/**
 * Сохранение между фазами (§2).
 *
 * Требование дизайн-документа: игрок должен иметь возможность закрыть вкладку
 * после добычи и вернуться к ковке завтра. Поэтому сохраняется не «мета», а всё
 * состояние симуляции целиком, включая состояние ГПСЧ — иначе продолжение
 * забега перестало бы быть детерминированным.
 *
 * Состояние — чистые данные, так что JSON.stringify достаточно. Это прямое
 * следствие правила «никаких классов и функций внутри состояния» из §11.
 */

import { SAVE_VERSION } from '../core/constants.ts';
import { emptyInput } from '../core/types.ts';
import type { GameState } from '../core/types.ts';

const KEY = 'kuznec_sudeb_save_v1';

/**
 * Абстракция над хранилищем. На Яндекс Играх сюда подставляется
 * player.setData/getData из SDK, на itch.io остаётся localStorage.
 */
export interface Storage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

const localStorageBackend: Storage = {
  read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Приватный режим браузера — играть можно, просто без сохранений.
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // см. выше
    }
  },
};

let backend: Storage = localStorageBackend;

export function setStorageBackend(storage: Storage): void {
  backend = storage;
}

export function saveGame(state: GameState): void {
  // Ввод не сохраняем: зажатая на момент выхода клавиша не должна «залипнуть».
  const snapshot = { ...state, input: emptyInput() };
  backend.write(KEY, JSON.stringify(snapshot));
}

export function loadGame(): GameState | null {
  const raw = backend.read(KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || parsed.version !== SAVE_VERSION) return null;
    parsed.input = emptyInput();
    return migrate(parsed);
  } catch {
    return null;
  }
}

export function clearSave(): void {
  backend.remove(KEY);
}

/**
 * Добивает поля, которых могло не быть в более раннем сейве той же версии.
 * Дешевле, чем ронять сейв игрока из-за одного нового счётчика.
 */
function migrate(state: GameState): GameState {
  if (!state.meta.backpack) {
    state.meta.backpack = { iron: 0, obsidian: 0, crystal: 0, bloodiron: 0 };
  }
  if (!Array.isArray(state.meta.upgrades)) state.meta.upgrades = [];
  if (!Array.isArray(state.meta.defeated)) state.meta.defeated = [];
  if (typeof state.meta.runsStarted !== 'number') state.meta.runsStarted = 0;
  if (typeof state.meta.runsWon !== 'number') state.meta.runsWon = 0;
  if (typeof state.notice !== 'string') state.notice = '';
  if (typeof state.noticeTimer !== 'number') state.noticeTimer = 0;
  return state;
}
