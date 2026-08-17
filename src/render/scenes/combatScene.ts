/**
 * Фаза боя.
 *
 * Арена — один статичный экран без прокрутки (§6). Всё, что бьёт игрока,
 * рисуется через один и тот же красный язык: контур во время телеграфа,
 * заливка во время активной фазы.
 */

import { Container, Graphics, Text } from 'pixi.js';
import {
  ARENA,
  BOSSES,
  PLAYER,
  SHAPES,
  VIEW_H,
  VIEW_W,
} from '../../core/constants.ts';
import { ITEMS } from '../../core/items.ts';
import type { BossState, CombatState, GameState, Hazard, Weapon } from '../../core/types.ts';
import { hazardRect } from '../../sim/combat/step.ts';
import { COLORS, SMALL_STYLE, style } from '../theme.ts';
import { centerText, drawBar, drawPanel, drawTelegraph, interp, makeText } from '../ui.ts';
import type { Scene } from './scene.ts';

export class CombatScene implements Scene {
  container = new Container();
  private world = new Container();
  private arenaG = new Graphics();
  private actorsG = new Graphics();
  private hudG = new Graphics();

  private bossName = makeText('', style(15, COLORS.text));
  private bossPhase = makeText('', style(13, COLORS.magic));
  private hpLabel = makeText('', style(13, COLORS.textDim));
  private weaponLabel = makeText('', style(13, COLORS.textDim));
  private durLabel = makeText('', style(13, COLORS.textDim));
  private dashLabel = makeText('', SMALL_STYLE);
  private banner = makeText('', style(44, COLORS.gold, { letterSpacing: 5 }));
  private brokenLabel = makeText('', style(16, COLORS.danger));

  constructor() {
    this.world.addChild(this.arenaG, this.actorsG);
    this.container.addChild(this.world, this.hudG);
    this.container.addChild(
      this.bossName,
      this.bossPhase,
      this.hpLabel,
      this.weaponLabel,
      this.durLabel,
      this.dashLabel,
      this.brokenLabel,
      this.banner,
    );
  }

  draw(state: GameState, alpha: number, time: number): void {
    const combat = state.combat;
    if (!combat) return;

    // Тряска экрана — косметика, поэтому берётся от времени рендера,
    // а не от ГПСЧ симуляции: детерминизм не должен зависеть от кадров.
    const shake = combat.shake;
    const sx = Math.sin(time * 87) * shake * 7;
    const sy = Math.cos(time * 71) * shake * 5;
    this.world.position.set(sx, sy);

    this.drawArena(time);
    this.drawActors(combat, state.run?.weapon ?? null, alpha, time);
    this.drawHud(state, combat);
  }

  // -------------------------------------------------------------------------

  private drawArena(time: number): void {
    const g = this.arenaG;
    g.clear();

    g.rect(0, 0, VIEW_W, VIEW_H).fill(COLORS.bg);

    // Дальний план: колонны, чтобы арена не выглядела пустой коробкой.
    for (let i = 0; i < 5; i++) {
      const x = 80 + i * 200;
      g.rect(x, 90, 44, ARENA.groundY - 90).fill({ color: 0x191521, alpha: 0.9 });
      g.rect(x, 90, 44, 10).fill({ color: 0x241f2e, alpha: 0.9 });
    }

    // Зарево снизу.
    const glow = 0.06 + 0.02 * Math.sin(time * 1.2);
    g.rect(0, ARENA.groundY - 120, VIEW_W, 120).fill({ color: COLORS.ember, alpha: glow });

    // Пол
    g.rect(0, ARENA.groundY, VIEW_W, VIEW_H - ARENA.groundY).fill(0x241f28);
    g.rect(0, ARENA.groundY, VIEW_W, 5).fill(0x3d3547);

    // Единственная платформа посередине (§6)
    g.rect(ARENA.platformX1, ARENA.platformY, ARENA.platformX2 - ARENA.platformX1, ARENA.platformH)
      .fill(0x322b3a);
    g.rect(ARENA.platformX1, ARENA.platformY, ARENA.platformX2 - ARENA.platformX1, 4).fill(0x4c4257);

    // Границы арены
    g.rect(0, 0, ARENA.left, VIEW_H).fill({ color: COLORS.bgDeep, alpha: 0.85 });
    g.rect(ARENA.right, 0, VIEW_W - ARENA.right, VIEW_H).fill({ color: COLORS.bgDeep, alpha: 0.85 });
  }

