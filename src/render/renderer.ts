/**
 * Переключение сцен.
 *
 * Рендер полностью пассивен: он читает состояние и рисует то, что видит.
 * Ни одна сцена не меняет GameState и не вызывает dispatch (§11).
 */

import { Container } from 'pixi.js';
import type { GameState, Phase } from '../core/types.ts';
import { BiomeSelectScene } from './scenes/biomeSelectScene.ts';
import { BossSelectScene } from './scenes/bossSelectScene.ts';
import { CombatScene } from './scenes/combatScene.ts';
import { ForgeScene } from './scenes/forgeScene.ts';
import { MenuScene } from './scenes/menuScene.ts';
import { MineScene } from './scenes/mineScene.ts';
import { ResultScene } from './scenes/resultScene.ts';
import { UpgradesScene } from './scenes/upgradesScene.ts';
import type { Scene } from './scenes/scene.ts';

export class Renderer {
  private scenes: Record<Phase, Scene>;
  private current: Phase | null = null;

  constructor(root: Container) {
    this.scenes = {
      menu: new MenuScene(),
      bossSelect: new BossSelectScene(),
      biomeSelect: new BiomeSelectScene(),
      mine: new MineScene(),
      forge: new ForgeScene(),
      combat: new CombatScene(),
      result: new ResultScene(),
      upgrades: new UpgradesScene(),
    };

    for (const key of Object.keys(this.scenes) as Phase[]) {
      const scene = this.scenes[key];
      scene.container.visible = false;
      root.addChild(scene.container);
    }
  }

  render(state: GameState, alpha: number, time: number): void {
    if (this.current !== state.phase) {
      if (this.current) this.scenes[this.current].container.visible = false;
      this.scenes[state.phase].container.visible = true;
      this.current = state.phase;
    }
    this.scenes[state.phase].draw(state, alpha, time);
  }
}
