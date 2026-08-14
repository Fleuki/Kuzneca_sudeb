/**
 * Экран итога забега.
 *
 * §1: смерть должна читаться как «я неправильно подготовился», а не
 * «я плохо играл». Поэтому центральное место здесь занимает не «ПОРАЖЕНИЕ»,
 * а конкретная подсказка о том, что именно не сошлось в подготовке.
 */

import { Container, Graphics } from 'pixi.js';
import { BOSSES, VIEW_W } from '../../core/constants.ts';
import type { GameState } from '../../core/types.ts';
import { COLORS, SMALL_STYLE, style } from '../theme.ts';
import { centerText, drawPanel, makeText } from '../ui.ts';
import { hintFor } from '../uiMode.ts';
import { drawScreenBackground, fullScreenRegion } from './scene.ts';
import type { HitRegion, Scene } from './scene.ts';

export class ResultScene implements Scene {
  container = new Container();
  private g = new Graphics();
  private banner = makeText('', style(40, COLORS.gold, { letterSpacing: 5 }));
  private bossLine = makeText('', style(18, COLORS.text));
  private hint = makeText('', style(17, COLORS.emberHot, { wordWrap: true, wordWrapWidth: 620, align: 'center', lineHeight: 25 }));
  private stats = makeText('', style(15, COLORS.textDim));
  private reward = makeText('', style(16, COLORS.gold));
  private prompt = makeText('', SMALL_STYLE);

  constructor() {
    this.container.addChild(this.g, this.banner, this.bossLine, this.hint, this.stats, this.reward, this.prompt);
  }

  draw(state: GameState, _alpha: number, time: number): void {
    const g = this.g;
    g.clear();
    drawScreenBackground(g, time);

    const r = state.result;
    if (!r) return;

    this.banner.text = r.won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    this.banner.style.fill = r.won ? COLORS.gold : COLORS.danger;
    centerText(this.banner, VIEW_W / 2, 78);

    this.bossLine.text = BOSSES[r.bossId].name;
    centerText(this.bossLine, VIEW_W / 2, 138);

    // Подсказка — самое важное на экране.
    drawPanel(g, VIEW_W / 2 - 340, 186, 680, 118, { fill: COLORS.panelHi, edge: COLORS.goldDim });
    this.hint.text = r.hint;
    centerText(this.hint, VIEW_W / 2, 214);

    const mins = Math.floor(r.timeSeconds / 60);
    const secs = Math.floor(r.timeSeconds % 60);
    const parts = [
      `Урона нанесено: ${r.damageDealt}`,
      `Время боя: ${mins}:${String(secs).padStart(2, '0')}`,
    ];
    if (r.weaponBroken) parts.push('Оружие сломалось');
    this.stats.text = parts.join('   ·   ');
    centerText(this.stats, VIEW_W / 2, 330);

    this.reward.text = r.won
      ? `+${r.brandsEarned} клеймо   ·   всего: ${state.meta.brands}`
      : 'Ресурсы в рюкзаке остались при тебе';
    this.reward.style.fill = r.won ? COLORS.gold : COLORS.textDim;
    centerText(this.reward, VIEW_W / 2, 366);

    this.prompt.text = hintFor('Enter — вернуться в кузницу', 'Тапни, чтобы вернуться в кузницу');
    centerText(this.prompt, VIEW_W / 2, 470);
  }

  // Экран итога только читают — тап в любое место возвращает в кузницу.
  hitRegions(): HitRegion[] {
    return [fullScreenRegion({ type: 'RESULT_CONTINUE' })];
  }
}
