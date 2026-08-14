/**
 * Мелкие помощники рендера: панели, полоски, текст.
 *
 * Рендер только читает состояние и рисует. Ни одна функция здесь не меняет
 * GameState и не дёргает ГПСЧ симуляции (§11).
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { TextStyleOptions } from 'pixi.js';
import { BODY_STYLE, COLORS } from './theme.ts';

export function makeText(
  content: string,
  styleOpts: TextStyleOptions = BODY_STYLE,
  x = 0,
  y = 0,
): Text {
  const t = new Text({ text: content, style: styleOpts });
  t.position.set(x, y);
  return t;
}

export function centerText(t: Text, centerX: number, y: number): void {
  t.position.set(centerX - t.width / 2, y);
}

/** Панель с рамкой — базовый строительный блок всех экранов. */
export function drawPanel(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: number; edge?: number; alpha?: number; radius?: number } = {},
): void {
  const fill = opts.fill ?? COLORS.panel;
  const edge = opts.edge ?? COLORS.panelEdge;
  const radius = opts.radius ?? 4;
  g.roundRect(x, y, w, h, radius)
    .fill({ color: fill, alpha: opts.alpha ?? 1 })
    .stroke({ width: 2, color: edge, alignment: 1 });
}

/** Горизонтальная полоса заполнения (здоровье, прочность, шкала босса). */
export function drawBar(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  fill: number,
  back: number = COLORS.bgDeep,
): void {
  const r = Math.max(0, Math.min(1, ratio));
  g.rect(x, y, w, h).fill(back);
  if (r > 0) g.rect(x, y, w * r, h).fill(fill);
  g.rect(x, y, w, h).stroke({ width: 1, color: COLORS.panelEdge, alignment: 1 });
}

/** Рамка выделения активного пункта меню. */
export function drawSelection(g: Graphics, x: number, y: number, w: number, h: number): void {
  g.roundRect(x - 3, y - 3, w + 6, h + 6, 6).stroke({ width: 2, color: COLORS.gold, alignment: 1 });
}

/**
 * Красный контур опасной зоны. Требование §6: телеграф читается цветом.
 * pulse 0..1 — насколько близко атака к срабатыванию.
 */
export function drawTelegraph(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  pulse: number,
): void {
  const alpha = 0.15 + 0.35 * pulse;
  g.rect(x, y, w, h).fill({ color: COLORS.danger, alpha: alpha * 0.5 });
  g.rect(x, y, w, h).stroke({ width: 2 + 2 * pulse, color: COLORS.dangerSoft, alignment: 1 });
}

/** Контейнер, который умеет очищать своих детей — для пересборки списков. */
export function clearContainer(c: Container): void {
  for (const child of c.removeChildren()) child.destroy();
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Интерполяция позиции сущности между прошлым и текущим тиком.
 * Нужна, потому что симуляция идёт фиксированными шагами по 60 Гц,
 * а экран может обновляться чаще или реже (§11).
 */
export function interp(prev: number, curr: number, alpha: number): number {
  return prev + (curr - prev) * alpha;
}
