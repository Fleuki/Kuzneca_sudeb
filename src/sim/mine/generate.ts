/**
 * Сборка уровня шахты из ручных сегментов (§4).
 *
 * Случайность отвечает только за порядок комнат, материал в жилах и
 * биомные добавки ловушек. Сама геометрия всегда нарисована руками —
 * так уровень остаётся проходимым без валидатора проходимости.
 */

import { MINE, TILE } from '../../core/constants.ts';
import { TILE_EMPTY, TILE_POISON, TILE_SOLID, TILE_SPIKE } from '../../core/types.ts';
import { BIOMES } from '../../core/constants.ts';
import { MATERIAL_ORDER } from '../../core/constants.ts';
import { chance, nextInt, pickWeighted, shuffle } from '../../core/rng.ts';
import type { Rng } from '../../core/rng.ts';
import type { BiomeId, MineState } from '../../core/types.ts';
import { emptyBackpack } from '../state.ts';
import { LINK_ROWS, ROOM_ENTRY, ROOM_EXIT, ROOM_H, ROOM_POOL, ROOM_W } from './rooms.ts';
import type { RoomTemplate } from './rooms.ts';

/** Под нижним рядом комнат всегда лежит непробиваемая порода. */
const BEDROCK_ROWS = 1;

function normalizeRows(tpl: RoomTemplate): string[] {
  const out: string[] = [];
  for (let y = 0; y < ROOM_H; y++) {
    const raw = tpl.rows[y] ?? '';
    out.push(raw.length >= ROOM_W ? raw.slice(0, ROOM_W) : raw.padEnd(ROOM_W, '.'));
  }
  return out;
}

function pickRooms(rng: Rng): RoomTemplate[] {
  const middleCount = Math.max(1, MINE.roomsPerRun - 2);
  const pool = shuffle(rng, ROOM_POOL.slice());
  const middle = pool.slice(0, middleCount);
  return [ROOM_ENTRY, ...middle, ROOM_EXIT];
}

export function generateMine(rng: Rng, biome: BiomeId, oreAmount: number): MineState {
  const rooms = pickRooms(rng);
  const width = rooms.length * ROOM_W;
  const height = ROOM_H + BEDROCK_ROWS;

  const tiles = new Array<number>(width * height).fill(TILE_EMPTY);
  const idx = (x: number, y: number) => y * width + x;

  const state: MineState = {
    width,
    height,
    tiles,
    player: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      px: 0,
      py: 0,
      facing: 1,
      onGround: false,
      coyote: 0,
      jumpBuffer: 0,
      invuln: 0,
      swingTimer: 0,
      swingCooldown: 0,
    },
    ore: [],
    crumbles: [],
    stalactites: [],
    collected: emptyBackpack(),
    exitX: 0,
    exitY: 0,
    atExit: false,
    elapsed: 0,
    toast: '',
    toastTimer: 0,
  };

  const biomeDef = BIOMES[biome];
  const weights = MATERIAL_ORDER.map((m) => biomeDef.weights[m]);
  let nextId = 1;

  // --- Раскладка символов в тайлы и сущности ---------------------------------
  for (let r = 0; r < rooms.length; r++) {
    const rows = normalizeRows(rooms[r]);
    const ox = r * ROOM_W;

    for (let y = 0; y < ROOM_H; y++) {
      const row = rows[y];
      for (let x = 0; x < ROOM_W; x++) {
        const ch = row[x];
        const gx = ox + x;
        const cellX = gx * TILE + TILE / 2;
        const cellY = y * TILE;

        switch (ch) {
          case '#':
            tiles[idx(gx, y)] = TILE_SOLID;
            break;
          case '^':
            tiles[idx(gx, y)] = TILE_SPIKE;
            break;
          case '~':
            tiles[idx(gx, y)] = TILE_POISON;
            break;
          case 'o':
            state.ore.push({
              id: nextId++,
              x: cellX,
              y: cellY + TILE / 2,
              material: pickWeighted(rng, MATERIAL_ORDER, weights),
              hp: MINE.oreHp,
              amount: oreAmount,
              mined: false,
              hitFlash: 0,
            });
            break;
          case 'c':
            state.crumbles.push({
              id: nextId++,
              x: gx * TILE,
              y: cellY,
              w: TILE,
              h: 10,
              state: 'idle',
              timer: 0,
              vy: 0,
            });
            break;
          case 's':
            state.stalactites.push({
              id: nextId++,
              x: cellX,
              y: cellY + TILE,
              startY: cellY + TILE,
              state: 'idle',
              timer: 0,
              vy: 0,
            });
            break;
          default:
            break;
        }
      }
    }
  }

  // --- Гарантии стыковки и границ -------------------------------------------
  // Потолок и коренная порода снизу.
  for (let x = 0; x < width; x++) {
    tiles[idx(x, 0)] = TILE_SOLID;
    tiles[idx(x, height - 1)] = TILE_SOLID;
  }
  // Внешние стены — чтобы игрок не вышел за пределы уровня.
  for (let y = 0; y < height; y++) {
    tiles[idx(0, y)] = TILE_SOLID;
    tiles[idx(width - 1, y)] = TILE_SOLID;
  }
  // Коридор на стыках комнат: пробиваем проход и подкладываем пол.
  for (let r = 1; r < rooms.length; r++) {
    const seam = r * ROOM_W;
    for (let x = seam - 2; x <= seam + 1; x++) {
      if (x <= 0 || x >= width - 1) continue;
      for (const y of LINK_ROWS) tiles[idx(x, y)] = TILE_EMPTY;
      tiles[idx(x, ROOM_H - 2)] = TILE_SOLID;
      tiles[idx(x, ROOM_H - 1)] = TILE_SOLID;
    }
  }

  // --- Биомные добавки ловушек ----------------------------------------------
  applyBiomeHazards(rng, state, biome, nextId);

  // --- Точка старта и выход --------------------------------------------------
  const floorY = (ROOM_H - 2) * TILE;
  state.player.x = 3 * TILE;
  state.player.y = floorY;
  state.player.px = state.player.x;
  state.player.py = state.player.y;

  state.exitX = (width - 3) * TILE;
  state.exitY = floorY;

  // Рядом со стартом и выходом ловушек быть не должно.
  clearHazardsNear(state, tiles, width, state.player.x, 2.5 * TILE);
  clearHazardsNear(state, tiles, width, state.exitX, 2.5 * TILE);

  return state;
}

