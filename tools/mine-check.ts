/**
 * Проверка проходимости шахты.
 *
 * Комнаты рисуются руками (§4), и это значит, что ошибиться в них можно тоже
 * руками: платформа, до которой не допрыгнуть, выглядит в тексте ровно так же,
 * как платформа, до которой допрыгнуть можно. Ровно это и случилось на первом
 * плейтесте — половина руды висела на высоте, недосягаемой с пола.
 *
 * Здесь строится граф «мест, где можно стоять», от точки старта пускается обход,
 * и проверяется, что игрок дотянется до каждой жилы и до подъёмника.
 *
 * Модель прыжка сознательно консервативнее настоящей физики: если проверка
 * говорит «достижимо», игрок точно дойдёт; редкие «недостижимо» на честно
 * проходимых местах лучше, чем пропущенный тупик.
 *
 * Запуск: npm run mine-check
 */

import { BIOME_ORDER, MINE, PLAYER, TILE } from '../src/core/constants.ts';
import { TILE_SOLID } from '../src/core/types.ts';
import type { BiomeId, MineState } from '../src/core/types.ts';
import { createRng } from '../src/core/rng.ts';
import { generateMine } from '../src/sim/mine/generate.ts';

/** Высота прыжка и дальность — из тех же констант, что и симуляция. */
const JUMP_H = PLAYER.jumpVelocity ** 2 / (2 * PLAYER.gravity);
const AIR_TIME = (2 * PLAYER.jumpVelocity) / PLAYER.gravity;
const JUMP_REACH = PLAYER.moveSpeed * AIR_TIME;

/** Запас: край прыжка требует идеального исполнения, на него не закладываемся. */
const SAFETY = 0.85;
const MAX_UP = Math.floor((JUMP_H * SAFETY) / TILE);
const MAX_ACROSS = Math.floor((JUMP_REACH * SAFETY) / TILE);
/** Падать можно сколько угодно, но по горизонтали — не дальше дальности прыжка. */
const MAX_FALL_ACROSS = MAX_ACROSS;

/** Сколько рядов над опорой нужно игроку, чтобы поместиться. */
const BODY_ROWS = Math.ceil(PLAYER.h / TILE);

function key(x: number, y: number): number {
  return y * 10000 + x;
}

export interface MineReport {
  biome: BiomeId;
  seed: number;
  totalOre: number;
  unreachableOre: number;
  exitReachable: boolean;
  standables: number;
  /** Координаты недостижимых жил в тайлах — чтобы искать их в тексте комнаты. */
  unreachableAt: { room: number; col: number; row: number }[];
}

function solidAt(mine: MineState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mine.width || y >= mine.height) return true;
  return mine.tiles[y * mine.width + x] === TILE_SOLID;
}

/** Осыпающиеся платформы держат достаточно долго, чтобы с них оттолкнуться. */
function platformAt(mine: MineState, x: number, y: number): boolean {
  if (solidAt(mine, x, y)) return true;
  const px = x * TILE;
  const py = y * TILE;
  for (const c of mine.crumbles) {
    if (c.x < px + TILE && c.x + c.w > px && c.y < py + TILE && c.y + c.h > py) return true;
  }
  return false;
}

/** Место, где игрок может стоять: опора снизу и свободное место под рост. */
function standable(mine: MineState, x: number, y: number): boolean {
  if (!platformAt(mine, x, y + 1)) return false;
  for (let i = 0; i < BODY_ROWS; i++) {
    if (solidAt(mine, x, y - i)) return false;
  }
  return true;
}

/**
 * Свободна ли колонка над клеткой на нужную высоту — иначе прыжок упрётся в потолок.
 *
 * Проверяется ровно то, что занимает игрок в верхней точке: ступни поднимаются
 * на `rows`, тело занимает ещё BODY_ROWS-1 ряда над ними. Требовать свободным
 * весь ряд над головой нельзя — тогда площадка, над которой этажом выше проходит
 * другая платформа, ошибочно считается недостижимой.
 */
function headroom(mine: MineState, x: number, y: number, rows: number): boolean {
  for (let i = 1; i <= rows + BODY_ROWS - 1; i++) {
    if (solidAt(mine, x, y - i)) return false;
  }
  return true;
}

