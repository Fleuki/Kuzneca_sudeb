/**
 * Общий контракт сцены и фоновые элементы, одинаковые на всех экранах.
 */

import { Container, Graphics } from 'pixi.js';
import type { Command } from '../../core/commands.ts';
import type { GameState } from '../../core/types.ts';
import { VIEW_H, VIEW_W } from '../../core/constants.ts';
import { COLORS } from '../theme.ts';

/**
 * Область экрана, по которой можно ткнуть пальцем.
 *
 * Координаты — логические (960×540), те же, в которых сцена рисует. Так разметка
 * описана ровно один раз: сцена и рисует кнопку, и говорит, во что превращается
 * тап по ней. Слой ввода переводит координаты касания в логические и шлёт команды,
 * то есть сенсорный ввод идёт тем же путём, что и клавиатура (§11).
 */
export interface HitRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  commands: Command[];
}

export interface Scene {
  container: Container;
  /**
   * @param alpha доля тика для интерполяции позиций (§11)
   * @param time  время с запуска в секундах — только для косметики
   */
  draw(state: GameState, alpha: number, time: number): void;

  /**
   * Куда можно тыкать пальцем на этом экране. Не реализуется сценами,
   * где управление идёт кнопками (шахта, бой, выбор рецепта).
   */
  hitRegions?(state: GameState): HitRegion[];
}

/** Регион во весь экран — для экранов, где годится тап в любое место. */
export function fullScreenRegion(...commands: Command[]): HitRegion {
  return { x: 0, y: 0, w: VIEW_W, h: VIEW_H, commands };
}

/** Тёмный фон с виньеткой и тёплым отблеском горна снизу. */
export function drawScreenBackground(g: Graphics, time: number): void {
  g.rect(0, 0, VIEW_W, VIEW_H).fill(COLORS.bg);

  // Отблеск углей: медленно дышит, чтобы статичный экран не выглядел мёртвым.
  const glow = 0.05 + 0.02 * Math.sin(time * 0.8);
  g.rect(0, VIEW_H - 190, VIEW_W, 190).fill({ color: COLORS.ember, alpha: glow });
  g.rect(0, VIEW_H - 90, VIEW_W, 90).fill({ color: COLORS.ember, alpha: glow });

  // Виньетка по краям.
  g.rect(0, 0, VIEW_W, 4).fill({ color: COLORS.bgDeep, alpha: 0.9 });
  g.rect(0, VIEW_H - 4, VIEW_W, 4).fill({ color: COLORS.bgDeep, alpha: 0.9 });
}

/** Полоска-разделитель под заголовком. */
export function drawRule(g: Graphics, x: number, y: number, w: number): void {
  g.rect(x, y, w, 1).fill({ color: COLORS.goldDim, alpha: 0.6 });
}
