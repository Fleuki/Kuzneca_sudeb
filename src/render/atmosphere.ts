/**
 * Атмосферный слой: параллакс, взвесь в воздухе и туман.
 *
 * Это то, что отличает «арену из примитивов» от места, в котором происходит
 * игра. Приём взят у Hollow Knight и стоит дёшево: три плана вместо одного,
 * медленно летящая пыль и градиент, который прячет края экрана.
 *
 * Весь слой — чистая косметика. Он живёт в рендере, использует своё время кадра
 * и собственный ГПСЧ: детерминизм симуляции не должен зависеть ни от того,
 * сколько пылинок сейчас на экране, ни от частоты кадров (§11). В состояние
 * отсюда не попадает ничего.
 *
 * Читаемость важнее красоты: взвесь тусклая и мелкая, туман лежит позади
 * бойцов, а красный язык телеграфов (§6) ничем не перекрывается.
 */

import { Container, Graphics } from 'pixi.js';
import { VIEW_H, VIEW_W } from '../core/constants.ts';

/** Насколько далеко план: 0 — приклеен к камере, 1 — движется вместе с миром. */
interface LayerDef {
  /** Доля смещения камеры. Дальний план едет медленнее ближнего. */
  factor: number;
  color: number;
  alpha: number;
  /** Сколько силуэтов в плане и какими они бывают. */
  count: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  /** 'pillar' — колонна от пола, 'stalactite' — сосулька от потолка, 'hill' — холм. */
  shape: 'pillar' | 'stalactite' | 'hill';
  /** От какой линии растёт силуэт. */
  baseY: number;
}

export interface AtmosphereTheme {
  /** Цвет неба/глубины сверху и снизу — общий градиент сцены. */
  skyTop: number;
  skyBottom: number;
  layers: LayerDef[];
  /** Взвесь: цвет, количество, размер и направление дрейфа. */
  moteColor: number;
  moteCount: number;
  moteSize: number;
  moteRise: number;
  moteDrift: number;
  /** Туман у пола. */
  fogColor: number;
  fogAlpha: number;
  /** Мерцающее зарево снизу — горн, лава, свечение бездны. */
  glowColor: number;
  glowAlpha: number;
}

interface Silhouette {
  x: number;
  w: number;
  h: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

/** Свой ГПСЧ, чтобы силуэты были одинаковыми в пределах сцены и не трогали симуляцию. */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const WORLD_SPAN = VIEW_W * 2;

export class Atmosphere {
  readonly container = new Container();
  private backG = new Graphics();
  private layerG = new Graphics();
  private moteG = new Graphics();
  private fogG = new Graphics();

  private theme: AtmosphereTheme | null = null;
  private themeKey = '';
  private silhouettes: Silhouette[][] = [];
  private motes: Mote[] = [];

  constructor() {
    this.container.addChild(this.backG, this.layerG, this.moteG, this.fogG);
  }

  /**
   * Меняет тему. Силуэты и взвесь пересоздаются только когда тема реально
   * другая: перестраивать их каждый кадр — значит мигать всей сценой.
   */
  setTheme(key: string, theme: AtmosphereTheme): void {
    if (this.themeKey === key) return;
    this.themeKey = key;
    this.theme = theme;

    const rand = makeRandom(hashKey(key));
    this.silhouettes = theme.layers.map((layer) => {
      const out: Silhouette[] = [];
      for (let i = 0; i < layer.count; i++) {
        out.push({
          x: rand() * WORLD_SPAN,
          w: layer.minW + rand() * (layer.maxW - layer.minW),
          h: layer.minH + rand() * (layer.maxH - layer.minH),
        });
      }
      return out;
    });

    this.motes = [];
    for (let i = 0; i < theme.moteCount; i++) {
      this.motes.push({
        x: rand() * VIEW_W,
        y: rand() * VIEW_H,
        vx: (rand() - 0.5) * theme.moteDrift,
        vy: -theme.moteRise * (0.4 + rand()),
        size: theme.moteSize * (0.5 + rand()),
        phase: rand() * Math.PI * 2,
      });
    }

    this.drawBack();
  }

  /**
   * @param camX смещение камеры в мире — по нему считается параллакс
   * @param dt   время кадра рендера (не тик симуляции)
   */
  draw(camX: number, dt: number, time: number): void {
    const theme = this.theme;
    if (!theme) return;

    this.drawLayers(theme, camX);
    this.stepMotes(dt);
    this.drawMotes(theme, time);
    this.drawFog(theme, time);
  }

  // -------------------------------------------------------------------------

