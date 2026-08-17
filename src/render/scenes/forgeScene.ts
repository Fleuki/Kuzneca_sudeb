/**
 * Кузница: верстак с деревом предметов, наковальня, мини-игра и карточка оружия.
 *
 * Экран делится на две вкладки, и это не украшение, а разные действия.
 * **Верстак** — сетка рюкзака и два слота: кладёшь два предмета, получаешь один.
 * **Наковальня** — три строки рецепта оружия и карточка того, что выйдет.
 *
 * §5 требует, чтобы вспышка на идеальном попадании была лучшим, что есть в игре.
 * Здесь это белая вспышка на весь экран плюс расходящееся кольцо искр. Открытие
 * нового узла дерева получает свою, поменьше: находку тоже надо отметить.
 */

import { Container, Graphics, Text } from 'pixi.js';
import {
  FORGE,
  FORGE_GRID_COLS,
  SHAPES,
  SHAPE_ORDER,
  VIEW_H,
  VIEW_W,
  WEAPON_BASE_COST,
} from '../../core/constants.ts';
import { ITEMS, findRecipe, isForgeable, rawCost } from '../../core/items.ts';
import type { ItemId } from '../../core/items.ts';
import type { Command } from '../../core/commands.ts';
import type { ForgeState, GameState, Weapon } from '../../core/types.ts';
import {
  backpackCapacity,
  backpackTotal,
  canForgeAnything,
  durabilityCost,
  forgeableItems,
  isKnown,
  ownedItems,
} from '../../sim/state.ts';
import { requiredAmount } from '../../sim/forge/step.ts';
import { craftPreview } from '../../sim/forge/craft.ts';
import { buildWeapon, weaponDps, weaponHits } from '../../sim/forge/weapon.ts';
import { COLORS, H1_STYLE, SMALL_STYLE, style } from '../theme.ts';
import { centerText, drawBar, drawPanel, drawSelection, makeText } from '../ui.ts';
import { hintFor } from '../uiMode.ts';
import { drawScreenBackground, fullScreenRegion } from './scene.ts';
import type { HitRegion, Scene } from './scene.ts';

// --- Разметка ---------------------------------------------------------------

const TAB_Y = 62;
const TAB_W = 168;
const TAB_H = 34;
const TAB_X = [VIEW_W / 2 - TAB_W - 6, VIEW_W / 2 + 6];

const LEFT_X = 32;
const LEFT_W = 468;
const PANEL_Y = 112;
const PANEL_H = 324;

const CELL_W = 72;
const CELL_H = 56;
const CELL_GAP = 6;
const GRID_X = LEFT_X + 6;
const GRID_Y = PANEL_Y + 40;
const GRID_ROWS = 5;

const RIGHT_X = 520;
const RIGHT_W = 408;

const SLOT_W = 110;
const SLOT_H = 64;
const SLOT_Y = PANEL_Y + 34;
const SLOT_A_X = RIGHT_X + 16;
const SLOT_B_X = RIGHT_X + 150;
const SLOT_OUT_X = RIGHT_X + 284;

const CRAFT_BTN = { x: RIGHT_X + 16, y: SLOT_Y + SLOT_H + 24, w: 214, h: 44 };
const CLEAR_BTN = { x: RIGHT_X + 246, y: SLOT_Y + SLOT_H + 24, w: 148, h: 44 };
const INFO_Y = CRAFT_BTN.y + CRAFT_BTN.h + 20;

const ROW_LABELS = ['Форма', 'Основа', 'Вставка'];
const ROW_X = LEFT_X + 16;
const ROW_W = LEFT_W - 32;
const ROW_H = 44;
const ROW_Y = [PANEL_Y + 44, PANEL_Y + 124, PANEL_Y + 204];

const CARD_X = RIGHT_X;
const CARD_Y = PANEL_Y;
const CARD_W = RIGHT_W;
const CARD_H = PANEL_H;

const BAR_X = 220;
const BAR_W = 520;
const BAR_Y = 300;
const BAR_H = 54;

const MAX_CELLS = 30;

export class ForgeScene implements Scene {
  container = new Container();
  private g = new Graphics();
  private title = makeText('Кузница', H1_STYLE);

  private tabLabels: Text[] = [];

  // Сетка рюкзака
  private cellNames: Text[] = [];
  private cellCounts: Text[] = [];
  private packLine = makeText('', SMALL_STYLE);

