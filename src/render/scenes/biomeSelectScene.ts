/**
 * Экран выбора биома.
 *
 * Наверху постоянно висит напоминание, какой босс выбран и какой материал
 * его вскрывает — именно эта связка превращает добычу из грайнда в задачу (§1).
 */

import { Container, Graphics, Text } from 'pixi.js';
import { BIOMES, BIOME_ORDER, BOSSES, MATERIALS, MATERIAL_ORDER, VIEW_W } from '../../core/constants.ts';
import type { GameState } from '../../core/types.ts';
import { backpackCapacity, backpackTotal } from '../../sim/state.ts';
import { COLORS, H1_STYLE, SMALL_STYLE, style } from '../theme.ts';
import { centerText, drawPanel, drawSelection, makeText } from '../ui.ts';
import { drawScreenBackground } from './scene.ts';
import type { Scene } from './scene.ts';

const CARD_W = 276;
const CARD_H = 268;
const CARD_Y = 172;

interface CardTexts {
  name: Text;
  note: Text;
  danger: Text;
  legend: Text[];
}

export class BiomeSelectScene implements Scene {
  container = new Container();
  private g = new Graphics();
  private title = makeText('Куда спускаться', H1_STYLE);
  private target = makeText('', style(16, COLORS.text));
  private capacity = makeText('', SMALL_STYLE);
  private hint = makeText('← → выбор · Enter спуститься · Esc назад', SMALL_STYLE);
  private cards: CardTexts[] = [];

  constructor() {
    this.container.addChild(this.g, this.title, this.target, this.capacity);

    for (let i = 0; i < BIOME_ORDER.length; i++) {
      const legend: Text[] = [];
      for (let m = 0; m < MATERIAL_ORDER.length; m++) {
        const t = makeText('', style(13, COLORS.textDim));
        legend.push(t);
        this.container.addChild(t);
      }
      const card: CardTexts = {
        name: makeText('', style(20, COLORS.text)),
        note: makeText('', style(14, COLORS.textDim, { wordWrap: true, wordWrapWidth: CARD_W - 40, lineHeight: 19 })),
        danger: makeText('', style(13, COLORS.danger)),
        legend,
      };
      this.cards.push(card);
      this.container.addChild(card.name, card.note, card.danger);
    }

    this.container.addChild(this.hint);
  }

  draw(state: GameState, _alpha: number, time: number): void {
    const g = this.g;
    g.clear();
    drawScreenBackground(g, time);

    centerText(this.title, VIEW_W / 2, 44);
    centerText(this.hint, VIEW_W / 2, 496);

    // Напоминание о цели забега.
    const run = state.run;
    if (run) {
      const boss = BOSSES[run.bossId];
      const answer = MATERIALS[boss.answer];
      drawPanel(g, VIEW_W / 2 - 330, 92, 660, 54, { alpha: 0.9 });
      this.target.text = `Идёшь на: ${boss.name}   →   нужен ${answer.name}`;
      centerText(this.target, VIEW_W / 2, 104);

      const total = backpackTotal(state.meta.backpack);
      const cap = backpackCapacity(state.meta);
      this.capacity.text = `Рюкзак: ${total}/${cap}   ·   на оружие нужно 12 основного + 6 вторичного`;
      centerText(this.capacity, VIEW_W / 2, 128);
    }

    const totalW = BIOME_ORDER.length * CARD_W + (BIOME_ORDER.length - 1) * 20;
    const startX = VIEW_W / 2 - totalW / 2;

    for (let i = 0; i < BIOME_ORDER.length; i++) {
      const def = BIOMES[BIOME_ORDER[i]];
      const card = this.cards[i];
      const x = startX + i * (CARD_W + 20);
      const selected = state.menuCursor === i;

      drawPanel(g, x, CARD_Y, CARD_W, CARD_H, {
        fill: selected ? COLORS.panelHi : COLORS.panel,
        edge: selected ? COLORS.gold : COLORS.panelEdge,
      });
      if (selected) drawSelection(g, x, CARD_Y, CARD_W, CARD_H);

      // Образец породы биома.
      g.roundRect(x + 20, CARD_Y + 18, CARD_W - 40, 44, 3)
        .fill(def.tileColor)
        .stroke({ width: 2, color: def.tileEdge, alignment: 1 });

      card.name.text = def.name;
      card.name.position.set(x + 20, CARD_Y + 74);

      card.note.text = def.note;
      card.note.position.set(x + 20, CARD_Y + 102);

      card.danger.text = `Опасность: ${def.danger}`;
      card.danger.style.fill = i === 0 ? COLORS.good : i === 1 ? COLORS.ember : COLORS.danger;
      card.danger.position.set(x + 20, CARD_Y + CARD_H - 30);

      // Шансы материалов — по ним и выбирают, куда идти.
      let total = 0;
      for (const m of MATERIAL_ORDER) total += def.weights[m];
      let ly = CARD_Y + 150;
      for (let mi = 0; mi < MATERIAL_ORDER.length; mi++) {
        const m = MATERIAL_ORDER[mi];
        const pct = Math.round((def.weights[m] / total) * 100);
        const t = card.legend[mi];
        t.text = `${MATERIALS[m].name}  ${pct}%`;
        t.style.fill = pct >= 40 ? MATERIALS[m].color : COLORS.textFaint;
        t.position.set(x + 34, ly);
        g.rect(x + 20, ly + 5, 8, 8).fill(MATERIALS[m].color);
        ly += 19;
      }
    }
  }
}