  /** Глубина: вертикальный градиент. Рисуется один раз на тему. */
  private drawBack(): void {
    const theme = this.theme;
    if (!theme) return;
    const g = this.backG;
    g.clear();

    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const color = mixColor(theme.skyTop, theme.skyBottom, t);
      g.rect(0, (VIEW_H / steps) * i, VIEW_W, VIEW_H / steps + 1).fill(color);
    }
  }

  private drawLayers(theme: AtmosphereTheme, camX: number): void {
    const g = this.layerG;
    g.clear();

    for (let li = 0; li < theme.layers.length; li++) {
      const layer = theme.layers[li];
      const shift = camX * layer.factor;

      for (const s of this.silhouettes[li]) {
        // Планы зациклены по ширине: мир длиннее экрана, а силуэтов немного.
        let x = ((s.x - shift) % WORLD_SPAN + WORLD_SPAN) % WORLD_SPAN - VIEW_W / 2;
        if (x > VIEW_W + s.w || x < -s.w * 2) continue;

        if (layer.shape === 'stalactite') {
          g.moveTo(x, layer.baseY)
            .lineTo(x + s.w, layer.baseY)
            .lineTo(x + s.w / 2, layer.baseY + s.h)
            .fill({ color: layer.color, alpha: layer.alpha });
        } else if (layer.shape === 'hill') {
          g.ellipse(x + s.w / 2, layer.baseY + s.h, s.w, s.h).fill({
            color: layer.color,
            alpha: layer.alpha,
          });
        } else {
          g.rect(x, layer.baseY - s.h, s.w, s.h).fill({ color: layer.color, alpha: layer.alpha });
          // Скол наверху — колонна не должна выглядеть аккуратной палкой.
          g.moveTo(x, layer.baseY - s.h)
            .lineTo(x + s.w, layer.baseY - s.h)
            .lineTo(x + s.w * 0.6, layer.baseY - s.h - 14)
            .fill({ color: layer.color, alpha: layer.alpha * 0.8 });
        }
      }
    }
  }

  private stepMotes(dt: number): void {
    if (dt <= 0) return;
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.phase += dt * 1.6;

      // Взвесь не кончается: улетевшая пылинка возвращается с другой стороны.
      if (m.y < -10) {
        m.y = VIEW_H + 10;
        m.x = Math.random() * VIEW_W;
      } else if (m.y > VIEW_H + 10) {
        m.y = -10;
        m.x = Math.random() * VIEW_W;
      }
      if (m.x < -10) m.x = VIEW_W + 10;
      else if (m.x > VIEW_W + 10) m.x = -10;
    }
  }

  private drawMotes(theme: AtmosphereTheme, time: number): void {
    const g = this.moteG;
    g.clear();
    for (const m of this.motes) {
      // Мерцание: пылинка то попадает в свет, то нет.
      const twinkle = 0.35 + 0.35 * Math.sin(m.phase + time * 0.5);
      g.circle(m.x, m.y, m.size).fill({ color: theme.moteColor, alpha: twinkle });
    }
  }

  private drawFog(theme: AtmosphereTheme, time: number): void {
    const g = this.fogG;
    g.clear();

    // Зарево снизу дышит — статичный экран не должен выглядеть мёртвым.
    const glow = theme.glowAlpha * (0.8 + 0.2 * Math.sin(time * 0.9));
    g.rect(0, VIEW_H - 200, VIEW_W, 200).fill({ color: theme.glowColor, alpha: glow });

    // Туман: две полосы, ползущие в разные стороны.
    for (let i = 0; i < 2; i++) {
      const dir = i === 0 ? 1 : -1;
      const offset = ((time * (6 + i * 4) * dir) % (VIEW_W + 200)) - 100;
      g.ellipse(offset, VIEW_H - 40 - i * 26, 320, 44 + i * 10).fill({
        color: theme.fogColor,
        alpha: theme.fogAlpha,
      });
      g.ellipse(offset + 420, VIEW_H - 30 - i * 22, 260, 36 + i * 8).fill({
        color: theme.fogColor,
        alpha: theme.fogAlpha * 0.8,
      });
    }

    // Виньетка: края темнее центра, взгляд собирается к бойцам.
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 5;
      const a = 0.12 * t;
      const w = 90 - i * 14;
      g.rect(0, 0, w, VIEW_H).fill({ color: 0x000000, alpha: a });
      g.rect(VIEW_W - w, 0, w, VIEW_H).fill({ color: 0x000000, alpha: a });
      g.rect(0, 0, VIEW_W, w * 0.7).fill({ color: 0x000000, alpha: a });
    }
  }
}

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
