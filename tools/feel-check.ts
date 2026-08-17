/**
 * Проверка ощущения удара.
 *
 * Заморозка кадра, отдача, отскок и отбрасывание — единственные вещи в игре,
 * которые делаются «на ощупь». Ощупь плохо переживает правки: любое изменение
 * чисел легко превращает удар либо в вату, либо в рваный слайд-шоу-бой,
 * и заметить это по коду нельзя.
 *
 * Здесь проверяется то, что можно измерить: что попадание вообще замораживает
 * кадр и оставляет отметку для искр, что заморозка останавливает бой целиком,
 * что удар вниз в воздухе отскакивает, а боковой — нет, и что суммарная
 * заморозка не съедает бой.
 *
 * Запуск: npm run feel-check
 */

import { ARENA, DT, FEEL, PLAYER } from '../src/core/constants.ts';
import { emptyInput } from '../src/core/types.ts';
import type { CombatState, GameState, InputState } from '../src/core/types.ts';
import { createCombat, stepCombat } from '../src/sim/combat/step.ts';
import { buildWeapon } from '../src/sim/forge/weapon.ts';
import { dispatch, tick } from '../src/sim/game.ts';
import { createGameState } from '../src/sim/state.ts';
import { botInput, createBotMemory } from './bot.ts';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Бой с готовым оружием, без прохождения шахты и ковки. */
function fight(shape: 'heavy' | 'light' = 'light', seed = 99): GameState {
  const state = createGameState(seed);
  state.run = {
    seed,
    bossId: 'golem',
    biome: null,
    hp: PLAYER.hpMax,
    hpMax: PLAYER.hpMax,
    weapon: buildWeapon(shape, 'steel', null, { damage: 1, durability: 1, speed: 1 }, 1, []),
    offered: ['golem'],
  };
  state.phase = 'combat';
  state.combat = createCombat(state);
  return state;
}

function step(state: GameState, input: InputState = emptyInput()): void {
  dispatch(state, { type: 'INPUT', input });
  stepCombat(state, DT);
}

/** Ставит игрока вплотную к боссу — иначе замах уйдёт в пустоту. */
function standAtBoss(combat: CombatState, offset = 40): void {
  const boss = combat.boss;
  combat.player.x = boss.x - boss.w / 2 - offset;
  combat.player.px = combat.player.x;
  combat.player.facing = 1;
}

console.log('Проверка ощущения удара');
console.log('');

// --- Заморозка кадра --------------------------------------------------------
{
  const state = fight();
  const combat = state.combat!;
  standAtBoss(combat);

  const input = emptyInput();
  input.attack = true;
  input.attackPressed = true;
  step(state, input);

  check('попадание замораживает кадр', combat.freeze > 0, `${(combat.freeze * 1000).toFixed(0)} мс`);
  check('и оставляет отметку для искр', combat.impacts.length === 1);
  check(
    'заморозка не длиннее допустимой',
    combat.freeze <= FEEL.hitstopMax + 1e-6,
    `${(combat.freeze * 1000).toFixed(0)} мс при пределе ${(FEEL.hitstopMax * 1000).toFixed(0)}`,
  );

  // Во время заморозки бой стоит целиком: и босс, и перезарядки, и телеграфы.
  const bossX = combat.boss.x;
  const bossStage = combat.boss.stage;
  const cooldown = combat.player.attackCooldown;
  const elapsed = combat.elapsed;
  step(state);

  check('на заморозке босс не двигается', combat.boss.x === bossX);
  check('и не переключает стадию атаки', combat.boss.stage === bossStage);
  check('перезарядка удара стоит', combat.player.attackCooldown === cooldown);
  check('и время боя не идёт', combat.elapsed === elapsed);

  // Искры при этом продолжают гаснуть: застывшая вспышка выглядит зависанием.
  check('но искры гаснут', combat.impacts[0].life < FEEL.impactLife);
}

// --- Отскок от удара вниз ---------------------------------------------------
{
  const state = fight();
  const combat = state.combat!;
  const p = combat.player;
  standAtBoss(combat, 20);
  // Подвешиваем игрока над боссом: удар вниз должен во что-то попасть.
  p.y = combat.boss.y - combat.boss.h + 10;
  p.py = p.y;
  p.x = combat.boss.x;
  p.px = p.x;
  p.onGround = false;
  p.vy = 200;

  const input = emptyInput();
  input.attack = true;
  input.attackPressed = true;
  input.down = true;
  step(state, input);

  check('удар вниз в воздухе отскакивает', p.vy < 0, `vy = ${p.vy.toFixed(0)}`);
  check('отскок поднимает не слабее прыжка', Math.abs(p.vy) >= PLAYER.jumpVelocity * 0.8);
  check('и возвращает рывок', p.dashCooldown === 0);
  check('отскок помечен отдельной отметкой', combat.impacts.some((im) => im.kind === 'pogo'));
}

