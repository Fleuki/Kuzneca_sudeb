/**
 * Фаза добычи.
 *
 * Тайлы уровня рисуются один раз в отдельный Graphics и дальше только двигаются
 * камерой — перерисовывать три тысячи прямоугольников каждый кадр незачем.
 * Динамика (руда, ловушки, игрок) перерисовывается каждый кадр.
 */

import { Container, Graphics, Text } from 'pixi.js';
import {
  BIOMES,
  BOSSES,
  MATERIALS,
  MATERIAL_ORDER,
  MINE,
  PLAYER,
  TILE,
  VIEW_H,
  VIEW_W,
} from '../../core/constants.ts';
import { TILE_POISON, TILE_SOLID, TILE_SPIKE } from '../../core/types.ts';
import type { GameState, MineState } from '../../core/types.ts';
import { backpackCapacity, backpackTotal } from '../../sim/state.ts';
import { COLORS, SMALL_STYLE, style } from '../theme.ts';
import { centerText, drawBar, drawPanel, interp, makeText } from '../ui.ts';
import type { Scene } from './scene.ts';

/** Отступ сверху, чтобы уровень не залезал под HUD. */
const WORLD_Y = 62;

export class MineScene implements Scene {
  container = new Container();
  private world = new Container();
  private tilesG = new Graphics();
  private entitiesG = new Graphics();
  private hudG = new Graphics();

  private builtFor: MineState | null = null;

  private hpLabel = makeText('', style(13, COLORS.textDim));
  private packLabel = makeText('', style(13, COLORS.textDim));
  private targetLabel = makeText('', style(13, COLORS.gold));
  private biomeLabel = makeText('', SMALL_STYLE);
  private stockLabels: Text[] = [];
  private toast = makeText('', style(16, COLORS.emberHot));
  private exitPrompt = makeText('', style(16, COLORS.gold));

  constructor() {
    this.world.addChild(this.tilesG, this.entitiesG);
    this.container.addChild(this.world, this.hudG);
    this.container.addChild(this.hpLabel, this.packLabel, this.targetLabel, this.biomeLabel);
    for (let i = 0; i < MATERIAL_ORDER.length; i++) {
      const t = makeText('', style(13, COLORS.textDim));
      this.stockLabels.push(t);
      this.container.addChild(t);
    }
    this.container.addChild(this.toast, this.exitPrompt);
  }

  draw(state: GameState, alpha: number, time: number): void {
    const mine = state.mine;
    const run = state.run;
    if (!mine || !run || !run.biome) return;

    if (this.builtFor !== mine) {
      this.buildTiles(mine, run.biome);
      this.builtFor = mine;
    }

    const px = interp(mine.player.px, mine.player.x, alpha);
    const py = interp(mine.player.py, mine.player.y, alpha);

    // Камера едет только по горизонтали: уровень по высоте помещается в экран.
    const worldW = mine.width * TILE;
    let camX = px - VIEW_W / 2;
    camX = Math.max(0, Math.min(worldW - VIEW_W, camX));
    this.world.position.set(-Math.round(camX), WORLD_Y);

    this.drawEntities(mine, px, py, time);
    this.drawHud(state, mine, run.biome);
  }

  // -------------------------------------------------------------------------
  // Статика
  // -------------------------------------------------------------------------