  // -------------------------------------------------------------------------

  private drawActors(combat: CombatState, weapon: Weapon | null, alpha: number, time: number): void {
    const g = this.actorsG;
    g.clear();

    // Опасности рисуем под бойцами, кроме телеграфов — их видно всегда.
    for (const h of combat.hazards) this.drawHazard(g, h, alpha);

    for (const m of combat.minions) {
      const mx = interp(m.px, m.x, alpha);
      const my = interp(m.py, m.y, alpha);
      g.roundRect(mx - 15, my - 40, 30, 40, 4)
        .fill(m.hitFlash > 0 ? 0xffffff : 0x4a3a60)
        .stroke({ width: 2, color: 0x7a5fa0, alignment: 1 });
      g.circle(mx - 5, my - 28, 3).fill(COLORS.dangerSoft);
      g.circle(mx + 5, my - 28, 3).fill(COLORS.dangerSoft);
    }

    this.drawBoss(g, combat.boss, alpha, time);
    this.drawPlayer(g, combat, weapon, alpha, time);
  }

  private drawHazard(g: Graphics, h: Hazard, alpha: number): void {
    const r = hazardRect(h);
    const x = h.kind === 'dive' ? r.x : interp(h.px - h.w / 2, h.x - h.w / 2, alpha);
    const y = h.kind === 'dive' ? r.y : interp(h.py - h.h, h.y - h.h, alpha);

    if (h.telegraph > 0) {
      // Чем ближе срабатывание, тем ярче контур.
      const pulse = 1 - Math.min(1, h.telegraph / 0.9);
      drawTelegraph(g, x, y, h.w, h.h, pulse);
      return;
    }

    switch (h.kind) {
      case 'pillar':
        g.rect(x, y, h.w, h.h).fill({ color: COLORS.ember, alpha: 0.85 });
        g.rect(x + 6, y + 8, h.w - 12, h.h - 8).fill({ color: COLORS.emberHot, alpha: 0.7 });
        break;
      case 'beam':
        g.rect(x, y, h.w, h.h).fill({ color: 0x9a5fd0, alpha: 0.9 });
        g.rect(x, y + h.h / 2 - 3, h.w, 6).fill(0xe6c8ff);
        break;
      case 'wave':
        g.moveTo(x, y + h.h)
          .lineTo(x + h.w / 2, y)
          .lineTo(x + h.w, y + h.h)
          .fill(0x8a7a5a);
        g.rect(x, y + h.h - 6, h.w, 6).fill(COLORS.ember);
        break;
      case 'rock':
        g.circle(x + h.w / 2, y + h.h / 2, h.w / 2).fill(0x7a6a58).stroke({ width: 2, color: 0x4a3f33, alignment: 1 });
        break;
      case 'feather':
        g.ellipse(x + h.w / 2, y + h.h / 2, h.w / 2, h.h / 2).fill(0xd88a5a);
        break;
      case 'gust':
        g.rect(x, y, h.w, h.h).fill({ color: 0xbfae94, alpha: 0.22 });
        for (let i = 0; i < 4; i++) {
          const ly = y + 30 + i * 42;
          g.moveTo(x, ly).lineTo(x + h.w, ly - 12).stroke({ width: 3, color: 0xdccdb4, alpha: 0.5 });
        }
        break;
      case 'dive':
        // Сам силуэт рисует босс; здесь только шлейф.
        g.rect(x, y, h.w, h.h).fill({ color: COLORS.danger, alpha: 0.18 });
        break;
    }
  }

