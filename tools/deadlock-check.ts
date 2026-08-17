/**
 * Проверка, что игрока нельзя запереть.
 *
 * На первом плейтесте забег кончился так: игрок вышел из шахты с шестью
 * единицами руды, на рецепт нужно двенадцать, сковать нечего, а обратно в шахту
 * дороги не было. Экран ковки стал тупиком, из которого не выходило ничего,
 * кроме перезагрузки страницы.
 *
 * С деревом предметов тупиков стало меньше — почти любая пара руды соединяется
 * в слиток, — но появилась новая ловушка: рюкзак, набитый несоединяемыми
 * остатками. Здесь проверяется, что из каждого такого положения есть выход,
 * причём доступный прямо на текущем экране.
 *
 * Запуск: npm run deadlock-check
 */

import { MINE, WEAPON_BASE_COST } from '../src/core/constants.ts';
import type { ItemId } from '../src/core/items.ts';
import { emptyInput } from '../src/core/types.ts';
import type { GameState } from '../src/core/types.ts';
import { dispatch, tick } from '../src/sim/game.ts';
import {
  backpackCapacity,
  backpackTotal,
  canCraftAnything,
  canForgeAnything,
  createGameState,
  emptyInventory,
  forgeableItems,
} from '../src/sim/state.ts';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`✓ ${name}`);
  } else {
    failures += 1;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Доводит забег до кузницы с заданным содержимым рюкзака. */
function atForge(backpack: Partial<Record<ItemId, number>>): GameState {
  const state = createGameState(4242);
  dispatch(state, { type: 'START_RUN' });
  dispatch(state, { type: 'SELECT_BOSS', bossId: 'golem' });
  dispatch(state, { type: 'SELECT_BIOME', biome: 'upper' });

  // Телепорт к подъёмнику — тестовая оснастка, а не игровая механика.
  state.mine!.player.x = state.mine!.exitX;
  state.mine!.player.y = state.mine!.exitY;
  dispatch(state, { type: 'INPUT', input: emptyInput() });
  tick(state);

  state.meta.backpack = { ...emptyInventory(), ...backpack };
  dispatch(state, { type: 'LEAVE_MINE' });
  return state;
}

// ---------------------------------------------------------------------------

console.log('Проверка тупиков в забеге');
console.log('');

// 1. Ровно тот случай, на котором сломался плейтест: сырья слишком мало даже
//    на переплавку.
{
  const state = atForge({ iron_ore: 1, obsidian_ore: 1 });
  check('вышел из шахты с горстью руды — попал в кузницу', state.phase === 'forge');
  check('делать действительно нечего', !canForgeAnything(state.meta));

  dispatch(state, { type: 'RETURN_TO_MINE' });
  check('можно спуститься ещё раз', state.phase === 'biomeSelect', `фаза: ${state.phase}`);

  dispatch(state, { type: 'SELECT_BIOME', biome: 'volcanic' });
  check('новая шахта сгенерирована', state.phase === 'mine' && (state.mine?.ore.length ?? 0) > 0);
  check('рюкзак не потерялся', state.meta.backpack.obsidian_ore === 1);
}

// 2. Полный рюкзак сырья — это уже не тупик: дерево позволяет уплотнить его
//    прямо на верстаке, и место освобождается само.
{
  const state = atForge({ iron_ore: 5, obsidian_ore: 5, crystal_ore: 5, blood_ore: 5 });
  const cap = backpackCapacity(state.meta);
  const before = backpackTotal(state.meta.backpack);
  check('рюкзак полон', before >= cap, `${before}/${cap}`);
  check('ковать пока нечего', forgeableItems(state.meta.backpack).length === 0);
  check('но соединить есть что', canCraftAnything(state.meta.backpack));

  dispatch(state, { type: 'CRAFT_PICK', item: 'iron_ore' });
  dispatch(state, { type: 'CRAFT_PICK', item: 'iron_ore' });
  dispatch(state, { type: 'CRAFT_COMBINE' });
  check('две руды стали слитком', state.meta.backpack.iron_bar === 1);
  check(
    'место в рюкзаке освободилось',
    backpackTotal(state.meta.backpack) === before - 1,
    `${backpackTotal(state.meta.backpack)} против ${before}`,
  );
}

// 3. Полный рюкзак несоединяемых остатков: по одной штуке разных узлов, ни одной
//    пары и ни одной ковки. Выход — выбросить лишнее.
{
  const state = atForge({ doomcore: 1, dawnsteel: 1, iron_ore: 1 });
  // Уменьшать вместимость нельзя, поэтому набиваем рюкзак до края тем же сырьём.
  state.meta.backpack.iron_ore = backpackCapacity(state.meta) - 2;
  const cap = backpackCapacity(state.meta);
  check('рюкзак полон', backpackTotal(state.meta.backpack) >= cap);

  // Курсор на первой клетке сетки — там лежит сырьё.
  state.forge!.tab = 'craft';
  state.forge!.cursor = 0;
  dispatch(state, { type: 'DISCARD_SELECTED' });
  check(
    'выбранный предмет выброшен, место освободилось',
    backpackTotal(state.meta.backpack) < cap,
    `${backpackTotal(state.meta.backpack)}/${cap}`,
  );

  dispatch(state, { type: 'RETURN_TO_MINE' });
  dispatch(state, { type: 'SELECT_BIOME', biome: 'caverns' });
  check('после сброса можно идти добирать', state.phase === 'mine');
}

// 4. Обычный путь по дереву: 8 руды → 4 слитка → 2 стали → оружие.
{
  const state = atForge({ iron_ore: 8 });
  for (let i = 0; i < 4; i++) {
    dispatch(state, { type: 'CRAFT_PICK', item: 'iron_ore' });
    dispatch(state, { type: 'CRAFT_PICK', item: 'iron_ore' });
    dispatch(state, { type: 'CRAFT_COMBINE' });
    dispatch(state, { type: 'CRAFT_CLEAR' });
  }
  check('получилось четыре слитка', state.meta.backpack.iron_bar === 4, `${state.meta.backpack.iron_bar}`);

  for (let i = 0; i < 2; i++) {
    dispatch(state, { type: 'CRAFT_PICK', item: 'iron_bar' });
    dispatch(state, { type: 'CRAFT_PICK', item: 'iron_bar' });
    dispatch(state, { type: 'CRAFT_COMBINE' });
    dispatch(state, { type: 'CRAFT_CLEAR' });
  }
  check('и две стали', state.meta.backpack.steel === 2, `${state.meta.backpack.steel}`);
  check('открытые узлы записаны', state.meta.known.indexOf('steel') >= 0);

  dispatch(state, { type: 'FORGE_TAB', tab: 'assemble' });
  dispatch(state, { type: 'FORGE_SET_BASE', item: 'steel' });
  dispatch(state, { type: 'FORGE_SET_INLAY', item: null });
  dispatch(state, { type: 'FORGE_BEGIN' });
  check('ковка началась', state.forge?.stage === 'minigame', `стадия: ${state.forge?.stage}`);
  check('основа списана', state.meta.backpack.steel === 2 - WEAPON_BASE_COST);
}

// 5. Сырьё нельзя пустить в ковку напрямую — иначе дерево можно обойти.
{
  const state = atForge({ iron_ore: 20 });
  dispatch(state, { type: 'FORGE_TAB', tab: 'assemble' });
  dispatch(state, { type: 'FORGE_SET_BASE', item: 'iron_ore' });
  check('руда не становится основой', state.forge?.base !== 'iron_ore');
  dispatch(state, { type: 'FORGE_BEGIN' });
  check('и ковка из руды не начинается', state.forge?.stage === 'plan');
}

// 6. В шахте достаточно руды, чтобы дойти хотя бы до сплава второго уровня.
{
  const state = atForge({});
  dispatch(state, { type: 'RETURN_TO_MINE' });
  dispatch(state, { type: 'SELECT_BIOME', biome: 'upper' });
  const mine = state.mine!;
  // Сплав второго уровня стоит 4 сырья, оружие — 8.
  const needed = 8;
  check(
    'в шахте достаточно руды на оружие второго уровня',
    mine.ore.length * MINE.oreAmount >= needed,
    `жил: ${mine.ore.length}`,
  );
}

console.log('');
if (failures > 0) {
  console.log(`ПРОВАЛ: ${failures}`);
  process.exit(1);
}
console.log('Тупиков нет.');