  private buildTiles(mine: MineState, biome: keyof typeof BIOMES): void {
    const g = this.tilesG;
    const def = BIOMES[biome];
    g.clear();

    // Фон пещеры.
    g.rect(0, 0, mine.width * TILE, mine.height * TILE).fill(def.bgColor);

    for (let y = 0; y < mine.height; y++) {
      for (let x = 0; x < mine.width; x++) {
        const t = mine.tiles[y * mine.width + x];
        const wx = x * TILE;
        const wy = y * TILE;

        if (t === TILE_SOLID) {
          g.rect(wx, wy, TILE, TILE).fill(def.tileColor);
          // Светлая кромка сверху — читается как поверхность, на которую можно встать.
          const above = y > 0 ? mine.tiles[(y - 1) * mine.width + x] : TILE_SOLID;
          if (above !== TILE_SOLID) g.rect(wx, wy, TILE, 4).fill(def.tileEdge);
        } else if (t === TILE_SPIKE) {
          const n = 3;
          const step = TILE / n;
          for (let i = 0; i < n; i++) {
            const sx = wx + i * step;
            g.moveTo(sx, wy + TILE)
              .lineTo(sx + step / 2, wy + TILE * 0.25)
              .lineTo(sx + step, wy + TILE)
              .fill(0xb8b0a4);
          }
        } else if (t === TILE_POISON) {
          g.rect(wx, wy + TILE * 0.45, TILE, TILE * 0.55).fill({ color: 0x4fa03a, alpha: 0.75 });
          g.rect(wx, wy + TILE * 0.45, TILE, 3).fill(0x8fe06a);
        }
      }
    }

    // Подъёмник на выход.
    const ex = mine.exitX;
    const ey = mine.exitY;
    g.rect(ex - 26, ey - TILE * 3, 52, TILE * 3).fill({ color: COLORS.gold, alpha: 0.12 });
    g.rect(ex - 26, ey - 4, 52, 4).fill(COLORS.gold);
    g.rect(ex - 26, ey - TILE * 3, 4, TILE * 3).fill(COLORS.goldDim);
    g.rect(ex + 22, ey - TILE * 3, 4, TILE * 3).fill(COLORS.goldDim);
  }

  // -------------------------------------------------------------------------
  // Динамика
  // -------------------------------------------------------------------------

