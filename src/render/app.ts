/**
 * Инициализация PixiJS и масштабирование сцены.
 *
 * Игра рисуется в фиксированном логическом разрешении 960×540, а корневой
 * контейнер масштабируется под окно с сохранением пропорций. Так одна и та же
 * раскладка работает и в окне itch.io, и во фрейме Яндекс Игр.
 */

import { Application, Container } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../core/constants.ts';
import { COLORS } from './theme.ts';

export interface Viewport {
  app: Application;
  /** Корень логической сцены 960×540. Всё рисуется внутри него. */
  root: Container;
}

export async function createViewport(mount: HTMLElement): Promise<Viewport> {
  const app = new Application();

  await app.init({
    width: VIEW_W,
    height: VIEW_H,
    background: COLORS.bgDeep,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  });

  mount.appendChild(app.canvas);

  const root = new Container();
  app.stage.addChild(root);

  const resize = (): void => {
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    const scale = Math.min(w / VIEW_W, h / VIEW_H);

    app.renderer.resize(w, h);
    root.scale.set(scale);
    // Центрируем логическое поле — по краям остаются поля фона.
    root.position.set((w - VIEW_W * scale) / 2, (h - VIEW_H * scale) / 2);
  };

  resize();
  window.addEventListener('resize', resize);

  return { app, root };
}
