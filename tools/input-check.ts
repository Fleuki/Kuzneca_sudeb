/**
 * Проверка отзывчивости управления.
 *
 * Второй плейтест дал жалобу «кнопки не всегда работают». Причин оказалось две,
 * и обе — настоящие ошибки, а не промахи пальцем:
 *
 *  - удар читался по фронту нажатия, поэтому зажатая кнопка кирки била ровно
 *    один раз и дальше молчала;
 *  - короткий тап по прыжку давал подскок в 59 px при ступеньке в шахте в 72 px:
 *    палец успевал оторваться до вершины, и включалось гашение высоты.
 *
 * Здесь проверяется, что нажатие даёт ожидаемый результат: тап поднимает
 * на полную высоту, удержание бьёт повторно, а осознанное короткое нажатие
 * с клавиатуры по-прежнему даёт низкий прыжок — управление высотой не потеряно.
 *
 * Запуск: npm run input-check
 */

import { DT, MINE, PLAYER, TILE } from '../src/core/constants.ts';
import { emptyInput } from '../src/core/types.ts';
import type { GameState, InputState } from '../src/core/types.ts';
import { dispatch, tick } from '../src/sim/game.ts';
import { createGameState } from '../src/sim/state.ts';

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
  else {
    failures += 1;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Забег, доведённый до шахты. */
function inMine(): GameState {
  const state = createGameState(77);
  dispatch(state, { type: 'START_RUN' });
  dispatch(state, { type: 'SELECT_BOSS', bossId: 'golem' });
  dispatch(state, { type: 'SELECT_BIOME', biome: 'upper' });
  // Даём приземлиться, чтобы прыжок считался от твёрдой опоры.
  for (let i = 0; i < 30; i++) {
    dispatch(state, { type: 'INPUT', input: emptyInput() });
    tick(state);
  }
  return state;
}

/** Максимальная высота подъёма при заданном сценарии удержания прыжка. */
function jumpHeight(holdSeconds: number): number {
  const state = inMine();
  const p = state.mine!.player;
  const startY = p.y;
  let peak = 0;
  const holdTicks = Math.round(holdSeconds / DT);

  for (let i = 0; i < 120; i++) {
    const input: InputState = emptyInput();
    input.jump = i < holdTicks;
    input.jumpPressed = i === 0;
    dispatch(state, { type: 'INPUT', input });
    tick(state);
    peak = Math.max(peak, startY - state.mine!.player.y);
    if (i > 2 && state.mine!.player.onGround) break;
  }
  return peak;
}

console.log('Проверка отзывчивости управления');
console.log('');

// --- Прыжок -----------------------------------------------------------------
{
  const full = jumpHeight(1.0);
  const stepPx = 3 * TILE;
  check('удержание даёт полный прыжок', full >= stepPx + 10, `${full.toFixed(0)} px, ступенька ${stepPx} px`);

  // Так ведёт себя экранная кнопка: тап удерживается до вершины.
  const touch = jumpHeight(PLAYER.touchJumpHold);
  check(
    'тап по экранной кнопке берёт ступеньку в шахте',
    touch >= stepPx + 5,
    `${touch.toFixed(0)} px, ступенька ${stepPx} px`,
  );

  // Инвариант: удержание должно перекрывать подъём до вершины, иначе гашение
  // срежет прыжок раньше времени и ступенька снова станет непроходимой.
  const timeToApex = PLAYER.jumpVelocity / PLAYER.gravity;
  check(
    'удержание тапа перекрывает подъём до вершины',
    PLAYER.touchJumpHold >= timeToApex,
    `${PLAYER.touchJumpHold} с против ${timeToApex.toFixed(3)} с`,
  );

  // Управление высотой не должно пропасть: осознанно короткое нажатие
  // с клавиатуры всё ещё даёт прыжок ниже полного.
  const short = jumpHeight(PLAYER.jumpMinHold);
  check('короткое нажатие даёт прыжок ниже полного', short < full - 15, `${short.toFixed(0)} px против ${full.toFixed(0)} px`);
  check('но не микроподскок', short > 40, `${short.toFixed(0)} px`);
}

// --- Удар -------------------------------------------------------------------
{
  const state = inMine();
  // Ставим жилу вплотную к игроку, чтобы удары гарантированно попадали.
  const p = state.mine!.player;
  state.mine!.ore = [
    { id: 1, x: p.x + 20, y: p.y - PLAYER.h / 2, material: 'iron', hp: 999, amount: 2, mined: false, hitFlash: 0 },
  ];

  let swings = 0;
  let lastCooldown = 0;
  const seconds = 2;
  for (let i = 0; i < seconds / DT; i++) {
    const input = emptyInput();
    input.attack = true;              // палец лежит на кнопке и не отрывается
    input.attackPressed = i === 0;
    dispatch(state, { type: 'INPUT', input });
    tick(state);
    const cd = state.mine!.player.swingCooldown;
    if (cd > lastCooldown) swings += 1;
    lastCooldown = cd;
  }

  const expected = Math.floor(seconds / MINE.pickCooldown);
  check(
    'зажатая кирка бьёт повторно',
    swings >= expected - 1,
    `${swings} ударов за ${seconds} с, ожидалось около ${expected}`,
  );
}

console.log('');
if (failures > 0) {
  console.log(`ПРОВАЛ: ${failures}`);
  process.exit(1);
}
console.log('Управление отзывается как надо.');