  private drawEntities(mine: MineState, px: number, py: number, time: number): void {
    const g = this.entitiesG;
    g.clear();

    // Руда
    for (const ore of mine.ore) {
      if (ore.mined) continue;
      const mat = MATERIALS[ore.material];
      const size = 15;
      const flash = ore.hitFlash > 0;
      g.roundRect(ore.x - size / 2, ore.y - size / 2, size, size, 3)
        .fill(flash ? 0xffffff : mat.color)
        .stroke({ width: 2, color: mat.darkColor, alignment: 1 });
      // Блик — подсказывает, что объект интерактивный.
      g.rect(ore.x - 4, ore.y - 5, 3, 3).fill({ color: 0xffffff, alpha: 0.7 });
      // Оставшаяся прочность жилы.
      if (ore.hp < MINE.oreHp) {
        g.rect(ore.x - size / 2, ore.y + size / 2 + 3, size, 2).fill({ color: COLORS.danger, alpha: 0.8 });
      }
    }

    // Осыпающиеся платформы
    for (const c of mine.crumbles) {
      if (c.state === 'gone') continue;
      const shake = c.state === 'shaking' ? Math.sin(time * 60) * 2 : 0;
      const color = c.state === 'idle' ? 0x7a6a58 : 0xa8563c;
      g.rect(c.x + shake, c.y, c.w, c.h).fill(color).stroke({ width: 1, color: 0x3a2f26, alignment: 1 });
      // Трещины на дрожащей платформе.
      if (c.state !== 'idle') {
        g.moveTo(c.x + 6 + shake, c.y).lineTo(c.x + 10 + shake, c.y + c.h).stroke({ width: 1, color: 0x2a211b });
      }
    }

    // Сталактиты
    for (const s of mine.stalactites) {
      if (s.state === 'broken') continue;
      const warn = s.state === 'warning';
      const shake = warn ? Math.sin(time * 70) * 2.5 : 0;
      g.moveTo(s.x - 9 + shake, s.y - 22)
        .lineTo(s.x + 9 + shake, s.y - 22)
        .lineTo(s.x + shake, s.y)
        .fill(warn ? COLORS.dangerSoft : 0x8c8478);
      if (warn) {
        // Пыль сыплется — предупреждение до падения (0.55 с).
        g.rect(s.x - 2, s.y + 6, 4, 10).fill({ color: COLORS.danger, alpha: 0.5 });
      }
    }

    // Игрок
    const p = mine.player;
    const blink = p.invuln > 0 && Math.floor(time * 20) % 2 === 0;
    if (!blink) {
      g.roundRect(px - PLAYER.w / 2, py - PLAYER.h, PLAYER.w, PLAYER.h, 3)
        .fill(0xd8cbb4)
        .stroke({ width: 2, color: 0x5a4a38, alignment: 1 });
      // Фартук кузнеца — чтобы силуэт читался.
      g.rect(px - PLAYER.w / 2 + 3, py - PLAYER.h * 0.55, PLAYER.w - 6, PLAYER.h * 0.45).fill(0x8c5a3c);
    }

    // Кирка
    if (p.swingTimer > 0) {
      const t = 1 - p.swingTimer / MINE.pickSwing;
      const angle = -0.9 + t * 1.8;
      const cx = px + p.facing * 8;
      const cy = py - PLAYER.h * 0.65;
      const len = 26;
      const ex = cx + Math.cos(angle) * len * p.facing;
      const ey = cy + Math.sin(angle) * len;
      g.moveTo(cx, cy).lineTo(ex, ey).stroke({ width: 4, color: 0x9a8a6a });
      g.circle(ex, ey, 4).fill(0xb0b8c0);
    }
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  private drawHud(state: GameState, mine: MineState, biome: keyof typeof BIOMES): void {
    const g = this.hudG;
    const run = state.run;
    if (!run) return;
    g.clear();

    drawPanel(g, 0, 0, VIEW_W, WORLD_Y - 6, { fill: COLORS.bgDeep, edge: COLORS.panelEdge, alpha: 0.95 });

    // Здоровье: переносится в бой, поэтому висит на видном месте (§4).
    drawBar(g, 16, 14, 200, 14, run.hp / run.hpMax, COLORS.hpFill, COLORS.hpBack);
    this.hpLabel.text = `Здоровье ${Math.ceil(run.hp)}/${run.hpMax}`;
    this.hpLabel.position.set(16, 32);

    // Рюкзак — единственное ограничение фазы.
    const total = backpackTotal(state.meta.backpack);
    const cap = backpackCapacity(state.meta);
    const full = total >= cap;
    drawBar(g, 244, 14, 200, 14, total / cap, full ? COLORS.ember : COLORS.gold, COLORS.hpBack);
    this.packLabel.text = `Рюкзак ${total}/${cap}${full ? ' — полон' : ''}`;
    this.packLabel.style.fill = full ? COLORS.ember : COLORS.textDim;
    this.packLabel.position.set(244, 32);

    // Что уже лежит в рюкзаке — чтобы решать, что добивать.
    let sx = 472;
    for (let i = 0; i < MATERIAL_ORDER.length; i++) {
      const m = MATERIAL_ORDER[i];
      const count = state.meta.backpack[m];
      const t = this.stockLabels[i];
      t.text = `${MATERIALS[m].short} ${count}`;
      t.style.fill = count > 0 ? MATERIALS[m].color : COLORS.textFaint;
      t.position.set(sx + 12, 15);
      g.rect(sx, 18, 8, 8).fill(count > 0 ? MATERIALS[m].color : COLORS.textFaint);
      sx += 62;
    }

    const boss = BOSSES[run.bossId];
    this.targetLabel.text = `Цель: ${boss.name} — нужен ${MATERIALS[boss.answer].name}`;
    this.targetLabel.position.set(472, 36);

    this.biomeLabel.text = BIOMES[biome].name;
    this.biomeLabel.position.set(VIEW_W - 16 - this.biomeLabel.width, 15);

    // Всплывашка о добытом
    this.toast.text = mine.toastTimer > 0 ? mine.toast : '';
    centerText(this.toast, VIEW_W / 2, VIEW_H - 76);

    // Подсказка выхода
    this.exitPrompt.text = mine.atExit ? 'E — подняться на поверхность' : '';
    if (state.noticeTimer > 0) this.exitPrompt.text = state.notice;
    centerText(this.exitPrompt, VIEW_W / 2, VIEW_H - 46);
  }
}
