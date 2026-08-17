/**
 * Главное меню.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { VIEW_W } from '../../core/constants.ts';
import { ITEMS } from '../../core/items.ts';
import type { GameState } from '../../core/types.ts';
import { backpackCapacity, backpackTotal, ownedItems } from '../../sim/state.ts';
import { BODY_STYLE, COLORS, H2_STYLE, SMALL_STYLE, TITLE_STYLE, style } from '../theme.ts';
import { centerText, drawPanel, drawSelection, makeText } from '../ui.ts';
import { hintFor } from '../uiMode.ts';
import { drawScreenBackground } from './scene.ts';
import type { HitRegion, Scene } from './scene.ts';

const OPTIONS = ['Новый забег', 'Кузница'];

// Разметка вынесена в константы: по ней и рисуются пункты, и считаются
// области для тапа, поэтому они не могут разъехаться.
const OPT_W = 300;
const OPT_H = 52;
const OPT_Y = 214;
const OPT_GAP = 16;
const OPT_X = VIEW_W / 2 - OPT_W / 2;

export class MenuScene implements Scene {
  container = new Container();
  private g = new Graphics();
  private title = makeText('КУЗНЕЦ СУДЕБ', TITLE_STYLE);
  private tagline = makeText('Сам кую — сам и проверяю', style(16, COLORS.goldDim, { letterSpacing: 3 }));
  private options: Text[] = [];
  private stats = makeText('', SMALL_STYLE);
  private stock = makeText('', BODY_STYLE);
  private stockLabel = makeText('В рюкзаке', SMALL_STYLE);
  private notice = makeText('', style(15, COLORS.ember));
  private hint = makeText('', SMALL_STYLE);

  constructor() {
    this.container.addChild(this.g, this.title, this.tagline);
    for (const label of OPTIONS) {
      const t = makeText(label, H2_STYLE);
      this.options.push(t);
      this.container.addChild(t);
    }
    this.container.addChild(this.stats, this.stockLabel, this.stock, this.notice, this.hint);
  }

  draw(state: GameState, _alpha: number, time: number): void {
    const g = this.g;
    g.clear();
    drawScreenBackground(g, time);

    centerText(this.title, VIEW_W / 2, 96);
    centerText(this.tagline, VIEW_W / 2, 152);

    // Пункты меню
    const boxW = OPT_W;
    const boxH = OPT_H;
    const x = OPT_X;
    let y = OPT_Y;
    for (let i = 0; i < this.options.length; i++) {
      const selected = state.menuCursor === i;
      drawPanel(g, x, y, boxW, boxH, {
        fill: selected ? COLORS.panelHi : COLORS.panel,
        edge: selected ? COLORS.gold : COLORS.panelEdge,
      });
      if (selected) drawSelection(g, x, y, boxW, boxH);
      const t = this.options[i];
      t.style.fill = selected ? COLORS.gold : COLORS.textDim;
      centerText(t, VIEW_W / 2, y + boxH / 2 - t.height / 2);
      y += boxH + OPT_GAP;
    }

    // Склад материалов, оставшихся с прошлых забегов (§8)
    const capacity = backpackCapacity(state.meta);
    const total = backpackTotal(state.meta.backpack);
    // Показываем верхушку дерева: что игрок принёс ценного, а не список руды.
    const owned = ownedItems(state.meta.backpack);
    const top = owned
      .slice()
      .sort((a, b) => ITEMS[b].tier - ITEMS[a].tier)
      .slice(0, 4);
    const parts = top.map((id) => `${ITEMS[id].name} ${state.meta.backpack[id]}`);
    if (owned.length > top.length) parts.push(`и ещё ${owned.length - top.length}`);
    this.stock.text = parts.length > 0 ? parts.join('   ·   ') : 'пусто';
    this.stockLabel.text = `В рюкзаке  ${total}/${capacity}`;

    const panelY = 380;
    drawPanel(g, VIEW_W / 2 - 300, panelY, 600, 74, { alpha: 0.85 });
    this.stockLabel.position.set(VIEW_W / 2 - 282, panelY + 12);
    this.stock.position.set(VIEW_W / 2 - 282, panelY + 36);

    this.stats.text = `Клейма: ${state.meta.brands}   ·   Забегов: ${state.meta.runsStarted}   ·   Побед: ${state.meta.runsWon}`;
    centerText(this.stats, VIEW_W / 2, 178);

    this.hint.text = hintFor('↑↓ выбор · Enter подтвердить', 'Выбери пункт касанием');
    this.notice.text = state.noticeTimer > 0 ? state.notice : '';
    centerText(this.notice, VIEW_W / 2, 476);
    centerText(this.hint, VIEW_W / 2, 502);
  }

  hitRegions(): HitRegion[] {
    return OPTIONS.map((_, i) => ({
      x: OPT_X,
      y: OPT_Y + i * (OPT_H + OPT_GAP),
      w: OPT_W,
      h: OPT_H,
      // Курсор двигаем вместе с тапом, иначе подсветка отстаёт от пальца.
      commands: [
        { type: 'MENU_SET', index: i } as const,
        i === 0 ? ({ type: 'START_RUN' } as const) : ({ type: 'OPEN_UPGRADES' } as const),
      ],
    }));
  }
}
