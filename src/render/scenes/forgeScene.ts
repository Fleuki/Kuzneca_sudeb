/**
 * Фаза ковки: выбор рецепта, мини-игра на тайминг, карточка готового оружия.
 *
 * §5 требует, чтобы вспышка на идеальном попадании была лучшим, что есть в игре.
 * Здесь это белая вспышка на весь экран плюс расходящееся кольцо искр.
 *
 * Выбор рецепта — три строки-переключателя со стрелками, а не россыпь кнопок:
 * названия материалов длинные, и в ряд они просто не помещаются.
 */

import { Container, Graphics, Text } from 'pixi.js';
import {
  FORGE,
  MATERIALS,
  MATERIAL_ORDER,
  RECIPE_PRIMARY,
  RECIPE_SECONDARY,
  SHAPES,
  SHAPE_ORDER,
  VIEW_H,
  VIEW_W,
} from '../../core/constants.ts';
import type { Command } from '../../core/commands.ts';
import type { ForgeState, GameState, MaterialId, Weapon } from '../../core/types.ts';
import { durabilityCost } from '../../sim/state.ts';
import { requiredAmount } from '../../sim/forge/step.ts';
import { buildWeapon, weaponDps, weaponHits } from '../../sim/forge/weapon.ts';
import { COLORS, H1_STYLE, SMALL_STYLE, style } from '../theme.ts';
import { centerText, drawBar, drawPanel, drawSelection, makeText } from '../ui.ts';
import { hintFor } from '../uiMode.ts';
import { drawScreenBackground, fullScreenRegion } from './scene.ts';
import type { HitRegion, Scene } from './scene.ts';

const ROW_LABELS = ['Форма', 'Основной материал', 'Вторичный материал'];
const ROW_Y = [148, 226, 304];
const ROW_H = 44;
const LEFT_X = 40;
const PANEL_X = LEFT_X - 16;
const PANEL_W = 520;
const ROW_W = PANEL_W - 48;

const CARD_X = 596;
const CARD_Y = 116;
const CARD_W = 324;
const CARD_H = 264;

const BAR_X = 220;
const BAR_W = 520;
const BAR_Y = 300;
const BAR_H = 54;

export class ForgeScene implements Scene {
  container = new Container();
  private g = new Graphics();
  private title = makeText('Ковка', H1_STYLE);

  private rowLabels: Text[] = [];
  private rowValues: Text[] = [];
  private rowCounts: Text[] = [];
  private recipe = makeText('', SMALL_STYLE);
  private notice = makeText('', style(15, COLORS.ember));
  private hint = makeText('', SMALL_STYLE);

  // Карточка предпросмотра / готового оружия
  private previewTitle = makeText('', style(19, COLORS.gold));
  private previewLines: Text[] = [];
  private strikesNote = makeText('', SMALL_STYLE);

  // Мини-игра
  private strikeLabel = makeText('', style(18, COLORS.text));
  private resultLabel = makeText('', style(30, COLORS.gold, { letterSpacing: 3 }));
  private minigameHint = makeText('', SMALL_STYLE);

  // Итоги ковки
  private bonusLabels: Text[] = [];

  constructor() {
    this.container.addChild(this.g, this.title);

    for (let r = 0; r < ROW_LABELS.length; r++) {
      const label = makeText(ROW_LABELS[r], SMALL_STYLE);
      const value = makeText('', style(17, COLORS.text));
      const count = makeText('', style(13, COLORS.textFaint));
      this.rowLabels.push(label);
      this.rowValues.push(value);
      this.rowCounts.push(count);
      this.container.addChild(label, value, count);
    }

    for (let i = 0; i < 8; i++) {
      const t = makeText('', style(15, COLORS.textDim));
      this.previewLines.push(t);
      this.container.addChild(t);
    }

    for (let i = 0; i < 3; i++) {
      const t = makeText('', style(15, COLORS.textDim));
      this.bonusLabels.push(t);
      this.container.addChild(t);
    }

    this.container.addChild(
      this.recipe,
      this.previewTitle,
      this.strikesNote,
      this.strikeLabel,
      this.resultLabel,
      this.minigameHint,
      this.notice,
      this.hint,
    );
  }