  // Верстак
  private slotLabels: Text[] = [];
  private craftLabel = makeText('', style(17, COLORS.text));
  private clearLabel = makeText('Очистить', style(15, COLORS.textDim));
  private previewLabel = makeText('', style(15, COLORS.textDim, { wordWrap: true, wordWrapWidth: RIGHT_W - 40 }));
  private infoTitle = makeText('', style(17, COLORS.gold));
  private infoLines: Text[] = [];

  // Наковальня
  private rowLabels: Text[] = [];
  private rowValues: Text[] = [];
  private rowCounts: Text[] = [];
  private recipe = makeText('', SMALL_STYLE);

  private notice = makeText('', style(15, COLORS.ember));
  private hint = makeText('', SMALL_STYLE);
  private warning = makeText('', style(15, COLORS.ember, { wordWrap: true, wordWrapWidth: 760, align: 'center' }));

  // Карточка оружия
  private cardTitle = makeText('', style(19, COLORS.gold));
  private cardLines: Text[] = [];
  private strikesNote = makeText('', SMALL_STYLE);

  // Мини-игра
  private strikeLabel = makeText('', style(18, COLORS.text));
  private resultLabel = makeText('', style(30, COLORS.gold, { letterSpacing: 3 }));
  private minigameHint = makeText('', SMALL_STYLE);
  private bonusLabels: Text[] = [];

  constructor() {
    this.container.addChild(this.g, this.title);

    for (let i = 0; i < 2; i++) {
      const t = makeText('', style(16, COLORS.text));
      this.tabLabels.push(t);
      this.container.addChild(t);
    }

    for (let i = 0; i < MAX_CELLS; i++) {
      const name = makeText('', style(13, COLORS.text));
      const count = makeText('', style(14, COLORS.gold));
      this.cellNames.push(name);
      this.cellCounts.push(count);
      this.container.addChild(name, count);
    }

    for (let i = 0; i < 3; i++) {
      const t = makeText('', style(14, COLORS.text, { wordWrap: true, wordWrapWidth: SLOT_W - 12, align: 'center' }));
      this.slotLabels.push(t);
      this.container.addChild(t);
    }

    for (let i = 0; i < 6; i++) {
      const t = makeText('', style(14, COLORS.textDim, { wordWrap: true, wordWrapWidth: RIGHT_W - 40 }));
      this.infoLines.push(t);
      this.container.addChild(t);
    }

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
      this.cardLines.push(t);
      this.container.addChild(t);
    }

    for (let i = 0; i < 3; i++) {
      const t = makeText('', style(15, COLORS.textDim));
      this.bonusLabels.push(t);
      this.container.addChild(t);
    }

