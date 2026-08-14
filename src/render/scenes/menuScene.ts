/**
 * Главное меню.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { MATERIALS, MATERIAL_ORDER, VIEW_W } from '../../core/constants.ts';
import type { GameState } from '../../core/types.ts';
import { backpackCapacity, backpackTotal } from '../../sim/state.ts';
import { BODY_STYLE, COLORS, H2_STYLE, SMALL_STYLE, TITLE_STYLE, style } from '../theme.ts';
import { centerText, drawPanel, drawSelection, makeText } from '../ui.ts';
import { drawScreenBackground } from './scene.ts';
import type { Scene } from './scene.ts';

const OPTIONS = ['Новый забег', 'Кузница'];

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
  private hint = makeText('↑↓ выбор · Enter подтвердить', SMALL_STYLE);

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
    const boxW = 300;
    const boxH = 52;
    const x = VIEW_W / 2 - boxW / 2;
    let y = 214;
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
      y += boxH + 16;
    }

    // Склад материалов, оставшихся с прошлых забегов (§8)
    const capacity = backpackCapacity(state.meta);
    const total = backpackTotal(state.meta.backpack);
    const parts = MATERIAL_ORDER.filter((m) => state.meta.backpack[m] > 0).map(
      (m) => `${MATERIALS[m].name} ${state.meta.backpack[m]}`,
    );
    this.stock.text = parts.length > 0 ? parts.join('   ·   ') : 'пусто';
    this.stockLabel.text = `В рюкзаке  ${total}/${capacity}`;

    const panelY = 380;
    drawPanel(g, VIEW_W / 2 - 300, panelY, 600, 74, { alpha: 0.85 });
    this.stockLabel.position.set(VIEW_W / 2 - 282, panelY + 12);
    this.stock.position.set(VIEW_W / 2 - 282, panelY + 36);

    this.stats.text = `Клейма: ${state.meta.brands}   ·   Забегов: ${state.meta.runsStarted}   ·   Побед: ${state.meta.runsWon}`;
    centerText(this.stats, VIEW_W / 2, 178);

    this.notice.text = state.noticeTimer > 0 ? state.notice : '';
    centerText(this.notice, VIEW_W / 2, 476);
    centerText(this.hint, VIEW_W / 2, 502);
  }
}
