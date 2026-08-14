/**
 * Балансировка ботами (§10, недели 11–12).
 *
 * Прогоняет бой «каждое оружие против каждого босса» много раз с разными сидами
 * и печатает таблицу винрейтов. Это работает только потому, что симуляция
 * отделена от рендера и детерминирована (§11): здесь нет ни PixiJS, ни DOM.
 *
 * Запуск:  npm run balance
 *          npm run balance -- --runs 100 --boss golem
 */

import { BOSSES, BOSS_ORDER, DT, MATERIALS, MATERIAL_ORDER, PLAYER, SHAPES, SHAPE_ORDER } from '../src/core/constants.ts';
import { createRng } from '../src/core/rng.ts';
import type { BossId, GameState, MaterialId, ShapeId } from '../src/core/types.ts';
import { dispatch, tick } from '../src/sim/game.ts';
import { createGameState } from '../src/sim/state.ts';
import { createCombat } from '../src/sim/combat/step.ts';
import { buildWeapon } from '../src/sim/forge/weapon.ts';
import { botInput, createBotMemory } from './bot.ts';

/** Дольше этого бой считается провальным по темпу, а не по урону. */
const MAX_SECONDS = 150;

interface Outcome {
  won: boolean;
  seconds: number;
  hpLeft: number;
  bossHpLeft: number;
  weaponBroken: boolean;
  timedOut: boolean;
}

function simulateFight(
  bossId: BossId,
  shape: ShapeId,
  primary: MaterialId,
  secondary: MaterialId | null,
  seed: number,
): Outcome {
  const state: GameState = createGameState(seed);
  state.rng = createRng(seed);

  const weapon = buildWeapon(shape, primary, secondary, { damage: 1, durability: 1, speed: 1 }, 1, []);

  state.run = {
    seed,
    bossId,
    biome: null,
    hp: PLAYER.hpMax,
    hpMax: PLAYER.hpMax,
    weapon,
    offered: [bossId],
  };
  state.phase = 'combat';
  state.combat = createCombat(state);

  const mem = createBotMemory();
  const maxTicks = Math.ceil(MAX_SECONDS / DT);
  let ticks = 0;

  while (state.phase === 'combat' && ticks < maxTicks) {
    const combat = state.combat;
    if (!combat) break;
    dispatch(state, { type: 'INPUT', input: botInput(combat, currentWeapon(state), mem) });
    tick(state);
    ticks += 1;
  }

  const result = state.result;
  const timedOut = ticks >= maxTicks;

  return {
    won: result ? result.won : false,
    seconds: ticks * DT,
    hpLeft: Math.max(0, state.run?.hp ?? 0),
    bossHpLeft: 0,
    weaponBroken: result ? result.weaponBroken : weapon.durability <= 0,
    timedOut,
  };
}

function currentWeapon(state: GameState) {
  const w = state.run?.weapon ?? null;
  return w && w.durability > 0 ? w : null;
}

// ---------------------------------------------------------------------------
// Отчёт
// ---------------------------------------------------------------------------

interface Row {
  label: string;
  answer: boolean;
  wins: number;
  runs: number;
  avgSeconds: number;
  avgHp: number;
  brokenRate: number;
  timeoutRate: number;
}

function runTable(bossId: BossId, runs: number, secondary: MaterialId | null): Row[] {
  const rows: Row[] = [];
  const answer = BOSSES[bossId].answer;

  for (const shape of SHAPE_ORDER) {
    for (const primary of MATERIAL_ORDER) {
      let wins = 0;
      let seconds = 0;
      let hp = 0;
      let broken = 0;
      let timeouts = 0;

      for (let i = 0; i < runs; i++) {
        // Сид зависит от комбинации, но повторяем один и тот же набор для всех —
        // сравнение получается честным.
        const seed = 0x5eed0000 + i * 7919;
        const out = simulateFight(bossId, shape, primary, secondary, seed);
        if (out.won) wins += 1;
        seconds += out.seconds;
        hp += out.hpLeft;
        if (out.weaponBroken) broken += 1;
        if (out.timedOut) timeouts += 1;
      }

      rows.push({
        label: `${SHAPES[shape].name} · ${MATERIALS[primary].name}`,
        answer: primary === answer,
        wins,
        runs,
        avgSeconds: seconds / runs,
        avgHp: hp / runs,
        brokenRate: broken / runs,
        timeoutRate: timeouts / runs,
      });
    }
  }

  return rows;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

function printTable(bossId: BossId, rows: Row[]): void {
  const def = BOSSES[bossId];
  console.log('');
  console.log(`══ ${def.name} · ${def.hp} HP · ответ: ${MATERIALS[def.answer].name}`);
  console.log(
    pad('оружие', 34) +
      padLeft('винрейт', 9) +
      padLeft('время', 8) +
      padLeft('HP', 7) +
      padLeft('слом', 7) +
      padLeft('таймаут', 9),
  );
  console.log('─'.repeat(74));

  const sorted = rows.slice().sort((a, b) => b.wins / b.runs - a.wins / a.runs);
  for (const r of sorted) {
    const wr = r.wins / r.runs;
    const mark = r.answer ? '◆ ' : '  ';
    console.log(
      pad(mark + r.label, 34) +
        padLeft(`${(wr * 100).toFixed(0)}%`, 9) +
        padLeft(`${r.avgSeconds.toFixed(1)}с`, 8) +
        padLeft(r.avgHp.toFixed(0), 7) +
        padLeft(`${(r.brokenRate * 100).toFixed(0)}%`, 7) +
        padLeft(`${(r.timeoutRate * 100).toFixed(0)}%`, 9),
    );
  }

  // Главная проверка баланса: материал-ответ должен быть заметно лучше прочих.
  const answerBest = sorted.findIndex((r) => r.answer);
  const verdict =
    answerBest <= 1
      ? '✓ материал-ответ в лидерах'
      : `⚠ материал-ответ только на ${answerBest + 1} месте — числа стоит пересмотреть`;
  console.log(verdict);
}

// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { runs: number; boss: BossId | null; secondary: MaterialId | null } {
  let runs = 30;
  let boss: BossId | null = null;
  let secondary: MaterialId | null = null;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--runs' && argv[i + 1]) runs = Math.max(1, parseInt(argv[i + 1], 10));
    if (argv[i] === '--boss' && argv[i + 1]) {
      const b = argv[i + 1] as BossId;
      if (BOSS_ORDER.indexOf(b) >= 0) boss = b;
    }
    if (argv[i] === '--secondary' && argv[i + 1]) {
      const m = argv[i + 1] as MaterialId;
      if (MATERIAL_ORDER.indexOf(m) >= 0) secondary = m;
    }
  }
  return { runs, boss, secondary };
}

function main(): void {
  const { runs, boss, secondary } = parseArgs(process.argv.slice(2));
  const bosses = boss ? [boss] : BOSS_ORDER;

  console.log(`Прогон баланса: ${runs} боёв на комбинацию`);
  console.log(`Вторичный материал: ${secondary ? MATERIALS[secondary].name : 'нет'}`);

  const started = Date.now();
  for (const b of bosses) printTable(b, runTable(b, runs, secondary));
  console.log('');
  console.log(`Готово за ${((Date.now() - started) / 1000).toFixed(1)} с`);
}

main();