    this.container.addChild(
      this.packLine,
      this.craftLabel,
      this.clearLabel,
      this.previewLabel,
      this.infoTitle,
      this.recipe,
      this.cardTitle,
      this.strikesNote,
      this.strikeLabel,
      this.resultLabel,
      this.minigameHint,
      this.notice,
      this.warning,
      this.hint,
    );
  }

  draw(state: GameState, _alpha: number, time: number): void {
    const forge = state.forge;
    if (!forge) return;

    const g = this.g;
    g.clear();
    drawScreenBackground(g, time);

    centerText(this.title, VIEW_W / 2, 22);

    this.hideAll();

    if (forge.stage === 'plan') {
      this.drawTabs(g, forge);
      if (forge.tab === 'craft') this.drawCraft(state, forge, g);
      else this.drawAssemble(state, forge, g);
      this.drawStuckWarning(state);
    } else if (forge.stage === 'minigame') {
      this.drawAnvil(g, time, forge);
      this.drawMinigame(forge, g);
    } else {
      this.drawAnvil(g, time, forge);
      this.drawDone(forge, g);
    }

    this.notice.text = state.noticeTimer > 0 ? state.notice : '';
    centerText(this.notice, VIEW_W / 2, VIEW_H - 74);
    centerText(this.hint, VIEW_W / 2, VIEW_H - 46);
  }

  // -------------------------------------------------------------------------

  /** Всё скрываем и включаем только то, что рисует текущая стадия. */
  private hideAll(): void {
    const all: Text[] = [
      ...this.tabLabels,
      ...this.cellNames,
      ...this.cellCounts,
      ...this.slotLabels,
      ...this.infoLines,
      ...this.rowLabels,
      ...this.rowValues,
      ...this.rowCounts,
      ...this.cardLines,
      ...this.bonusLabels,
      this.packLine,
      this.craftLabel,
      this.clearLabel,
      this.previewLabel,
      this.infoTitle,
      this.recipe,
      this.cardTitle,
      this.strikesNote,
      this.strikeLabel,
      this.minigameHint,
      this.warning,
    ];
    for (const t of all) {
      t.visible = false;
      t.text = '';
    }
    this.resultLabel.visible = false;
  }

  private drawTabs(g: Graphics, forge: ForgeState): void {
    const names = ['Верстак', 'Наковальня'];
    for (let i = 0; i < 2; i++) {
      const active = (i === 0) === (forge.tab === 'craft');
      drawPanel(g, TAB_X[i], TAB_Y, TAB_W, TAB_H, {
        fill: active ? COLORS.panelHi : COLORS.panel,
        edge: active ? COLORS.gold : COLORS.panelEdge,
      });
      const t = this.tabLabels[i];
      t.visible = true;
      t.text = names[i];
      t.style.fill = active ? COLORS.gold : COLORS.textFaint;
      centerText(t, TAB_X[i] + TAB_W / 2, TAB_Y + 7);
    }
  }

  private drawAnvil(g: Graphics, time: number, forge: ForgeState): void {
    const cx = VIEW_W / 2;
    const baseY = VIEW_H - 96;
    const heat = forge.stage === 'minigame' ? 0.5 + 0.5 * Math.sin(time * 6) : 0.25;
    g.ellipse(cx, baseY + 6, 130, 22).fill({ color: COLORS.ember, alpha: 0.12 + heat * 0.1 });
    g.rect(cx - 60, baseY - 18, 120, 18).fill(0x3a3540);
    g.rect(cx - 26, baseY, 52, 22).fill(0x2b2730);
    g.rect(cx - 62, baseY - 24, 124, 8).fill(0x4a4450);
  }

  // -------------------------------------------------------------------------
  // Верстак
  // -------------------------------------------------------------------------

  private drawCraft(state: GameState, forge: ForgeState, g: Graphics): void {
    drawPanel(g, LEFT_X, PANEL_Y, LEFT_W, PANEL_H, { alpha: 0.92 });
    drawPanel(g, RIGHT_X, PANEL_Y, RIGHT_W, PANEL_H, { alpha: 0.92 });

    const owned = ownedItems(state.meta.backpack);

    this.packLine.visible = true;
    this.packLine.text = `Рюкзак ${backpackTotal(state.meta.backpack)}/${backpackCapacity(state.meta)}`;
    this.packLine.position.set(GRID_X, PANEL_Y + 14);

    this.drawGrid(state, forge, g, owned);
    this.drawSlots(state, forge, g);
    this.drawItemInfo(state, forge, g, owned);

    this.hint.text = hintFor(
      '← → ↑ ↓ — выбрать · Enter — в слот, потом соединить · C — соединить · X — очистить · E — наковальня · R — в шахту',
      'Тапни по предмету — он ляжет в слот. Два слота — «Соединить»',
    );
  }

  private drawGrid(state: GameState, forge: ForgeState, g: Graphics, owned: ItemId[]): void {
    for (let i = 0; i < Math.min(owned.length, MAX_CELLS); i++) {
      const id = owned[i];
      const def = ITEMS[id];
      const col = i % FORGE_GRID_COLS;
      const row = Math.floor(i / FORGE_GRID_COLS);
      if (row >= GRID_ROWS) break;

      const x = GRID_X + col * (CELL_W + CELL_GAP);
      const y = GRID_Y + row * (CELL_H + CELL_GAP);
      const active = i === forge.cursor;
      const inSlot = forge.slotA === id || forge.slotB === id;

      drawPanel(g, x, y, CELL_W, CELL_H, {
        fill: active ? COLORS.panelHi : COLORS.panel,
        edge: inSlot ? COLORS.ember : active ? COLORS.gold : COLORS.panelEdge,
      });
      if (active) drawSelection(g, x, y, CELL_W, CELL_H);

      // Полоска цвета материала: уровень читается по её толщине.
      g.rect(x + 6, y + 6, CELL_W - 12, 4 + def.tier * 2).fill(def.color);

      const name = this.cellNames[i];
      name.visible = true;
      name.text = def.short;
      name.style.fill = active ? COLORS.text : COLORS.textDim;
      name.position.set(x + 8, y + CELL_H - 24);

      const count = this.cellCounts[i];
      count.visible = true;
      count.text = `×${state.meta.backpack[id]}`;
      count.style.fill = COLORS.gold;
      count.position.set(x + CELL_W - 8 - count.width, y + CELL_H - 24);
    }

    if (owned.length === 0) {
      this.previewLabel.visible = true;
      this.previewLabel.text = 'Рюкзак пуст — за материалом придётся спуститься в шахту';
      this.previewLabel.position.set(GRID_X, GRID_Y + 10);
    }
  }

  private drawSlots(state: GameState, forge: ForgeState, g: Graphics): void {
    const slots: (ItemId | null)[] = [forge.slotA, forge.slotB];
    const xs = [SLOT_A_X, SLOT_B_X];

    for (let i = 0; i < 2; i++) {
      const id = slots[i];
      drawPanel(g, xs[i], SLOT_Y, SLOT_W, SLOT_H, {
        fill: COLORS.panel,
        edge: id ? COLORS.ember : COLORS.panelEdge,
      });
      const t = this.slotLabels[i];
      t.visible = true;
      if (id) {
        const def = ITEMS[id];
        g.rect(xs[i] + 6, SLOT_Y + 6, SLOT_W - 12, 5).fill(def.color);
        t.text = def.name;
        t.style.fill = COLORS.text;
      } else {
        t.text = 'пусто';
        t.style.fill = COLORS.textFaint;
      }
      t.position.set(xs[i] + SLOT_W / 2 - t.width / 2, SLOT_Y + 20);
    }

    // Знаки «+» и «=»: правило дерева должно читаться без единой подписи.
    const midY = SLOT_Y + SLOT_H / 2;
    g.rect(SLOT_A_X + SLOT_W + 6, midY - 2, 16, 4).fill(COLORS.textFaint);
    g.rect(SLOT_A_X + SLOT_W + 12, midY - 8, 4, 16).fill(COLORS.textFaint);
    g.rect(SLOT_B_X + SLOT_W + 6, midY - 6, 16, 3).fill(COLORS.textFaint);
    g.rect(SLOT_B_X + SLOT_W + 6, midY + 3, 16, 3).fill(COLORS.textFaint);

    const preview = craftPreview(state);
    drawPanel(g, SLOT_OUT_X, SLOT_Y, SLOT_W, SLOT_H, {
      fill: preview.item ? COLORS.panelHi : COLORS.panel,
      edge: preview.item ? COLORS.gold : COLORS.panelEdge,
    });
    const out = this.slotLabels[2];
    out.visible = true;
    if (preview.item) {
      g.rect(SLOT_OUT_X + 6, SLOT_Y + 6, SLOT_W - 12, 5).fill(ITEMS[preview.item].color);
      out.text = ITEMS[preview.item].name;
      out.style.fill = COLORS.gold;
    } else {
      out.text = preview.text === 'Не соединяется' ? '—' : '???';
      out.style.fill = COLORS.textFaint;
    }
    out.position.set(SLOT_OUT_X + SLOT_W / 2 - out.width / 2, SLOT_Y + 20);

    // Вспышка на открытии нового узла — находку надо отметить.
    if (forge.craftFlash > 0) {
      const a = forge.craftFlash / 0.6;
      g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: COLORS.ember, alpha: a * 0.12 });
      g.circle(SLOT_OUT_X + SLOT_W / 2, midY, (1 - a) * 120).stroke({
        width: 4 * a,
        color: COLORS.emberHot,
      });
    }

    const ready = preview.item !== null || preview.text === '??? — попробуй и узнаешь';
    drawPanel(g, CRAFT_BTN.x, CRAFT_BTN.y, CRAFT_BTN.w, CRAFT_BTN.h, {
      fill: ready ? COLORS.panelHi : COLORS.panel,
      edge: ready ? COLORS.gold : COLORS.panelEdge,
    });
    this.craftLabel.visible = true;
    this.craftLabel.text = 'Соединить';
    this.craftLabel.style.fill = ready ? COLORS.gold : COLORS.textFaint;
    centerText(this.craftLabel, CRAFT_BTN.x + CRAFT_BTN.w / 2, CRAFT_BTN.y + 12);

    drawPanel(g, CLEAR_BTN.x, CLEAR_BTN.y, CLEAR_BTN.w, CLEAR_BTN.h);
    this.clearLabel.visible = true;
    this.clearLabel.text = 'Очистить';
    centerText(this.clearLabel, CLEAR_BTN.x + CLEAR_BTN.w / 2, CLEAR_BTN.y + 13);

    this.previewLabel.visible = true;
    this.previewLabel.text = preview.text;
    this.previewLabel.style.fill = preview.item ? COLORS.gold : COLORS.textDim;
    this.previewLabel.position.set(RIGHT_X + 16, SLOT_Y + SLOT_H + 4);
  }

  /** Карточка предмета под курсором: чем он хорош и во что складывается. */
  private drawItemInfo(state: GameState, forge: ForgeState, g: Graphics, owned: ItemId[]): void {
    const id = owned[forge.cursor];
    if (!id) return;
    const def = ITEMS[id];

    drawPanel(g, RIGHT_X + 16, INFO_Y, RIGHT_W - 32, PANEL_Y + PANEL_H - INFO_Y - 16, {
      fill: COLORS.panelHi,
      edge: COLORS.goldDim,
    });

    this.infoTitle.visible = true;
    this.infoTitle.text = `${def.name}  ·  уровень ${def.tier}`;
    this.infoTitle.position.set(RIGHT_X + 30, INFO_Y + 12);
    g.rect(RIGHT_X + 30, INFO_Y + 36, RIGHT_W - 60, 5).fill(def.color);

    const lines: string[] = [def.note];
    if (isForgeable(id)) {
      const w = buildWeapon(forge.shape, id, null, { damage: 1, durability: 1, speed: 1 }, 1, []);
      lines.push(
        `Оружие: урон ${w.damage.toFixed(1)} · DPS ${weaponDps(w).toFixed(1)} · ${weaponHits(w)} попаданий`,
      );
      lines.push(`Цена оружия: ${WEAPON_BASE_COST} шт. — это ${rawCost(id) * WEAPON_BASE_COST} сырья`);
    }

    // Что можно собрать прямо сейчас из этого предмета — подсказка по дереву,
    // но только по уже открытым узлам: остальное игрок должен найти сам.
    const combos: string[] = [];
    for (const other of owned) {
      const recipe = findRecipe(id, other);
      if (!recipe) continue;
      if (id === other && state.meta.backpack[id] < 2) continue;
      combos.push(
        isKnown(state.meta, recipe.out)
          ? `+ ${ITEMS[other].name} → ${ITEMS[recipe.out].name}`
          : `+ ${ITEMS[other].name} → ???`,
      );
    }
    if (combos.length > 0) lines.push('Соединяется:', ...combos);

    // Карточка не резиновая: строки, которые не влезли, просто не рисуем —
    // обрезанный по нижнему краю текст читается как ошибка вёрстки.
    const bottom = PANEL_Y + PANEL_H - 18;
    let ly = INFO_Y + 50;
    for (let i = 0; i < this.infoLines.length; i++) {
      const t = this.infoLines[i];
      const text = lines[i] ?? '';
      if (!text) continue;
      t.text = text;
      t.style.fill = text.startsWith('+') ? COLORS.textFaint : COLORS.textDim;
      if (ly + t.height > bottom) break;
      t.visible = true;
      t.position.set(RIGHT_X + 30, ly);
      ly += t.height + 4;
    }
  }

  // -------------------------------------------------------------------------
  // Наковальня
  // -------------------------------------------------------------------------

  private drawAssemble(state: GameState, forge: ForgeState, g: Graphics): void {
    drawPanel(g, LEFT_X, PANEL_Y, LEFT_W, PANEL_H, { alpha: 0.92 });

    for (let r = 0; r < ROW_LABELS.length; r++) {
      const active = forge.assembleRow === r;
      const y = ROW_Y[r];

      const label = this.rowLabels[r];
      label.visible = true;
      label.text = ROW_LABELS[r];
      label.style.fill = active ? COLORS.gold : COLORS.textFaint;
      label.position.set(ROW_X, y - 20);

      const { text, color, have, need } = this.rowContent(state, forge, r);

      drawPanel(g, ROW_X, y, ROW_W, ROW_H, {
        fill: active ? COLORS.panelHi : COLORS.panel,
        edge: active ? COLORS.gold : COLORS.panelEdge,
      });
      if (active) drawSelection(g, ROW_X, y, ROW_W, ROW_H);

      const arrowColor = active ? COLORS.gold : COLORS.textFaint;
      const midY = y + ROW_H / 2;
      g.moveTo(ROW_X + 22, midY - 7).lineTo(ROW_X + 22, midY + 7).lineTo(ROW_X + 12, midY).fill(arrowColor);
      g.moveTo(ROW_X + ROW_W - 22, midY - 7)
        .lineTo(ROW_X + ROW_W - 22, midY + 7)
        .lineTo(ROW_X + ROW_W - 12, midY)
        .fill(arrowColor);

      const value = this.rowValues[r];
      value.visible = true;
      value.text = text;
      value.style.fill = color;
      value.position.set(ROW_X + ROW_W / 2 - value.width / 2, midY - value.height / 2);

      const count = this.rowCounts[r];
      if (need > 0) {
        count.visible = true;
        count.text = `${have}/${need}`;
        count.style.fill = have >= need ? COLORS.good : COLORS.danger;
        count.position.set(ROW_X + ROW_W - 40 - count.width, midY - count.height / 2);
      }
    }

    this.recipe.visible = true;
    this.recipe.text = `Рецепт: ${WEAPON_BASE_COST} основы + 1 вставка. Вставка даёт 40% своего эффекта.`;
    this.recipe.position.set(ROW_X, ROW_Y[2] + ROW_H + 22);

    if (forge.base) {
      // Предпросмотр — без бонусов мини-игры: их ещё предстоит заработать.
      const preview = buildWeapon(
        forge.shape,
        forge.base,
        forge.inlay,
        { damage: 1, durability: 1, speed: 1 },
        durabilityCost(state.meta),
        [],
      );
      this.drawWeaponCard(g, preview, 'Что получится');
      this.strikesNote.visible = true;
      this.strikesNote.text = `Мини-игра: ${forge.strikesTotal} удара молотом`;
      this.strikesNote.position.set(CARD_X + 18, CARD_Y + CARD_H - 26);
    } else {
      drawPanel(g, CARD_X, CARD_Y, CARD_W, CARD_H, { fill: COLORS.panelHi, edge: COLORS.goldDim });
      this.cardTitle.visible = true;
      this.cardTitle.text = 'Ковать не из чего';
      this.cardTitle.position.set(CARD_X + 18, CARD_Y + 14);
      const t = this.cardLines[0];
      t.visible = true;
      t.style.wordWrap = true;
      t.style.wordWrapWidth = CARD_W - 36;
      t.text = `Нужно ${WEAPON_BASE_COST} штуки одного предмета не ниже слитка. Переплавь сырьё на верстаке.`;
      t.position.set(CARD_X + 18, CARD_Y + 56);
    }

    this.hint.text = hintFor(
      '↑↓ строка · ← → значение · Enter — ковать · Q — верстак · R — в шахту · Backspace — выбросить',
      'Тапни по краям строки, чтобы листать значение',
    );
  }

  /** Что показывать в строке рецепта и хватает ли предмета. */
  private rowContent(
    state: GameState,
    forge: ForgeState,
    r: number,
  ): { text: string; color: number; have: number; need: number } {
    if (r === 0) {
      return { text: SHAPES[forge.shape].name, color: COLORS.text, have: 0, need: 0 };
    }

    const id = r === 1 ? forge.base : forge.inlay;
    if (id === null) {
      return {
        text: r === 1 ? 'нечего ковать' : 'без вставки',
        color: r === 1 ? COLORS.danger : COLORS.textDim,
        have: 0,
        need: 0,
      };
    }

    const def = ITEMS[id];
    return {
      text: def.name,
      color: def.color,
      have: state.meta.backpack[id],
      need: requiredAmount(id, forge.base, forge.inlay),
    };
  }

  // -------------------------------------------------------------------------
  // Карточка оружия
  // -------------------------------------------------------------------------

  private drawWeaponCard(g: Graphics, w: Weapon, title: string): void {
    drawPanel(g, CARD_X, CARD_Y, CARD_W, CARD_H, { fill: COLORS.panelHi, edge: COLORS.goldDim });

    this.cardTitle.visible = true;
    this.cardTitle.text = title;
    this.cardTitle.position.set(CARD_X + 18, CARD_Y + 14);

    const base = ITEMS[w.base];
    g.rect(CARD_X + 18, CARD_Y + 46, CARD_W - 36, 6).fill(base.color);

    const lines = [
      `${SHAPES[w.shape].name} · ${base.name}${w.inlay ? ` + ${ITEMS[w.inlay].name}` : ''}`,
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
    for (let i = 0; i < this.cardLines.length; i++) {
      const t = this.cardLines[i];
      t.text = lines[i] ?? '';
      if (!t.text) continue;
      t.visible = true;
      const isNote = i === noteIndex;
      t.style.fill = isNote ? COLORS.textFaint : i === 0 ? COLORS.text : COLORS.textDim;
      t.style.fontSize = isNote ? 13 : 15;
      t.style.wordWrap = i === 0 || isNote;
      t.style.wordWrapWidth = CARD_W - 36;
      t.position.set(CARD_X + 18, isNote ? ly + 8 : ly);
      ly += t.height + (isNote ? 14 : 6);
    }
  }

  /** Тупик должен быть виден и иметь выход прямо на этом экране. */
  private drawStuckWarning(state: GameState): void {
    if (canForgeAnything(state.meta)) return;
    const full = backpackTotal(state.meta.backpack) >= backpackCapacity(state.meta);
    this.warning.visible = true;
    this.warning.text = full
      ? 'Ни соединить, ни выковать нечего, а рюкзак полон — выброси лишнее и спустись ещё раз'
      : 'Ни соединить, ни выковать нечего — спустись в шахту ещё раз';
    centerText(this.warning, VIEW_W / 2, VIEW_H - 102);
  }

  // -------------------------------------------------------------------------
  // Мини-игра
  // -------------------------------------------------------------------------

  private drawMinigame(forge: ForgeState, g: Graphics): void {
    const heat = forge.strikesDone / Math.max(1, forge.strikesTotal);
    g.roundRect(VIEW_W / 2 - 44, 180, 88, 30, 4).fill({ color: 0xff7a2a, alpha: 0.35 + heat * 0.4 });

    this.strikeLabel.visible = true;
    this.strikeLabel.text = `Удар ${Math.min(forge.strikesDone + 1, forge.strikesTotal)} из ${forge.strikesTotal}`;
    centerText(this.strikeLabel, VIEW_W / 2, 238);

    drawPanel(g, BAR_X - 8, BAR_Y - 8, BAR_W + 16, BAR_H + 16, { fill: COLORS.panel });
    g.rect(BAR_X, BAR_Y, BAR_W, BAR_H).fill(COLORS.bgDeep);

    const zoneX = BAR_X + (forge.zoneCenter - forge.zoneHalf) * BAR_W;
    g.rect(zoneX, BAR_Y, forge.zoneHalf * 2 * BAR_W, BAR_H).fill({ color: COLORS.ember, alpha: 0.35 });

    const perfectX = BAR_X + (forge.zoneCenter - forge.perfectHalf) * BAR_W;
    g.rect(perfectX, BAR_Y, forge.perfectHalf * 2 * BAR_W, BAR_H).fill({ color: COLORS.emberHot, alpha: 0.8 });

    const mx = BAR_X + forge.marker * BAR_W;
    g.rect(mx - 2, BAR_Y - 10, 4, BAR_H + 20).fill(COLORS.text);
    g.moveTo(mx - 8, BAR_Y - 12).lineTo(mx + 8, BAR_Y - 12).lineTo(mx, BAR_Y - 2).fill(COLORS.gold);

    g.rect(BAR_X, BAR_Y, BAR_W, BAR_H).stroke({ width: 2, color: COLORS.panelEdge, alignment: 1 });

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
    }

    this.minigameHint.visible = true;
    this.minigameHint.text = hintFor('Пробел — удар', 'Тапни, чтобы ударить');
    centerText(this.minigameHint, VIEW_W / 2, BAR_Y - 28);
    this.hint.text = '';
  }

  // -------------------------------------------------------------------------
  // Готовое оружие
  // -------------------------------------------------------------------------

  private drawDone(forge: ForgeState, g: Graphics): void {
    if (!forge.forged) return;

    this.drawWeaponCard(g, forge.forged, 'Оружие готово');
    drawPanel(g, LEFT_X, CARD_Y, LEFT_W, CARD_H, { alpha: 0.92 });

    const bonuses: [string, number, number][] = [
      ['Урон', forge.bonusDamage, COLORS.gold],
      ['Прочность', forge.bonusDurability, COLORS.durFill],
      ['Скорость', forge.bonusSpeed, COLORS.magic],
    ];

    let by = CARD_Y + 34;
    for (let i = 0; i < bonuses.length; i++) {
      const [name, value, color] = bonuses[i];
      const t = this.bonusLabels[i];
      t.visible = true;
      t.text = `${name}  ×${value.toFixed(2)}`;
      t.style.fill = value >= 1 ? COLORS.text : COLORS.danger;
      t.position.set(ROW_X, by);
      // Шкала центрирована на ×1.0: видно и прибавку, и потерю от промаха.
      drawBar(g, ROW_X, by + 24, ROW_W, 14, value / 2, color);
      by += 66;
    }

    const perfect = forge.results.filter((r) => r === 'perfect').length;
    const good = forge.results.filter((r) => r === 'good').length;
    const miss = forge.results.filter((r) => r === 'miss').length;
    this.recipe.visible = true;
    this.recipe.text = `Идеальных: ${perfect}   ·   попаданий: ${good}   ·   промахов: ${miss}`;
    this.recipe.position.set(ROW_X, CARD_Y + CARD_H - 24);

    this.hint.text = hintFor('Enter — выйти на арену', 'Тапни, чтобы выйти на арену');
  }

  /**
   * В мини-игре и на карточке готового оружия годится тап в любое место.
   *
   * На верстаке тапают прямо по клетке: палец сразу кладёт предмет в слот,
   * а не «наводит курсор, потом подтверждает». На наковальне — по краям строки,
   * как и раньше: значения длинные, и стрелки по бокам читаются лучше кнопок.
   */
  hitRegions(state: GameState): HitRegion[] {
    const forge = state.forge;
    if (!forge) return [];

    if (forge.stage === 'minigame' || forge.stage === 'done') {
      return [fullScreenRegion({ type: 'MENU_CONFIRM' })];
    }

    const regions: HitRegion[] = [
      { x: TAB_X[0], y: TAB_Y, w: TAB_W, h: TAB_H, commands: [{ type: 'FORGE_TAB', tab: 'craft' }] },
      { x: TAB_X[1], y: TAB_Y, w: TAB_W, h: TAB_H, commands: [{ type: 'FORGE_TAB', tab: 'assemble' }] },
    ];

    if (forge.tab === 'craft') {
      const owned = ownedItems(state.meta.backpack);
      for (let i = 0; i < Math.min(owned.length, MAX_CELLS); i++) {
        const col = i % FORGE_GRID_COLS;
        const row = Math.floor(i / FORGE_GRID_COLS);
        if (row >= GRID_ROWS) break;
        regions.push({
          x: GRID_X + col * (CELL_W + CELL_GAP),
          y: GRID_Y + row * (CELL_H + CELL_GAP),
          w: CELL_W,
          h: CELL_H,
          commands: [
            { type: 'CRAFT_CURSOR', index: i },
            { type: 'CRAFT_PICK', item: owned[i] },
          ],
        });
      }
      regions.push({
        x: CRAFT_BTN.x,
        y: CRAFT_BTN.y,
        w: CRAFT_BTN.w,
        h: CRAFT_BTN.h,
        commands: [{ type: 'CRAFT_COMBINE' }],
      });
      regions.push({
        x: CLEAR_BTN.x,
        y: CLEAR_BTN.y,
        w: CLEAR_BTN.w,
        h: CLEAR_BTN.h,
        commands: [{ type: 'CRAFT_CLEAR' }],
      });
      return regions;
    }

    const arrowW = 84;
    for (let r = 0; r < ROW_Y.length; r++) {
      const y = ROW_Y[r];
      const delta = r - forge.assembleRow;
      const focus: Command[] = delta === 0 ? [] : [{ type: 'MENU_ROW', delta }];

      regions.push({
        x: ROW_X,
        y,
        w: arrowW,
        h: ROW_H,
        commands: [...focus, valueCommand(state, forge, r, -1)],
      });
      regions.push({
        x: ROW_X + ROW_W - arrowW,
        y,
        w: arrowW,
        h: ROW_H,
        commands: [...focus, valueCommand(state, forge, r, 1)],
      });
      regions.push({ x: ROW_X + arrowW, y, w: ROW_W - arrowW * 2, h: ROW_H, commands: focus });
    }

    return regions;
  }
}

/** Следующее или предыдущее значение в строке рецепта — абсолютной командой. */
function valueCommand(state: GameState, forge: ForgeState, row: number, dir: number): Command {
  if (row === 0) {
    const i = SHAPE_ORDER.indexOf(forge.shape);
    return {
      type: 'FORGE_SET_SHAPE',
      shape: SHAPE_ORDER[(i + dir + SHAPE_ORDER.length) % SHAPE_ORDER.length],
    };
  }

  if (row === 1) {
    const options = forgeableItems(state.meta.backpack);
    if (options.length === 0) return { type: 'MENU_ROW', delta: 0 };
    const i = forge.base ? options.indexOf(forge.base) : 0;
    return {
      type: 'FORGE_SET_BASE',
      item: options[(i + dir + options.length) % options.length],
    };
  }

  const inlays: (ItemId | null)[] = [
    null,
    ...ownedItems(state.meta.backpack).filter((id) => isForgeable(id)),
  ];
  const i = inlays.indexOf(forge.inlay);
  return { type: 'FORGE_SET_INLAY', item: inlays[(i + dir + inlays.length) % inlays.length] };
}
