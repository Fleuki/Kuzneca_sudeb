/**
 * Общий контракт сцены и фоновые элементы, одинаковые на всех экранах.
 */

import { Container, Graphics } from 'pixi.js';
import type { GameState } from '../../core/types.ts';
import { VIEW_H, VIEW_W } from '../../core/constants.ts';
import { COLORS } from '../theme.ts';

export interface Scene {
  container: Container;
  /**
   * @param alpha доля тика для интерполяции позиций (§11)
   * @param time  время с запуска в секундах — только для косметики
   */
  draw(state: GameState, alpha: number, time: number): void;
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
