/**
 * Палитра и типографика.
 *
 * Игра рисуется примитивами, без спрайтов: на MVP это осознанный размен —
 * читаемость силуэтов и телеграфов важнее картинки, а художника на первые
 * восемь недель плана всё равно нет.
 */

import type { TextStyleOptions } from 'pixi.js';

export const COLORS = {
  bg: 0x0d0b0e,
  bgDeep: 0x07060a,
  panel: 0x16131a,
  panelEdge: 0x2c2533,
  panelHi: 0x241f2b,

  gold: 0xc8a24a,
  goldDim: 0x7c6430,
  ember: 0xe07a35,
  emberHot: 0xffd27a,

  text: 0xe6e0d8,
  textDim: 0x9a9088,
  textFaint: 0x625a55,

  danger: 0xd8433f,
  dangerSoft: 0xff7a6a,
  good: 0x6fbf73,
  magic: 0x63e0d8,

  hpFill: 0xc0392b,
  hpBack: 0x3a1c18,
  bossFill: 0xb8863a,
  durFill: 0x8fa8c8,
} as const;

const FONT = 'Trebuchet MS, Segoe UI, Roboto, system-ui, sans-serif';

export function style(
  size: number,
  fill: number = COLORS.text,
  extra: Partial<TextStyleOptions> = {},
): TextStyleOptions {
  return {
    fontFamily: FONT,
    fontSize: size,
    fill,
    ...extra,
  };
}

export const TITLE_STYLE = style(46, COLORS.gold, { letterSpacing: 6 });
export const H1_STYLE = style(28, COLORS.text, { letterSpacing: 2 });
export const H2_STYLE = style(20, COLORS.text);
export const BODY_STYLE = style(16, COLORS.textDim);
export const SMALL_STYLE = style(13, COLORS.textFaint);
