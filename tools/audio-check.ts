/**
 * Проверка звукового слоя — без браузера и без Web Audio.
 *
 * Проверяется не то, как звучит удар (это дело ушей), а то, что реактор
 * правильно читает состояние: сравнивает кадры и превращает разницу в события.
 * Ошибки здесь тихие и потому противные — звук просто перестаёт появляться
 * или, наоборот, начинает трещать каждый кадр, и в коде это не видно.
 *
 * Заодно это проверка главного архитектурного правила: симуляция про звук
 * не знает ничего, и весь слой можно снести, ничего не сломав.
 *
 * Запуск: npm run audio-check
 */

import { DT, PLAYER } from '../src/core/constants.ts';
import { emptyInput } from '../src/core/types.ts';
import type { GameState } from '../src/core/types.ts';
import { AudioReactor } from '../src/audio/reactor.ts';
import type { AmbientName, Sfx, SfxName } from '../src/audio/sfx.ts';
import { createCombat, stepCombat } from '../src/sim/combat/step.ts';
import { buildWeapon } from '../src/sim/forge/weapon.ts';
import { dispatch, tick } from '../src/sim/game.ts';
import { createGameState } from '../src/sim/state.ts';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Подставной синтезатор: записывает, что попросили сыграть. */
class FakeSfx {
  played: SfxName[] = [];
  ambient: AmbientName = 'none';
  ambientSwitches = 0;

  play(name: SfxName): void {
    this.played.push(name);
  }

  setAmbient(name: AmbientName): void {
    if (this.ambient === name) return;
    this.ambient = name;
    this.ambientSwitches += 1;
  }

  clear(): void {
    this.played = [];
  }

  count(name: SfxName): number {
    return this.played.filter((n) => n === name).length;
  }
}

const fake = new FakeSfx();
// Реактор знает только про две функции — этого хватает, чтобы подменить синтез.
const reactor = new AudioReactor(fake as unknown as Sfx);

console.log('Проверка звукового слоя');
console.log('');

// --- Фон по фазам -----------------------------------------------------------
{
  const state = createGameState(7);
  reactor.update(state);
  check('в меню играет фон меню', fake.ambient === 'menu');

  dispatch(state, { type: 'START_RUN' });
  dispatch(state, { type: 'SELECT_BOSS', bossId: 'golem' });
  dispatch(state, { type: 'SELECT_BIOME', biome: 'upper' });
  reactor.update(state);
  check('в шахте — фон шахты', fake.ambient === 'mine');

  const switches = fake.ambientSwitches;
  reactor.update(state);
  reactor.update(state);
  check('и он не перезапускается каждый кадр', fake.ambientSwitches === switches);
}

// --- Удары в шахте ----------------------------------------------------------
{
  const state = createGameState(1234);
  dispatch(state, { type: 'START_RUN' });
  dispatch(state, { type: 'SELECT_BOSS', bossId: 'golem' });
  dispatch(state, { type: 'SELECT_BIOME', biome: 'upper' });
  const mine = state.mine!;

  // Ставим игрока вплотную к обычной жиле и бьём в ритм.
  const ore = mine.ore.find((o) => o.size === 'vein')!;
  mine.player.x = ore.x - 18;
  mine.player.y = ore.y + PLAYER.h / 2;
  mine.player.facing = 1;

  fake.clear();
  for (let i = 0; i < 60; i++) {
    const input = emptyInput();
    input.attack = true;
    input.attackPressed = i === 0;
    mine.player.x = ore.x - 18;
    mine.player.y = ore.y + PLAYER.h / 2;
    dispatch(state, { type: 'INPUT', input });
    tick(state);
    reactor.update(state);
  }

  check('удар киркой звучит', fake.count('pick') > 0, `${fake.count('pick')} раз`);
  check('и разрушение жилы тоже', fake.count('oreBreak') + fake.count('oreSweet') > 0);
  check(
    'звуков не больше, чем ударов',
    fake.played.length <= 12,
    `${fake.played.length} звуков за 60 тиков`,
  );
}

