/**
 * Команды — единственный способ изменить состояние извне симуляции (§11).
 *
 * UI не трогает состояние напрямую: он собирает команду и отдаёт её в dispatch().
 * Благодаря этому весь ввод — и живого игрока, и бота из балансировщика —
 * идёт через одну точку, а поток команд можно записать в реплей.
 */

import type { BiomeId, BossId, InputState, MaterialId, ShapeId, UpgradeId } from './types.ts';

export type Command =
  /** Обновить состояние ввода на текущий тик. */
  | { type: 'INPUT'; input: InputState }
  /** Начать новый забег с экрана меню. */
  | { type: 'START_RUN' }
  /** Выбрать босса — до похода в шахту (§1). */
  | { type: 'SELECT_BOSS'; bossId: BossId }
  | { type: 'SELECT_BIOME'; biome: BiomeId }
  /** Уйти из шахты (доступно в зоне выхода). */
  | { type: 'LEAVE_MINE' }
  | { type: 'FORGE_SET_SHAPE'; shape: ShapeId }
  | { type: 'FORGE_SET_PRIMARY'; material: MaterialId }
  /** null — ковать без вторичного материала. */
  | { type: 'FORGE_SET_SECONDARY'; material: MaterialId | null }
  /** Перейти от выбора рецепта к мини-игре. */
  | { type: 'FORGE_BEGIN' }
  /** Удар молотом в мини-игре. */
  | { type: 'FORGE_STRIKE' }
  /** Забрать выкованное оружие и идти на арену. */
  | { type: 'FORGE_TAKE' }
  /** Закрыть экран результата. */
  | { type: 'RESULT_CONTINUE' }
  | { type: 'OPEN_UPGRADES' }
  | { type: 'BUY_UPGRADE'; upgrade: UpgradeId }
  | { type: 'CLOSE_UPGRADES' }
  /** Перемещение курсора на экранах меню. */
  | { type: 'MENU_MOVE'; delta: number }
  /**
   * Поставить курсор меню в конкретную позицию. Нужна сенсорному вводу:
   * палец бьёт сразу по нужному пункту, а не листает до него.
   */
  | { type: 'MENU_SET'; index: number }
  | { type: 'MENU_ROW'; delta: number }
  | { type: 'MENU_CONFIRM' }
  | { type: 'MENU_BACK' }
  /** Бросить текущий забег и вернуться в меню. */
  | { type: 'ABANDON_RUN' };

export type CommandType = Command['type'];