  draw(state: GameState, _alpha: number, time: number): void {
    const forge = state.forge;
    if (!forge) return;

    const g = this.g;
    g.clear();
    drawScreenBackground(g, time);
    this.drawAnvil(g, time, forge);

    centerText(this.title, VIEW_W / 2, 40);

    this.setVisible(forge.stage);

    if (forge.stage === 'select') this.drawSelect(state, forge, g);
    else if (forge.stage === 'minigame') this.drawMinigame(forge, g);
    else this.drawDone(forge, g);

    this.notice.text = state.noticeTimer > 0 ? state.notice : '';
    centerText(this.notice, VIEW_W / 2, VIEW_H - 74);
    centerText(this.hint, VIEW_W / 2, VIEW_H - 46);
  }

  // -------------------------------------------------------------------------

  private setVisible(stage: ForgeState['stage']): void {
    const select = stage === 'select';
    const mini = stage === 'minigame';
    const done = stage === 'done';

    for (const t of this.rowLabels) t.visible = select;
    for (const t of this.rowValues) t.visible = select;
    for (const t of this.rowCounts) t.visible = select;
    for (const t of this.bonusLabels) t.visible = done;

    this.recipe.visible = select || done;
    this.strikeLabel.visible = mini;
    this.minigameHint.visible = mini;
    this.strikesNote.visible = select;
  }

  private drawAnvil(g: Graphics, time: number, forge: ForgeState): void {
    // Наковальня внизу экрана — общий якорь для всех стадий.
    const cx = VIEW_W / 2;
    const baseY = VIEW_H - 96;
    const heat = forge.stage === 'minigame' ? 0.5 + 0.5 * Math.sin(time * 6) : 0.25;
    g.ellipse(cx, baseY + 6, 130, 22).fill({ color: COLORS.ember, alpha: 0.12 + heat * 0.1 });
    g.rect(cx - 60, baseY - 18, 120, 18).fill(0x3a3540);
    g.rect(cx - 26, baseY, 52, 22).fill(0x2b2730);
    g.rect(cx - 62, baseY - 24, 124, 8).fill(0x4a4450);
  }

  // -------------------------------------------------------------------------
  // Выбор рецепта
  // -------------------------------------------------------------------------

  private drawSelect(state: GameState, forge: ForgeState, g: Graphics): void {
    drawPanel(g, PANEL_X, 116, PANEL_W, 264, { alpha: 0.92 });

    for (let r = 0; r < ROW_LABELS.length; r++) {
      const active = forge.cursorRow === r;
      const y = ROW_Y[r];

      this.rowLabels[r].text = ROW_LABELS[r];
      this.rowLabels[r].style.fill = active ? COLORS.gold : COLORS.textFaint;
      this.rowLabels[r].position.set(LEFT_X, y - 20);

      const { label, color, have, need } = this.rowContent(state, forge, r);

      drawPanel(g, LEFT_X, y, ROW_W, ROW_H, {
        fill: active ? COLORS.panelHi : COLORS.panel,
        edge: active ? COLORS.gold : COLORS.panelEdge,
      });
      if (active) drawSelection(g, LEFT_X, y, ROW_W, ROW_H);

      // Стрелки-подсказки: значение в строке меняется влево/вправо.
      const arrowColor = active ? COLORS.gold : COLORS.textFaint;
      const midY = y + ROW_H / 2;
      g.moveTo(LEFT_X + 22, midY - 7).lineTo(LEFT_X + 22, midY + 7).lineTo(LEFT_X + 12, midY).fill(arrowColor);
      g.moveTo(LEFT_X + ROW_W - 22, midY - 7)
        .lineTo(LEFT_X + ROW_W - 22, midY + 7)
        .lineTo(LEFT_X + ROW_W - 12, midY)
        .fill(arrowColor);

      const value = this.rowValues[r];
      value.text = label;
      value.style.fill = color;
      value.position.set(LEFT_X + ROW_W / 2 - value.width / 2, midY - value.height / 2);

      // Запас материала: сразу видно, хватает ли на рецепт.
      const count = this.rowCounts[r];
      if (need > 0) {
        count.text = `${have}/${need}`;
        count.style.fill = have >= need ? COLORS.good : COLORS.danger;
        count.position.set(LEFT_X + ROW_W - 40 - count.width, midY - count.height / 2);
      } else {
        count.text = '';
      }
    }

    this.recipe.text = `Рецепт: ${RECIPE_PRIMARY} основного + ${RECIPE_SECONDARY} вторичного. Вторичный даёт 40% своего эффекта.`;
    this.recipe.position.set(LEFT_X, 358);

    if (forge.primary) {
      // Предпросмотр — без бонусов мини-игры: их ещё предстоит заработать.
      const preview = buildWeapon(
        forge.shape,
        forge.primary,
        forge.secondary,
        { damage: 1, durability: 1, speed: 1 },
        durabilityCost(state.meta),
        [],
      );
      this.drawWeaponCard(g, preview, 'Что получится');
      this.strikesNote.text = `Мини-игра: ${forge.strikesTotal} удара молотом`;
      this.strikesNote.position.set(CARD_X + 18, CARD_Y + CARD_H - 26);
    } else {
      this.clearCard();
      this.strikesNote.text = '';
    }

    this.hint.text = hintFor(
      '↑↓ строка · ← → значение · Enter ковать · Esc бросить забег',
      'Тапни по краям строки, чтобы листать значение',
    );
  }

