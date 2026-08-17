/**
 * Общий контракт сцены и фоновые элементы, одинаковые на всех экранах.
 */

import { Container, Graphics } from 'pixi.js';
import { Atmosphere } from '../atmosphere.ts';
import { FORGE_ATMOSPHERE } from '../themes.ts';
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

/**
 * Тёмный фон меню и кузницы.
 *
 * Здесь только градиент, зарево и виньетка: летящие угли рисует общий
 * атмосферный слой (`screenAtmosphere`), потому что им нужно своё время кадра.
 */
export function drawScreenBackground(g: Graphics): void {
  // Заливки фона здесь нет намеренно: градиент рисует атмосферный слой, который
  // лежит ПОД этой графикой. Непрозрачный прямоугольник перекрыл бы его целиком.

  // Зарево горна тоже рисует атмосферный слой — здесь оно только удвоило бы
  // яркость и подняло нижнюю треть экрана до цвета панелей.

  // Виньетка по краям.
  g.rect(0, 0, VIEW_W, 4).fill({ color: COLORS.bgDeep, alpha: 0.9 });
  g.rect(0, VIEW_H - 4, VIEW_W, 4).fill({ color: COLORS.bgDeep, alpha: 0.9 });
}

/**
 * Один общий атмосферный слой для всех экранов вне шахты и боя.
 *
 * Он один на все меню сознательно: угли над горном — это одно и то же место,
 * и при переходе «меню → выбор босса → кузница» они не должны перескакивать.
 */
const screenLayer = new Atmosphere();
let screenLast = 0;

/**
 * Подкладывает угли под экран и обновляет их. Слой один на все меню, поэтому
 * при смене экрана он переезжает к новой сцене — иначе угли перескакивали бы
 * на переходе «меню → выбор босса → кузница», хотя место одно и то же.
 */
export function useScreenAtmosphere(container: Container, time: number): void {
  screenLayer.setTheme('forge', FORGE_ATMOSPHERE);
  if (screenLayer.container.parent !== container) container.addChildAt(screenLayer.container, 0);

  const dt = Math.min(0.05, Math.max(0, time - screenLast));
  screenLast = time;
  screenLayer.draw(0, dt, time);
}

/** Полоска-разделитель под заголовком. */
export function drawRule(g: Graphics, x: number, y: number, w: number): void {
  g.rect(x, y, w, 1).fill({ color: COLORS.goldDim, alpha: 0.6 });
}
