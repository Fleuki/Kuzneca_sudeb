/**
 * Кузница: апгрейды за клейма (§8).
 *
 * Мета-прогрессия намеренно короткая — пять пунктов, без дерева навыков.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { UPGRADES, UPGRADE_ORDER, VIEW_W } from '../../core/constants.ts';
import type { GameState } from '../../core/types.ts';
import { canAfford, hasUpgrade } from '../../sim/state.ts';
import { COLORS, H1_STYLE, SMALL_STYLE, style } from '../theme.ts';
import { centerText, drawPanel, drawSelection, makeText } from '../ui.ts';
import { hintFor } from '../uiMode.ts';
import { drawScreenBackground } from './scene.ts';
import type { HitRegion, Scene } from './scene.ts';

const ROW_W = 620;
const ROW_H = 56;
const ROW_Y = 148;
const ROW_GAP = 12;
const ROW_X = VIEW_W / 2 - ROW_W / 2;

interface RowTexts {
  name: Text;
  effect: Text;
  cost: Text;
}

export class UpgradesScene implements Scene {
  container = new Container();
  private g = new Graphics();
  private title = makeText('Кузница', H1_STYLE);
  private brands = makeText('', style(17, COLORS.gold));
  private notice = makeText('', style(15, COLORS.ember));
  private hint = makeText('', SMALL_STYLE);
  private rows: RowTexts[] = [];

  constructor() {
    this.container.addChild(this.g, this.title, this.brands);
    for (let i = 0; i < UPGRADE_ORDER.length; i++) {
      const row: RowTexts = {
        name: makeText('', style(17, COLORS.text)),
        effect: makeText('', style(14, COLORS.textDim)),
        cost: makeText('', style(15, COLORS.gold)),
      };
      this.rows.push(row);
      this.container.addChild(row.name, row.effect, row.cost);
    }
    this.container.addChild(this.notice, this.hint);
  }

  draw(state: GameState, _alpha: number, time: number): void {
    const g = this.g;
    g.clear();
    drawScreenBackground(g, time);

    centerText(this.title, VIEW_W / 2, 52);
    this.brands.text = `Клейма: ${state.meta.brands}`;
    centerText(this.brands, VIEW_W / 2, 100);
    this.hint.text = hintFor('↑↓ выбор · Enter купить · Esc назад', 'Тапни по апгрейду, чтобы купить');
    centerText(this.hint, VIEW_W / 2, 496);

    const x = ROW_X;
    for (let i = 0; i < UPGRADE_ORDER.length; i++) {
      const def = UPGRADES[UPGRADE_ORDER[i]];
      const row = this.rows[i];
      const y = ROW_Y + i * (ROW_H + ROW_GAP);
      const selected = state.menuCursor === i;
      const owned = hasUpgrade(state.meta, def.id);
      const affordable = canAfford(state.meta, def.id);

      drawPanel(g, x, y, ROW_W, ROW_H, {
        fill: selected ? COLORS.panelHi : COLORS.panel,
        edge: selected ? COLORS.gold : COLORS.panelEdge,
        alpha: owned ? 0.6 : 1,
      });
      if (selected) drawSelection(g, x, y, ROW_W, ROW_H);

      row.name.text = def.name;
      row.name.style.fill = owned ? COLORS.textFaint : COLORS.text;
      row.name.position.set(x + 20, y + 10);

      row.effect.text = def.effect;
      row.effect.position.set(x + 20, y + 32);

      row.cost.text = owned ? 'установлено' : `${def.cost} ✦`;
      row.cost.style.fill = owned ? COLORS.good : affordable ? COLORS.gold : COLORS.textFaint;
      row.cost.position.set(x + ROW_W - 20 - row.cost.width, y + 18);
    }

    this.notice.text = state.noticeTimer > 0 ? state.notice : '';
    centerText(this.notice, VIEW_W / 2, 462);
  }

  hitRegions(): HitRegion[] {
    return UPGRADE_ORDER.map((upgrade, i) => ({
      x: ROW_X,
      y: ROW_Y + i * (ROW_H + ROW_GAP),
      w: ROW_W,
      h: ROW_H,
      commands: [
        { type: 'MENU_SET', index: i } as const,
        { type: 'BUY_UPGRADE', upgrade } as const,
      ],
    }));
  }
}
