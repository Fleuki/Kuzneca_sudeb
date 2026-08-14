/**
 * Экран выбора босса — главный экран игры.
 *
 * §1: игрок знает, какой босс его ждёт, ДО того как идёт в шахту. Поэтому здесь
 * не «выбери сложность», а «прочитай, что тебя ждёт, и реши, за чем идти».
 * Слабость и материал-ответ показаны открытым текстом: интрига не в том, чтобы
 * угадать ответ, а в том, чтобы за ним сходить и потом им сыграть.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { BOSSES, MATERIALS, VIEW_W } from '../../core/constants.ts';
import type { GameState } from '../../core/types.ts';
import { isDefeated } from '../../sim/state.ts';
import { COLORS, H1_STYLE, SMALL_STYLE, style } from '../theme.ts';
import { centerText, drawPanel, drawSelection, makeText } from '../ui.ts';
import { drawScreenBackground } from './scene.ts';
import type { Scene } from './scene.ts';

const CARD_W = 276;
const CARD_H = 316;
const CARD_Y = 132;
const MAX_CARDS = 3;

interface CardTexts {
  name: Text;
  hp: Text;
  weakness: Text;
  answer: Text;
  rhythm: Text;
  status: Text;
}

export class BossSelectScene implements Scene {
  container = new Container();
  private g = new Graphics();
  private title = makeText('Кто ждёт в конце', H1_STYLE);
  private subtitle = makeText(
    'Решай сейчас: от этого зависит, в какой биом идти за материалом',
    style(15, COLORS.goldDim),
  );
  private hint = makeText('← → выбор · Enter подтвердить · Esc назад', SMALL_STYLE);
  private cards: CardTexts[] = [];

  constructor() {
    this.container.addChild(this.g, this.title, this.subtitle);

    for (let i = 0; i < MAX_CARDS; i++) {
      const card: CardTexts = {
        name: makeText('', style(21, COLORS.text)),
        hp: makeText('', style(14, COLORS.textDim)),
        weakness: makeText('', style(14, COLORS.text, { wordWrap: true, wordWrapWidth: CARD_W - 40, lineHeight: 19 })),
        answer: makeText('', style(15, COLORS.gold)),
        rhythm: makeText('', style(13, COLORS.textFaint, { wordWrap: true, wordWrapWidth: CARD_W - 40, lineHeight: 17 })),
        status: makeText('', style(12, COLORS.good)),
      };
      this.cards.push(card);
      this.container.addChild(card.name, card.hp, card.weakness, card.answer, card.rhythm, card.status);
    }

    this.container.addChild(this.hint);
  }

  draw(state: GameState, _alpha: number, time: number): void {
    const g = this.g;
    g.clear();
    drawScreenBackground(g, time);

    centerText(this.title, VIEW_W / 2, 52);
    centerText(this.subtitle, VIEW_W / 2, 90);
    centerText(this.hint, VIEW_W / 2, 496);

    const offered = state.run?.offered ?? [];
    const totalW = offered.length * CARD_W + (offered.length - 1) * 20;
    const startX = VIEW_W / 2 - totalW / 2;

    for (let i = 0; i < MAX_CARDS; i++) {
      const card = this.cards[i];
      const visible = i < offered.length;
      setCardVisible(card, visible);
      if (!visible) continue;

      const def = BOSSES[offered[i]];
      const x = startX + i * (CARD_W + 20);
      const selected = state.menuCursor === i;

      drawPanel(g, x, CARD_Y, CARD_W, CARD_H, {
        fill: selected ? COLORS.panelHi : COLORS.panel,
        edge: selected ? COLORS.gold : COLORS.panelEdge,
      });
      if (selected) drawSelection(g, x, CARD_Y, CARD_W, CARD_H);

      // Силуэт босса — цветной блок в пропорциях реальной модели на арене.
      const silhouetteH = 74;
      const silhouetteW = (def.w / def.h) * silhouetteH;
      g.roundRect(x + CARD_W / 2 - silhouetteW / 2, CARD_Y + 18, silhouetteW, silhouetteH, 4)
        .fill(def.color)
        .stroke({ width: 2, color: def.accent, alignment: 1 });

      const pad = 20;
      card.name.text = def.name;
      centerText(card.name, x + CARD_W / 2, CARD_Y + 104);

      card.hp.text = `${def.hp} HP${def.armor > 0 ? `  ·  броня ${Math.round(def.armor * 100)}%` : ''}`;
      centerText(card.hp, x + CARD_W / 2, CARD_Y + 132);

      card.weakness.text = def.weakness;
      card.weakness.position.set(x + pad, CARD_Y + 160);

      const mat = MATERIALS[def.answer];
      card.answer.text = `Ответ: ${mat.name}`;
      card.answer.style.fill = mat.color;
      card.answer.position.set(x + pad, CARD_Y + 232);

      card.rhythm.text = def.rhythm;
      card.rhythm.position.set(x + pad, CARD_Y + 258);

      card.status.text = isDefeated(state.meta, def.id) ? '✓ уже побеждён' : '';
      card.status.position.set(x + pad, CARD_Y + CARD_H - 26);
    }
  }
}

function setCardVisible(card: CardTexts, visible: boolean): void {
  card.name.visible = visible;
  card.hp.visible = visible;
  card.weakness.visible = visible;
  card.answer.visible = visible;
  card.rhythm.visible = visible;
  card.status.visible = visible;
}
