/**
 * Проверка, что игрока нельзя запереть.
 *
 * На первом плейтесте забег кончился так: игрок вышел из шахты с шестью
 * единицами руды, на рецепт нужно двенадцать, сковать нечего, а обратно в шахту
 * дороги не было. Экран ковки стал тупиком, из которого не выходило ничего,
 * кроме перезагрузки страницы.
 *
 * Здесь проверяется, что из каждого такого положения есть выход, причём
 * доступный прямо на текущем экране.
 *
 * Запуск: npm run deadlock-check
 */

import { MINE, RECIPE_PRIMARY } from '../src/core/constants.ts';
import { emptyInput } from '../src/core/types.ts';
import type { GameState } from '../src/core/types.ts';
import { dispatch, tick } from '../src/sim/game.ts';
import { backpackCapacity, backpackTotal, canForgeAnything, createGameState } from '../src/sim/state.ts';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`✓ ${name}`);
  } else {
    failures += 1;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Доводит забег до экрана ковки с заданным содержимым рюкзака. */
function atForge(backpack: Partial<Record<'iron' | 'obsidian' | 'crystal' | 'bloodiron', number>>): GameState {
  const state = createGameState(4242);
  dispatch(state, { type: 'START_RUN' });
  dispatch(state, { type: 'SELECT_BOSS', bossId: 'golem' });
  dispatch(state, { type: 'SELECT_BIOME', biome: 'upper' });

  // Телепорт к подъёмнику — тестовая оснастка, а не игровая механика.
  state.mine!.player.x = state.mine!.exitX;
  state.mine!.player.y = state.mine!.exitY;
  dispatch(state, { type: 'INPUT', input: emptyInput() });
  tick(state);

  state.meta.backpack = { iron: 0, obsidian: 0, crystal: 0, bloodiron: 0, ...backpack };
  dispatch(state, { type: 'LEAVE_MINE' });
  return state;
}

// ---------------------------------------------------------------------------

console.log('Проверка тупиков в забеге');
console.log('');

// 1. Ровно тот случай, на котором сломался плейтест.
{
  const state = atForge({ iron: 2, obsidian: 4 });
  check('вышел из шахты с горстью руды — попал в кузницу', state.phase === 'forge');
  check('ковать действительно нечего', !canForgeAnything(state.meta));

  dispatch(state, { type: 'RETURN_TO_MINE' });
  check('можно спуститься ещё раз', state.phase === 'biomeSelect', `фаза: ${state.phase}`);

  dispatch(state, { type: 'SELECT_BIOME', biome: 'volcanic' });
  check('новая шахта сгенерирована', state.phase === 'mine' && (state.mine?.ore.length ?? 0) > 0);
  check('рюкзак не потерялся', state.meta.backpack.obsidian === 4);
}

// 2. Полный рюкзак, в котором ни один материал не дотягивает до рецепта.
{
  const state = atForge({ iron: 5, obsidian: 5, crystal: 5, bloodiron: 5 });
  const cap = backpackCapacity(state.meta);
  check('рюкзак полон', backpackTotal(state.meta.backpack) >= cap, `${backpackTotal(state.meta.backpack)}/${cap}`);
  check('ни один материал не дотягивает до рецепта', !canForgeAnything(state.meta));

  // Курсор на строке основного материала — выбрасываем именно его.
  state.forge!.cursorRow = 1;
  const dropped = state.forge!.primary;
  dispatch(state, { type: 'DISCARD_SELECTED' });
  check(
    'выбранный материал выброшен, место освободилось',
    dropped !== null && state.meta.backpack[dropped] === 0 && backpackTotal(state.meta.backpack) < cap,
  );

  dispatch(state, { type: 'RETURN_TO_MINE' });
  dispatch(state, { type: 'SELECT_BIOME', biome: 'caverns' });
  check('после сброса можно идти добирать', state.phase === 'mine');
}

// 3. Обычный случай не должен пострадать: материала хватает — куём.
{
  const state = atForge({ iron: 20 });
  check('материала хватает', canForgeAnything(state.meta));
  dispatch(state, { type: 'FORGE_SET_PRIMARY', material: 'iron' });
  dispatch(state, { type: 'FORGE_SET_SECONDARY', material: null });
  dispatch(state, { type: 'FORGE_BEGIN' });
  check('ковка началась', state.forge?.stage === 'minigame');
  check('материал списан', state.meta.backpack.iron === 20 - RECIPE_PRIMARY);
}

// 4. В шахте нельзя набрать больше вместимости, но и застрять там нельзя:
//    выход открыт всегда, а рюкзак ограничивает только добычу.
{
  const state = atForge({ iron: 0 });
  dispatch(state, { type: 'RETURN_TO_MINE' });
  dispatch(state, { type: 'SELECT_BIOME', biome: 'upper' });
  const mine = state.mine!;
  const reachableOre = mine.ore.length;
  check(
    'в шахте достаточно руды на рецепт',
    reachableOre * MINE.oreAmount >= RECIPE_PRIMARY,
    `жил: ${reachableOre}`,
  );
}

console.log('');
if (failures > 0) {
  console.log(`ПРОВАЛ: ${failures}`);
  process.exit(1);
}
console.log('Тупиков нет.');