// --- Отдача от бокового удара -----------------------------------------------
{
  const state = fight('heavy');
  const combat = state.combat!;
  const p = combat.player;
  standAtBoss(combat);
  p.vx = 0;

  const input = emptyInput();
  input.attack = true;
  input.attackPressed = true;
  step(state, input);

  check('боковой удар отталкивает бьющего назад', p.vx < 0, `vx = ${p.vx.toFixed(0)}`);
  check('но не подбрасывает', p.vy >= 0);
}

// --- Снаряды сбиваются только ударом вниз -----------------------------------
{
  const state = fight();
  const combat = state.combat!;
  const p = combat.player;

  function addRock(): void {
    combat.hazards.push({
      id: combat.nextEntityId++,
      kind: 'rock',
      x: p.x,
      y: p.y - 4,
      px: p.x,
      py: p.y - 4,
      vx: 0,
      vy: 0,
      w: 26,
      h: 26,
      damage: 20,
      telegraph: 0,
      life: 5,
      spent: false,
      gravity: 0,
    });
  }

  p.onGround = false;
  p.vy = 100;
  addRock();
  const side = emptyInput();
  side.attack = true;
  side.attackPressed = true;
  step(state, side);
  check('боковой удар снаряд не сбивает', combat.hazards.length === 1);

  // Тот же камень, но теперь игрок висит над ним и бьёт вниз.
  // Перезарядку снимаем руками: ждать её тиками — значит уронить игрока на пол,
  // а на полу удар вниз по замыслу превращается в боковой.
  p.attackCooldown = 0;
  // Камень успел зацепить игрока — снимаем заморозку и неуязвимость,
  // проверяем именно отскок, а не последствия пропущенного удара.
  combat.freeze = 0;
  p.invuln = 0;
  p.vx = 0;
  p.y = ARENA.groundY - 120;
  p.py = p.y;
  p.vy = 80;
  p.onGround = false;
  combat.hazards[0].x = p.x;
  combat.hazards[0].y = p.y + 20;
  combat.hazards[0].spent = false;

  const down = emptyInput();
  down.attack = true;
  down.attackPressed = true;
  down.down = true;
  step(state, down);
  check('удар вниз сбивает снаряд', combat.hazards.length === 0);
  check('и отскакивает от него', combat.player.vy < 0, `vy = ${combat.player.vy.toFixed(0)}`);
}

// --- Отбрасывание при уроне -------------------------------------------------
{
  const state = fight();
  const combat = state.combat!;
  const p = combat.player;
  p.x = ARENA.left + PLAYER.w / 2 + 4;
  p.px = p.x;

  combat.hazards.push({
    id: combat.nextEntityId++,
    kind: 'wave',
    x: p.x + 40,
    y: p.y,
    px: p.x + 40,
    py: p.y,
    vx: -200,
    vy: 0,
    w: 60,
    h: 40,
    damage: 20,
    telegraph: 0,
    life: 2,
    spent: false,
    gravity: 0,
  });

  step(state);
  check('пропущенный удар отбрасывает от источника', p.vx < 0, `vx = ${p.vx.toFixed(0)}`);
  check('и замораживает кадр сильнее своего удара', combat.freeze >= FEEL.hitstopHurt - 1e-6);

  // Отбрасывание не должно выносить за пределы арены.
  for (let i = 0; i < 60; i++) step(state);
  check(
    'отбрасывание не выносит за стену',
    p.x >= ARENA.left + PLAYER.w / 2 - 1e-6 && p.x <= ARENA.right - PLAYER.w / 2 + 1e-6,
    `x = ${p.x.toFixed(0)}`,
  );
}

// --- Доля заморозки в бою ---------------------------------------------------
{
  // Полный бой ботом: заморозка не должна съедать заметную часть боя,
  // иначе вместо веса удара получится рваный бой.
  const state = fight('light', 4242);
  const mem = createBotMemory();
  let frozenTicks = 0;
  let ticks = 0;

  while (state.phase === 'combat' && ticks < 60 * 150) {
    const combat = state.combat!;
    if (combat.freeze > 0) frozenTicks += 1;
    const w = state.run?.weapon ?? null;
    dispatch(state, { type: 'INPUT', input: botInput(combat, w && w.durability > 0 ? w : null, mem) });
    tick(state);
    ticks += 1;
  }

  const share = frozenTicks / Math.max(1, ticks);
  check(
    'заморозка занимает разумную долю боя',
    share > 0.005 && share < 0.15,
    `${(share * 100).toFixed(1)}% кадров`,
  );
}

console.log('');
if (failures > 0) {
  console.log(`ПРОВАЛ: ${failures}`);
  process.exit(1);
}
console.log('Удар ощущается как удар.');
