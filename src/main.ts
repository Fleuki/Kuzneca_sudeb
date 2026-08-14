/**
 * Точка входа и игровой цикл.
 *
 * §11: симуляция идёт фиксированным шагом 60 Гц с накопителем, рендер
 * интерполирует между тиками. Всё, что меняет состояние, проходит через
 * dispatch — включая ввод.
 */

import { DT, MAX_FRAME_TIME } from './core/constants.ts';
import { dispatch, tick } from './sim/game.ts';
import { createGameState } from './sim/state.ts';
import type { GameState, Phase } from './core/types.ts';
import { Keyboard } from './input/keyboard.ts';
import { TouchControls, mergeInput } from './input/touch.ts';
import { loadGame, saveGame } from './persist/save.ts';
import { createViewport } from './render/app.ts';
import { Renderer } from './render/renderer.ts';
import { setTouchMode } from './render/uiMode.ts';

/** Как часто перезаписывать сейв во время игры, в секундах. */
const AUTOSAVE_INTERVAL = 5;

async function main(): Promise<void> {
  const mount = document.getElementById('game');
  if (!mount) throw new Error('Не найден контейнер #game');

  const { app, root, toLogical } = await createViewport(mount);
  const renderer = new Renderer(root);

  // Продолжаем прерванный забег, если он был: §2 требует возможности
  // закрыть вкладку после добычи и вернуться к ковке позже.
  const state: GameState = loadGame() ?? createGameState(Date.now() >>> 0);

  const keyboard = new Keyboard();
  keyboard.attach();

  // Сенсорный слой отдаёт то же самое, что и клавиатура: InputState и команды.
  const touch = new TouchControls({
    toLogical,
    regions: () => renderer.hitRegions(state),
  });
  touch.mount(mount);

  let accumulator = 0;
  let last = performance.now() / 1000;
  let time = 0;
  let sinceSave = 0;
  let lastPhase: Phase = state.phase;

  app.ticker.add(() => {
    const now = performance.now() / 1000;
    let frame = now - last;
    last = now;
    time = now;

    // Ограничение сверху: после переключения вкладки не досимулировать минуты.
    if (frame > MAX_FRAME_TIME) frame = MAX_FRAME_TIME;
    accumulator += frame;

    // Команды меню — до симуляции, чтобы смена фазы применилась в этом же кадре.
    for (const cmd of keyboard.drainCommands(state.phase)) dispatch(state, cmd);
    for (const cmd of touch.drainCommands(state.phase)) dispatch(state, cmd);
    dispatch(state, { type: 'INPUT', input: mergeInput(keyboard.snapshot(), touch.snapshot()) });

    let ticks = 0;
    while (accumulator >= DT && ticks < 8) {
      tick(state);
      accumulator -= DT;
      ticks += 1;
    }

    // Фронты нажатий съедаются, только если тик реально прошёл, —
    // иначе нажатие потерялось бы в пропущенном кадре.
    if (ticks > 0) {
      keyboard.consumeEdges();
      touch.consumeEdges();
    }

    // Режим ввода выставляем до отрисовки: от него зависят подсказки на экране.
    setTouchMode(touch.enabled);

    const alpha = accumulator / DT;
    renderer.render(state, alpha, time);
    // Набор экранных кнопок зависит от фазы, поэтому обновляем его каждый кадр.
    touch.update(state);

    // Сохранение: на каждом переходе фазы и раз в несколько секунд.
    sinceSave += frame;
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      sinceSave = 0;
      saveGame(state);
    } else if (sinceSave >= AUTOSAVE_INTERVAL) {
      sinceSave = 0;
      saveGame(state);
    }
  });

  // Вкладку могут закрыть в любой момент — не теряем прогресс.
  window.addEventListener('beforeunload', () => saveGame(state));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveGame(state);
  });

  document.getElementById('boot')?.classList.add('hidden');
}

main().catch((err) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Не удалось запустить игру — смотри консоль';
});