// --- Бой --------------------------------------------------------------------
{
  const state: GameState = createGameState(99);
  state.run = {
    seed: 99,
    bossId: 'golem',
    biome: null,
    hp: PLAYER.hpMax,
    hpMax: PLAYER.hpMax,
    weapon: buildWeapon('light', 'steel', null, { damage: 1, durability: 1, speed: 1 }, 1, []),
    offered: ['golem'],
  };
  state.phase = 'combat';
  state.combat = createCombat(state);
  const combat = state.combat;

  combat.player.x = combat.boss.x - combat.boss.w / 2 - 30;
  combat.player.facing = 1;

  fake.clear();
  const input = emptyInput();
  input.attack = true;
  input.attackPressed = true;
  dispatch(state, { type: 'INPUT', input });
  stepCombat(state, DT);
  reactor.update(state);
  check('попадание по боссу звучит', fake.count('hit') === 1, `${fake.count('hit')}`);

  // Отметка живёт 0.35 с — и всё это время не должна звучать заново.
  fake.clear();
  for (let i = 0; i < 20; i++) {
    dispatch(state, { type: 'INPUT', input: emptyInput() });
    stepCombat(state, DT);
    reactor.update(state);
  }
  check('но не повторяется, пока искры не погасли', fake.count('hit') === 0);

  // Отскок от удара вниз.
  const p = combat.player;
  p.attackCooldown = 0;
  p.x = combat.boss.x;
  p.y = combat.boss.y - combat.boss.h + 10;
  p.onGround = false;
  p.vy = 200;
  combat.freeze = 0;
  fake.clear();
  const down = emptyInput();
  down.attack = true;
  down.attackPressed = true;
  down.down = true;
  dispatch(state, { type: 'INPUT', input: down });
  stepCombat(state, DT);
  reactor.update(state);
  check('отскок звучит отдельно от обычного удара', fake.count('pogo') === 1);
}

// --- Кузница ----------------------------------------------------------------
{
  const state = createGameState(4242);
  dispatch(state, { type: 'START_RUN' });
  dispatch(state, { type: 'SELECT_BOSS', bossId: 'golem' });
  dispatch(state, { type: 'SELECT_BIOME', biome: 'upper' });
  state.mine!.player.x = state.mine!.exitX;
  state.mine!.player.y = state.mine!.exitY;
  dispatch(state, { type: 'INPUT', input: emptyInput() });
  tick(state);
  state.meta.backpack.iron_ore = 8;
  dispatch(state, { type: 'LEAVE_MINE' });
  reactor.update(state);

  fake.clear();
  dispatch(state, { type: 'CRAFT_PICK', item: 'iron_ore' });
  dispatch(state, { type: 'CRAFT_PICK', item: 'iron_ore' });
  dispatch(state, { type: 'CRAFT_COMBINE' });
  reactor.update(state);
  check('первое соединение звучит как находка', fake.count('unlock') === 1, fake.played.join(', '));

  fake.clear();
  dispatch(state, { type: 'CRAFT_COMBINE' });
  reactor.update(state);
  check('повторное — как обычный крафт', fake.count('craft') === 1 && fake.count('unlock') === 0);

  // Мини-игра: каждый удар молотом должен дать ровно один звук.
  dispatch(state, { type: 'FORGE_TAB', tab: 'assemble' });
  dispatch(state, { type: 'FORGE_SET_BASE', item: 'iron_bar' });
  dispatch(state, { type: 'FORGE_BEGIN' });
  fake.clear();
  dispatch(state, { type: 'FORGE_STRIKE' });
  reactor.update(state);
  const forgeSounds = fake.played.filter((n) => n.startsWith('forge')).length;
  check('удар молотом звучит ровно один раз', forgeSounds === 1, fake.played.join(', '));

  fake.clear();
  for (let i = 0; i < 10; i++) {
    tick(state);
    reactor.update(state);
  }
  check(
    'и не тянется, пока держится вспышка',
    fake.played.filter((n) => n.startsWith('forge')).length === 0,
  );
}

console.log('');
if (failures > 0) {
  console.log(`ПРОВАЛ: ${failures}`);
  process.exit(1);
}
console.log('Звук читает состояние верно.');