/**
 * Вулканические слои и кристальные каверны опаснее верхних штолен (§3).
 * Добавляем ловушки поверх нарисованных, не трогая геометрию.
 */
function applyBiomeHazards(rng: Rng, state: MineState, biome: BiomeId, nextId: number): void {
  if (biome === 'upper') return;

  const { width, height, tiles } = state;
  const idx = (x: number, y: number) => y * width + x;
  const extraSpikes = biome === 'volcanic' ? 14 : 6;
  const extraStalactites = biome === 'volcanic' ? 6 : 10;
  let id = nextId;

  for (let i = 0; i < extraSpikes; i++) {
    const x = nextInt(rng, 3, width - 4);
    for (let y = 1; y < height - 1; y++) {
      // Ищем открытую клетку прямо над камнем.
      if (tiles[idx(x, y)] === TILE_EMPTY && tiles[idx(x, y + 1)] === TILE_SOLID) {
        tiles[idx(x, y)] = biome === 'volcanic' ? TILE_SPIKE : TILE_POISON;
        break;
      }
    }
  }

  for (let i = 0; i < extraStalactites; i++) {
    const x = nextInt(rng, 3, width - 4);
    for (let y = 1; y < height - 6; y++) {
      if (tiles[idx(x, y)] === TILE_SOLID && tiles[idx(x, y + 1)] === TILE_EMPTY) {
        if (!chance(rng, 0.7)) break;
        state.stalactites.push({
          id: id++,
          x: x * TILE + TILE / 2,
          y: (y + 1) * TILE,
          startY: (y + 1) * TILE,
          state: 'idle',
          timer: 0,
          vy: 0,
        });
        break;
      }
    }
  }
}

/** Убирает ловушки в радиусе вокруг точки — чтобы не убить игрока на входе. */
function clearHazardsNear(
  state: MineState,
  tiles: number[],
  width: number,
  x: number,
  radius: number,
): void {
  const tx0 = Math.floor((x - radius) / TILE);
  const tx1 = Math.floor((x + radius) / TILE);
  for (let ty = 0; ty < state.height; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || tx >= width) continue;
      const t = tiles[ty * width + tx];
      if (t === TILE_SPIKE || t === TILE_POISON) tiles[ty * width + tx] = TILE_EMPTY;
    }
  }
  state.stalactites = state.stalactites.filter((s) => Math.abs(s.x - x) > radius);
}