  /** Что показывать в строке r и хватает ли материала. */
  private rowContent(
    state: GameState,
    forge: ForgeState,
    r: number,
  ): { label: string; color: number; have: number; need: number } {
    if (r === 0) {
      return { label: SHAPES[forge.shape].name, color: COLORS.text, have: 0, need: 0 };
    }

    const material = r === 1 ? forge.primary : forge.secondary;
    if (material === null) {
      return {
        label: r === 1 ? 'не выбран' : 'без вторичного',
        color: r === 1 ? COLORS.danger : COLORS.textDim,
        have: 0,
        need: 0,
      };
    }

    const def = MATERIALS[material];
    return {
      label: def.name,
      color: def.color,
      have: state.meta.backpack[material],
      need: requiredAmount(material, forge.primary, forge.secondary),
    };
  }

  // -------------------------------------------------------------------------
  // Карточка оружия
  // -------------------------------------------------------------------------

  private clearCard(): void {
    this.previewTitle.text = '';
    for (const t of this.previewLines) t.text = '';
  }

  private drawWeaponCard(g: Graphics, w: Weapon, title: string): void {
    drawPanel(g, CARD_X, CARD_Y, CARD_W, CARD_H, { fill: COLORS.panelHi, edge: COLORS.goldDim });

    this.previewTitle.text = title;
    this.previewTitle.position.set(CARD_X + 18, CARD_Y + 14);

    const mat = MATERIALS[w.primary];
    g.rect(CARD_X + 18, CARD_Y + 46, CARD_W - 36, 6).fill(mat.color);

    const lines = [
      `${SHAPES[w.shape].name} · ${mat.name}${w.secondary ? ` + ${MATERIALS[w.secondary].name}` : ''}`,
      `Урон ${w.damage.toFixed(1)}   ·   DPS ${weaponDps(w).toFixed(1)}`,
      `Интервал удара ${w.interval.toFixed(2)} с`,
      `Прочность ${w.durabilityMax} — ${weaponHits(w)} попаданий`,
      w.armorPierce > 0 ? `Пробой брони ${Math.round(w.armorPierce * 100)}%` : '',
      w.magicFraction > 0 ? `Магический урон ${Math.round(w.magicFraction * 100)}%` : '',
      w.lifesteal > 0 ? `Вампиризм ${(w.lifesteal * 100).toFixed(1)}%` : '',
      SHAPES[w.shape].note,
    ];
    const noteIndex = lines.length - 1;

    let ly = CARD_Y + 66;
    for (let i = 0; i < this.previewLines.length; i++) {
      const t = this.previewLines[i];
      t.text = lines[i] ?? '';
      if (!t.text) continue;
      const isNote = i === noteIndex;
      t.style.fill = isNote ? COLORS.textFaint : i === 0 ? COLORS.text : COLORS.textDim;
      t.style.fontSize = isNote ? 13 : 15;
      // Название и описание формы длинные — переносим их по ширине карточки.
      t.style.wordWrap = i === 0 || isNote;
      t.style.wordWrapWidth = CARD_W - 36;
      t.position.set(CARD_X + 18, isNote ? ly + 8 : ly);
      ly += t.height + (isNote ? 14 : 6);
    }
  }

  // -------------------------------------------------------------------------
  // Мини-игра
  // -------------------------------------------------------------------------