  private drawBoss(g: Graphics, boss: BossState, alpha: number, time: number): void {
    const def = BOSSES[boss.id];
    const x = interp(boss.px, boss.x, alpha);
    const y = interp(boss.py, boss.y, alpha);
    const left = x - boss.w / 2;
    const top = y - boss.h;
    const flash = boss.hitFlash > 0;
    const body = flash ? 0xffffff : def.color;

    // Щит второй фазы — видно, что физический урон теперь почти не проходит.
    if (boss.shield > 0) {
      const pulse = 0.25 + 0.1 * Math.sin(time * 4);
      g.ellipse(x, y - boss.h / 2, boss.w * 0.85, boss.h * 0.68)
        .fill({ color: COLORS.magic, alpha: pulse * 0.35 })
        .stroke({ width: 3, color: COLORS.magic, alpha: 0.8 });
    }

    if (boss.id === 'golem') {
      g.rect(left, top + boss.h * 0.28, boss.w, boss.h * 0.72).fill(body);
      g.rect(left + boss.w * 0.2, top, boss.w * 0.6, boss.h * 0.3).fill(body);
      g.rect(left - 14, top + boss.h * 0.34, 20, boss.h * 0.45).fill(def.accent);
      g.rect(left + boss.w - 6, top + boss.h * 0.34, 20, boss.h * 0.45).fill(def.accent);
      g.rect(left + boss.w * 0.3, top + boss.h * 0.1, 16, 10).fill(COLORS.ember);
      g.rect(left + boss.w * 0.58, top + boss.h * 0.1, 16, 10).fill(COLORS.ember);
    } else if (boss.id === 'harpy') {
      const flap = Math.sin(time * 9) * 12;
      g.moveTo(x, y - boss.h * 0.5)
        .lineTo(left - 44, y - boss.h * 0.9 - flap)
        .lineTo(left - 10, y - boss.h * 0.2)
        .fill(def.accent);
      g.moveTo(x, y - boss.h * 0.5)
        .lineTo(left + boss.w + 44, y - boss.h * 0.9 + flap)
        .lineTo(left + boss.w + 10, y - boss.h * 0.2)
        .fill(def.accent);
      g.ellipse(x, y - boss.h * 0.45, boss.w * 0.34, boss.h * 0.46).fill(body);
      g.circle(x + boss.facing * 14, y - boss.h * 0.78, 13).fill(body);
      g.circle(x + boss.facing * 20, y - boss.h * 0.8, 4).fill(COLORS.danger);
    } else {
      g.moveTo(left + boss.w * 0.5, top)
        .lineTo(left + boss.w, y)
        .lineTo(left, y)
        .fill(body);
      g.circle(x, top + boss.h * 0.18, boss.w * 0.22).fill(def.accent);
      g.circle(x - 10, top + boss.h * 0.17, 4).fill(COLORS.magic);
      g.circle(x + 10, top + boss.h * 0.17, 4).fill(COLORS.magic);
    }

    // Красный контур во время замаха — телеграф для атак без отдельной зоны (§6).
    if (boss.stage === 'telegraph') {
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(time * 12));
      g.rect(left - 4, top - 4, boss.w + 8, boss.h + 8).stroke({
        width: 3,
        color: COLORS.danger,
        alpha: pulse,
      });
    }
  }

  private drawPlayer(
    g: Graphics,
    combat: CombatState,
    weapon: Weapon | null,
    alpha: number,
    time: number,
  ): void {
    const p = combat.player;
    const x = interp(p.px, p.x, alpha);
    const y = interp(p.py, p.y, alpha);

    // Шлейф рывка — заодно подсказывает окно неуязвимости.
    if (p.dashTimer > 0) {
      for (let i = 1; i <= 3; i++) {
        g.roundRect(x - p.facing * i * 16 - PLAYER.w / 2, y - PLAYER.h, PLAYER.w, PLAYER.h, 3)
          .fill({ color: COLORS.magic, alpha: 0.16 / i });
      }
    }

    const blink = p.invuln > 0 && Math.floor(time * 20) % 2 === 0;
    if (!blink) {
      g.roundRect(x - PLAYER.w / 2, y - PLAYER.h, PLAYER.w, PLAYER.h, 3)
        .fill(p.dashIFrames > 0 ? COLORS.magic : 0xd8cbb4)
        .stroke({ width: 2, color: 0x5a4a38, alignment: 1 });
      g.rect(x - PLAYER.w / 2 + 3, y - PLAYER.h * 0.55, PLAYER.w - 6, PLAYER.h * 0.45).fill(0x8c5a3c);
    }

    // Замах: дуга у молота широкая, у клинков — короткий выпад.
    if (p.attackAnim > 0) {
      const range = weapon ? weapon.range : 30;
      const hitH = weapon ? SHAPES[weapon.shape].hitH : 40;
      const cy = y - PLAYER.h / 2;
      const ax = p.facing > 0 ? x : x - range;
      const t = Math.min(1, p.attackAnim / 0.25);
      const color = weapon ? ITEMS[weapon.base].color : 0xd8cbb4;
      g.rect(ax, cy - hitH / 2, range, hitH).fill({ color, alpha: 0.22 * t });
      g.rect(ax, cy - hitH / 2, range, hitH).stroke({ width: 2, color, alpha: 0.7 * t });
    }
  }

  // -------------------------------------------------------------------------

  private drawHud(state: GameState, combat: CombatState): void {
    const g = this.hudG;
    g.clear();

    const boss = combat.boss;
    const def = BOSSES[boss.id];

    // Шкала босса сверху.
    const bw = 560;
    const bx = VIEW_W / 2 - bw / 2;
    drawPanel(g, bx - 10, 14, bw + 20, 62, { fill: COLORS.bgDeep, alpha: 0.9 });
    drawBar(g, bx, 34, bw, 14, boss.hp / boss.hpMax, COLORS.bossFill, COLORS.hpBack);
    // Отметка перехода во вторую фазу — видно, сколько осталось до щита.
    if (boss.id === 'abyss') {
      g.rect(bx + bw * 0.5 - 1, 30, 2, 22).fill(COLORS.magic);
    }
    this.bossName.text = def.name;
    centerText(this.bossName, VIEW_W / 2, 14);

    this.bossPhase.text =
      boss.shield > 0 ? `Щит: −${Math.round(boss.shield * 100)}% физического урона` : '';
    this.bossPhase.position.set(bx + bw - this.bossPhase.width, 54);

    // Игрок слева внизу.
    const p = combat.player;
    drawPanel(g, 14, VIEW_H - 84, 330, 70, { fill: COLORS.bgDeep, alpha: 0.9 });
    drawBar(g, 28, VIEW_H - 70, 200, 14, p.hp / p.hpMax, COLORS.hpFill, COLORS.hpBack);
    this.hpLabel.text = `${Math.ceil(p.hp)}/${p.hpMax}`;
    this.hpLabel.position.set(236, VIEW_H - 70);

    const weapon = state.run?.weapon ?? null;
    const alive = weapon && weapon.durability > 0;
    if (alive && weapon) {
      const base = ITEMS[weapon.base];
      this.weaponLabel.text = `${SHAPES[weapon.shape].name} · ${base.name}`;
      this.weaponLabel.style.fill = base.color;
      drawBar(
        g,
        28,
        VIEW_H - 34,
        200,
        10,
        weapon.durability / weapon.durabilityMax,
        weapon.durability / weapon.durabilityMax < 0.25 ? COLORS.danger : COLORS.durFill,
        COLORS.hpBack,
      );
      this.durLabel.text = `${Math.ceil(weapon.durability)}/${weapon.durabilityMax}`;
      this.durLabel.position.set(236, VIEW_H - 36);
    } else {
      this.weaponLabel.text = 'Кулаки';
      this.weaponLabel.style.fill = COLORS.danger;
      this.durLabel.text = '';
    }
    this.weaponLabel.position.set(28, VIEW_H - 52);

    // Готовность рывка.
    const ready = p.dashCooldown <= 0;
    this.dashLabel.text = ready ? 'Рывок готов' : `Рывок ${p.dashCooldown.toFixed(1)}с`;
    this.dashLabel.style.fill = ready ? COLORS.magic : COLORS.textFaint;
    this.dashLabel.position.set(VIEW_W - 16 - this.dashLabel.width, VIEW_H - 34);

    this.brokenLabel.text = combat.weaponBroken ? 'Оружие сломалось' : '';
    centerText(this.brokenLabel, VIEW_W / 2, VIEW_H - 110);

    // Баннер исхода.
    if (combat.outcome !== 'fight') {
      g.rect(0, 0, VIEW_W, VIEW_H).fill({ color: COLORS.bgDeep, alpha: 0.45 });
      this.banner.text = combat.outcome === 'won' ? 'ПОБЕЖДЁН' : 'ПОРАЖЕНИЕ';
      this.banner.style.fill = combat.outcome === 'won' ? COLORS.gold : COLORS.danger;
      this.banner.visible = true;
      centerText(this.banner, VIEW_W / 2, VIEW_H / 2 - 40);
    } else {
      this.banner.visible = false;
    }
  }
}

/** Заглушка на случай, если нужно будет показать текст поверх сцены. */
export type CombatHudText = Text;