export function checkMine(mine: MineState, biome: BiomeId, seed: number): MineReport {
  // --- Все места, где можно стоять ------------------------------------------
  const stand: number[] = [];
  const standSet = new Set<number>();
  for (let y = 0; y < mine.height; y++) {
    for (let x = 0; x < mine.width; x++) {
      if (standable(mine, x, y)) {
        stand.push(key(x, y));
        standSet.add(key(x, y));
      }
    }
  }

  // --- Обход в ширину от точки старта ---------------------------------------
  const startX = Math.floor(mine.player.x / TILE);
  const startY = Math.floor((mine.player.y - 1) / TILE);
  let start = key(startX, startY);
  if (!standSet.has(start)) {
    // Стартовая клетка могла попасть на границу — ищем ближайшую подходящую.
    let best = -1;
    let bestD = Infinity;
    for (const k of stand) {
      const x = k % 10000;
      const y = Math.floor(k / 10000);
      const d = Math.abs(x - startX) + Math.abs(y - startY);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    start = best;
  }

  const seen = new Set<number>([start]);
  const queue: number[] = [start];

  while (queue.length > 0) {
    const cur = queue.pop() as number;
    const cx = cur % 10000;
    const cy = Math.floor(cur / 10000);

    for (let dx = -MAX_ACROSS; dx <= MAX_ACROSS; dx++) {
      for (let dy = -MAX_FALL_ACROSS * 4; dy <= MAX_UP; dy++) {
        // dy > 0 — вверх (меньший индекс строки), dy < 0 — вниз.
        const nx = cx + dx;
        const ny = cy - dy;
        const k = key(nx, ny);
        if (seen.has(k) || !standSet.has(k)) continue;

        if (dy > 0) {
          // Подъём: нужен запас по высоте и дальности одновременно.
          if (Math.abs(dx) > MAX_ACROSS) continue;
          if (!headroom(mine, cx, cy, dy)) continue;
          if (!headroom(mine, nx, ny, 0)) continue;
        } else {
          // Спуск или ровный путь: ограничиваем только горизонталь.
          if (Math.abs(dx) > MAX_FALL_ACROSS) continue;
        }

        seen.add(k);
        queue.push(k);
      }
    }
  }

  // --- Дотягивается ли игрок до руды ----------------------------------------
  let unreachable = 0;
  const unreachableAt: { room: number; col: number; row: number }[] = [];
  const reach = MINE.pickRange;
  for (const ore of mine.ore) {
    let ok = false;
    for (const k of seen) {
      const x = (k % 10000) * TILE + TILE / 2;
      const y = Math.floor(k / 10000) * TILE + TILE - PLAYER.h / 2;
      if (Math.abs(ore.x - x) <= reach && Math.abs(ore.y - y) <= reach) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      unreachable += 1;
      const col = Math.floor(ore.x / TILE);
      unreachableAt.push({ room: Math.floor(col / 36), col: col % 36, row: Math.floor(ore.y / TILE) });
    }
  }

  // --- Выход ------------------------------------------------------------------
  const exitTx = Math.floor(mine.exitX / TILE);
  const exitTy = Math.floor((mine.exitY - 1) / TILE);
  let exitReachable = false;
  for (let dx = -2; dx <= 2 && !exitReachable; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      if (seen.has(key(exitTx + dx, exitTy + dy))) {
        exitReachable = true;
        break;
      }
    }
  }

  return {
    biome,
    seed,
    totalOre: mine.ore.length,
    unreachableOre: unreachable,
    exitReachable,
    standables: seen.size,
    unreachableAt,
  };
}

// ---------------------------------------------------------------------------

function main(): void {
  const verbose = process.argv.includes('--verbose');
  const runs = 40;
  console.log(`Проверка проходимости: ${runs} шахт на биом`);
  console.log(`Прыжок: ${JUMP_H.toFixed(0)} px (${MAX_UP} тайла вверх с запасом), дальность ${MAX_ACROSS} тайла`);
  console.log('');

  let failures = 0;
  let worstOre = 0;
  const hotspots = new Map<string, number>();

  for (const biome of BIOME_ORDER) {
    let unreachable = 0;
    let total = 0;
    let noExit = 0;
    let minReachableOre = Infinity;

    for (let i = 0; i < runs; i++) {
      const seed = 0x1e5700 + i * 7919;
      const mine = generateMine(createRng(seed), biome, MINE.oreAmount);
      const r = checkMine(mine, biome, seed);
      if (verbose && r.unreachableOre > 0) {
        for (const u of r.unreachableAt) hotspots.set(`ряд ${u.row}, столбец ${u.col}`, (hotspots.get(`ряд ${u.row}, столбец ${u.col}`) ?? 0) + 1);
      }
      unreachable += r.unreachableOre;
      total += r.totalOre;
      if (!r.exitReachable) noExit += 1;
      minReachableOre = Math.min(minReachableOre, r.totalOre - r.unreachableOre);
    }

    const pct = total > 0 ? (unreachable / total) * 100 : 0;
    // На оружие нужно 12 единиц одного материала; руда даёт 2 за жилу,
    // значит в худшей шахте должно быть достижимо хотя бы 10 жил.
    const enough = minReachableOre >= 10;
    const ok = unreachable === 0 && noExit === 0 && enough;
    if (!ok) failures += 1;
    worstOre = Math.max(worstOre, unreachable);

    console.log(
      `${ok ? '✓' : '✗'} ${biome.padEnd(9)} недостижимой руды: ${String(unreachable).padStart(4)}/${total} (${pct.toFixed(1)}%)` +
        `  ·  без выхода: ${noExit}  ·  минимум достижимых жил: ${minReachableOre}`,
    );
  }

  if (verbose && hotspots.size > 0) {
    console.log('');
    console.log('Где именно руда недостижима:');
    for (const [place, n] of [...hotspots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`  ${place} — ${n} раз`);
    }
  }

  console.log('');
  if (failures > 0) {
    console.log('ПРОВАЛ: в шахте есть недостижимые места.');
    process.exit(1);
  }
  console.log('Все шахты проходимы.');
}

main();