  private drawMinigame(forge: ForgeState, g: Graphics): void {
    this.clearCard();

    // Заготовка на наковальне — греется по мере ударов.
    const heat = forge.strikesDone / Math.max(1, forge.strikesTotal);
    g.roundRect(VIEW_W / 2 - 44, 180, 88, 30, 4).fill({ color: 0xff7a2a, alpha: 0.35 + heat * 0.4 });

    this.strikeLabel.text = `Удар ${Math.min(forge.strikesDone + 1, forge.strikesTotal)} из ${forge.strikesTotal}`;
    centerText(this.strikeLabel, VIEW_W / 2, 238);

    drawPanel(g, BAR_X - 8, BAR_Y - 8, BAR_W + 16, BAR_H + 16, { fill: COLORS.panel });
    g.rect(BAR_X, BAR_Y, BAR_W, BAR_H).fill(COLORS.bgDeep);

    // Зона попадания и идеальная зона.
    const zoneX = BAR_X + (forge.zoneCenter - forge.zoneHalf) * BAR_W;
    g.rect(zoneX, BAR_Y, forge.zoneHalf * 2 * BAR_W, BAR_H).fill({ color: COLORS.ember, alpha: 0.35 });

    const perfectX = BAR_X + (forge.zoneCenter - forge.perfectHalf) * BAR_W;
    g.rect(perfectX, BAR_Y, forge.perfectHalf * 2 * BAR_W, BAR_H).fill({ color: COLORS.emberHot, alpha: 0.8 });

    // Бегунок
    const mx = BAR_X + forge.marker * BAR_W;
    g.rect(mx - 2, BAR_Y - 10, 4, BAR_H + 20).fill(COLORS.text);
    g.moveTo(mx - 8, BAR_Y - 12).lineTo(mx + 8, BAR_Y - 12).lineTo(mx, BAR_Y - 2).fill(COLORS.gold);

    g.rect(BAR_X, BAR_Y, BAR_W, BAR_H).stroke({ width: 2, color: COLORS.panelEdge, alignment: 1 });

    // Результаты ударов
    let rx = VIEW_W / 2 - (forge.strikesTotal * 26) / 2;
    for (let i = 0; i < forge.strikesTotal; i++) {
      const r = forge.results[i];
      const color =
        r === 'perfect'
          ? COLORS.emberHot
          : r === 'good'
            ? COLORS.good
            : r === 'miss'
              ? COLORS.danger
              : COLORS.panelEdge;
      g.circle(rx + 13, BAR_Y + BAR_H + 34, 7).fill(color);
      rx += 26;
    }

    // Вспышка результата — эмоциональный пик забега (§5).
    if (forge.strikeFlash > 0 && forge.lastResult) {
      const t = forge.strikeFlash / FORGE.flashTime;
      if (forge.lastResult === 'perfect') {
        g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xffffff, alpha: t * 0.45 });
        const ring = (1 - t) * 220;
        g.circle(VIEW_W / 2, BAR_Y + BAR_H / 2, ring).stroke({ width: 6 * t, color: COLORS.emberHot });
        g.circle(VIEW_W / 2, BAR_Y + BAR_H / 2, ring * 0.6).stroke({ width: 4 * t, color: COLORS.gold });
      } else if (forge.lastResult === 'good') {
        g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: COLORS.ember, alpha: t * 0.12 });
      } else {
        g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: COLORS.danger, alpha: t * 0.14 });
      }

      this.resultLabel.visible = true;
      this.resultLabel.text =
        forge.lastResult === 'perfect' ? 'ИДЕАЛЬНО' : forge.lastResult === 'good' ? 'ЕСТЬ' : 'МИМО';
      this.resultLabel.style.fill =
        forge.lastResult === 'perfect'
          ? COLORS.emberHot
          : forge.lastResult === 'good'
            ? COLORS.good
            : COLORS.danger;
      centerText(this.resultLabel, VIEW_W / 2, BAR_Y - 78);
    } else {
      this.resultLabel.visible = false;
    }

    this.minigameHint.text = hintFor('Пробел — удар', 'Тапни, чтобы ударить');
    centerText(this.minigameHint, VIEW_W / 2, BAR_Y - 28);
    this.hint.text = '';
  }

  // -------------------------------------------------------------------------
  // Готовое оружие
  // -------------------------------------------------------------------------

  private drawDone(forge: ForgeState, g: Graphics): void {
    this.resultLabel.visible = false;
    if (!forge.forged) return;

    this.drawWeaponCard(g, forge.forged, 'Оружие готово');
    this.strikesNote.text = '';

    drawPanel(g, PANEL_X, CARD_Y, PANEL_W, CARD_H, { alpha: 0.92 });

    const bonuses: [string, number, number][] = [
      ['Урон', forge.bonusDamage, COLORS.gold],
      ['Прочность', forge.bonusDurability, COLORS.durFill],
      ['Скорость', forge.bonusSpeed, COLORS.magic],
    ];

    let by = CARD_Y + 34;
    for (let i = 0; i < bonuses.length; i++) {
      const [name, value, color] = bonuses[i];
      const t = this.bonusLabels[i];
      t.text = `${name}  ×${value.toFixed(2)}`;
      t.style.fill = value >= 1 ? COLORS.text : COLORS.danger;
      t.position.set(LEFT_X, by);
      // Шкала центрирована на ×1.0: видно и прибавку, и потерю от промаха.
      drawBar(g, LEFT_X, by + 24, ROW_W, 14, value / 2, color);
      by += 66;
    }

    const perfect = forge.results.filter((r) => r === 'perfect').length;
    const good = forge.results.filter((r) => r === 'good').length;
    const miss = forge.results.filter((r) => r === 'miss').length;
    this.recipe.text = `Идеальных: ${perfect}   ·   попаданий: ${good}   ·   промахов: ${miss}`;
    this.recipe.position.set(LEFT_X, CARD_Y + CARD_H - 24);

    this.hint.text = hintFor('Enter — выйти на арену', 'Тапни, чтобы выйти на арену');
  }

  /**
   * В мини-игре и на карточке готового оружия годится тап в любое место:
   * попадать пальцем в маленькую кнопку в момент, когда бегунок в идеальной
   * зоне, — это соревнование с интерфейсом, а не с игрой.
   *
   * На выборе рецепта тапают прямо по строкам: края строки листают значение,
   * середина просто переносит фокус. Так экранные стрелки не нужны и не лезут
   * поверх карточки с характеристиками.
   */
  hitRegions(state: GameState): HitRegion[] {
    const forge = state.forge;
    if (!forge) return [];

    if (forge.stage === 'minigame' || forge.stage === 'done') {
      return [fullScreenRegion({ type: 'MENU_CONFIRM' })];
    }

    const regions: HitRegion[] = [];
    const arrowW = 84;

    for (let r = 0; r < ROW_Y.length; r++) {
      const y = ROW_Y[r];
      // Курсор переносим на тронутую строку: подсветка должна идти за пальцем.
      const delta = r - forge.cursorRow;
      const focus: Command[] = delta === 0 ? [] : [{ type: 'MENU_ROW', delta }];

      regions.push({
        x: LEFT_X,
        y,
        w: arrowW,
        h: ROW_H,
        commands: [...focus, valueCommand(forge, r, -1)],
      });
      regions.push({
        x: LEFT_X + ROW_W - arrowW,
        y,
        w: arrowW,
        h: ROW_H,
        commands: [...focus, valueCommand(forge, r, 1)],
      });
      regions.push({
        x: LEFT_X + arrowW,
        y,
        w: ROW_W - arrowW * 2,
        h: ROW_H,
        commands: focus,
      });
    }

    return regions;
  }
}

/** Следующее или предыдущее значение в строке рецепта — абсолютной командой. */
function valueCommand(forge: ForgeState, row: number, dir: number): Command {
  if (row === 0) {
    const i = SHAPE_ORDER.indexOf(forge.shape);
    return {
      type: 'FORGE_SET_SHAPE',
      shape: SHAPE_ORDER[(i + dir + SHAPE_ORDER.length) % SHAPE_ORDER.length],
    };
  }
  if (row === 1) {
    const i = forge.primary ? MATERIAL_ORDER.indexOf(forge.primary) : 0;
    return {
      type: 'FORGE_SET_PRIMARY',
      material: MATERIAL_ORDER[(i + dir + MATERIAL_ORDER.length) % MATERIAL_ORDER.length],
    };
  }
  // У вторичного есть дополнительный вариант «без вторичного».
  const options: (MaterialId | null)[] = [...MATERIAL_ORDER, null];
  const i = options.indexOf(forge.secondary);
  return {
    type: 'FORGE_SET_SECONDARY',
    material: options[(i + dir + options.length) % options.length],
  };
}
