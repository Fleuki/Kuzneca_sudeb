/**
 * Проверка детерминизма (§11: один сид → один результат).
 *
 * Прогоняет один и тот же сценарий дважды и сравнивает состояние побайтно.
 * Если проверка падает — значит куда-то просочился Math.random, Date.now
 * или зависимость от частоты кадров, и балансировка ботами больше не имеет
 * смысла: её результаты нельзя воспроизвести.
 *
 * Запуск: npm run determinism
 */

import { BIOME_ORDER, DT, PLAYER } from '../src/core/constants.ts';
import { createRng } from '../src/core/rng.ts';
import type { GameState } from '../src/core/types.ts';
import { emptyInput } from '../src/core/types.ts';
import { dispatch, tick } from '../src/sim/game.ts';
import { createGameState } from '../src/sim/state.ts';
import { createCombat } from '../src/sim/combat/step.ts';
import { buildWeapon } from '../src/sim/forge/weapon.ts';
import { botInput, createBotMemory } from './bot.ts';

interface Check {
  name: string;
  run: (seed: number) => string;
}

/** Полный забег по фазам: выбор → шахта → ковка → бой. */
function scriptedRun(seed: number): string {
  const state = createGameState(seed);

  dispatch(state, { type: 'START_RUN' });
  dispatch(state, { type: 'SELECT_BOSS', bossId: 'golem' });
  dispatch(state, { type: 'SELECT_BIOME', biome: BIOME_ORDER[1] });

  // Скриптованная добыча: бежим вправо и машем киркой.
  for (let i = 0; i < 60 * 40; i++) {
    const input = emptyInput();
    input.right = true;
    input.attack = true;
    input.attackPressed = i % 12 === 0;
    input.jump = i % 90 < 8;
    input.jumpPressed = i % 90 === 0;
    dispatch(state, { type: 'INPUT', input });
    tick(state);
  }

  // Крафт по дереву: две руды в слиток, два слитка в сплав — и куём из сплава.
  dispatch(state, { type: 'CRAFT_PICK', item: 'obsidian_ore' });
  dispatch(state, { type: 'CRAFT_PICK', item: 'obsidian_ore' });
  for (let i = 0; i < 4; i++) dispatch(state, { type: 'CRAFT_COMBINE' });
  dispatch(state, { type: 'CRAFT_CLEAR' });
  dispatch(state, { type: 'CRAFT_PICK', item: 'obsidian_bar' });
  dispatch(state, { type: 'CRAFT_PICK', item: 'obsidian_bar' });
  for (let i = 0; i < 2; i++) dispatch(state, { type: 'CRAFT_COMBINE' });

  dispatch(state, { type: 'FORGE_SET_SHAPE', shape: 'heavy' });
  dispatch(state, { type: 'FORGE_SET_BASE', item: 'obsidian_bar' });
  dispatch(state, { type: 'FORGE_SET_INLAY', item: null });
  dispatch(state, { type: 'FORGE_BEGIN' });

  for (let i = 0; i < 60 * 10; i++) {
    if (i % 47 === 0) dispatch(state, { type: 'FORGE_STRIKE' });
    dispatch(state, { type: 'INPUT', input: emptyInput() });
    tick(state);
  }

  return JSON.stringify(state);
}

/** Только бой — самая нагруженная случайностью часть. */
function scriptedFight(seed: number): string {
  const state: GameState = createGameState(seed);
  state.rng = createRng(seed);
  state.run = {
    seed,
    bossId: 'abyss',
    biome: null,
    hp: PLAYER.hpMax,
    hpMax: PLAYER.hpMax,
    weapon: buildWeapon('light', 'prism', 'basalt', { damage: 1, durability: 1, speed: 1 }, 1, []),
    offered: ['abyss'],
  };
  state.phase = 'combat';
  state.combat = createCombat(state);

  const mem = createBotMemory();
  const maxTicks = Math.ceil(120 / DT);
  let ticks = 0;
  while (state.phase === 'combat' && ticks < maxTicks) {
    const combat = state.combat;
    if (!combat) break;
    const w = state.run?.weapon ?? null;
    dispatch(state, { type: 'INPUT', input: botInput(combat, w && w.durability > 0 ? w : null, mem) });
    tick(state);
    ticks += 1;
  }
  return JSON.stringify(state);
}

const CHECKS: Check[] = [
  { name: 'полный забег (шахта + ковка)', run: scriptedRun },
  { name: 'бой с Повелителем Бездны', run: scriptedFight },
];

function main(): void {
  const seeds = [1, 42, 1337, 0xbeef];
  let failures = 0;

  for (const check of CHECKS) {
    for (const seed of seeds) {
      const a = check.run(seed);
      const b = check.run(seed);
      const ok = a === b;
      if (!ok) {
        failures += 1;
        console.log(`✗ ${check.name}, сид ${seed}: результаты разошлись`);
        console.log(`  длины: ${a.length} и ${b.length}`);
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          if (a[i] !== b[i]) {
            console.log(`  первое расхождение на символе ${i}:`);
            console.log(`   A: …${a.slice(Math.max(0, i - 60), i + 60)}`);
            console.log(`   B: …${b.slice(Math.max(0, i - 60), i + 60)}`);
            break;
          }
        }
      } else {
        console.log(`✓ ${check.name}, сид ${seed}`);
      }
    }
  }

  // Разные сиды обязаны давать разные забеги — иначе ГПСЧ не подключён.
  const s1 = scriptedRun(1);
  const s2 = scriptedRun(2);
  if (s1 === s2) {
    failures += 1;
    console.log('✗ разные сиды дали одинаковый результат — ГПСЧ где-то не используется');
  } else {
    console.log('✓ разные сиды дают разные забеги');
  }

  console.log('');
  if (failures > 0) {
    console.log(`ПРОВАЛ: ${failures}`);
    process.exit(1);
  }
  console.log('Детерминизм в порядке.');
}

main();
