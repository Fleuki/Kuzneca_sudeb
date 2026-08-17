/**
 * Наблюдатель состояния, который издаёт звуки.
 *
 * Симуляция не знает про звук ровно так же, как не знает про PixiJS (§11):
 * событий она не рассылает, а хранит следы произошедшего — отметки попаданий,
 * вспышки на руде, список результатов ковки. Реактор сравнивает состояние
 * с прошлым кадром и превращает разницу в звук. Тот же приём, которым рендер
 * подбрасывает искры.
 *
 * За счёт этого звук можно выключить целиком, и на игре это никак не скажется:
 * ни один тик не зависит от того, слышит игрок удар или нет.
 */

import type { GameState, Phase } from '../core/types.ts';
import type { AmbientName, Sfx } from './sfx.ts';

export class AudioReactor {
  private lastPhase: Phase | null = null;
  private lastImpact = 0;
  private oreFlash = new Map<number, number>();
  private lastSweetStreak = 0;
  private lastForgeResults = 0;
  private lastKnown = 0;
  private lastCraftCount = 0;
  private lastMenuCursor = 0;

  private sfx: Sfx;

  constructor(sfx: Sfx) {
    this.sfx = sfx;
  }

  /** Вызывается раз в кадр после отрисовки. */
  update(state: GameState): void {
    this.updateAmbient(state);
    this.updateCombat(state);
    this.updateMine(state);
    this.updateForge(state);
    this.updateMenu(state);
    this.lastPhase = state.phase;
  }

  // -------------------------------------------------------------------------

  private updateAmbient(state: GameState): void {
    const wanted: AmbientName =
      state.phase === 'mine' ? 'mine' : state.phase === 'combat' ? 'combat' : 'menu';
    this.sfx.setAmbient(wanted);
  }

  private updateCombat(state: GameState): void {
    const combat = state.combat;
    if (!combat) return;

    // Отметки попаданий приходят с растущими id — по ним и понятно, что новое.
    for (const im of combat.impacts) {
      if (im.id <= this.lastImpact) continue;
      this.lastImpact = im.id;

      if (im.kind === 'hurt') this.sfx.play('hurt', im.power);
      else if (im.kind === 'pogo') this.sfx.play('pogo');
      else if (im.kind === 'break') this.sfx.play('weaponBreak');
      else this.sfx.play('hit', im.power);
    }

    if (this.lastPhase === 'combat' && state.phase === 'result') {
      this.sfx.play(state.result?.won ? 'win' : 'lose');
    }
  }

  private updateMine(state: GameState): void {
    const mine = state.mine;
    if (!mine) {
      this.oreFlash.clear();
      this.lastSweetStreak = 0;
      return;
    }

    let brokeThisFrame: { sweet: boolean; nugget: boolean } | null = null;

    for (const ore of mine.ore) {
      const prev = this.oreFlash.get(ore.id) ?? 0;
      // Рост вспышки — это и есть «кирка попала»: симуляция ставит её ровно
      // в момент удара.
      if (ore.hitFlash > prev + 1e-6) {
        if (ore.mined) brokeThisFrame = { sweet: false, nugget: ore.size === 'nugget' };
        else this.sfx.play('pick');
      }
      this.oreFlash.set(ore.id, ore.hitFlash);
    }

    if (brokeThisFrame) {
      // Точный скол виден по выросшей серии: её увеличивает только удар
      // в слабое место.
      const sweet = mine.sweetStreak > this.lastSweetStreak;
      if (brokeThisFrame.nugget) this.sfx.play('nugget');
      else if (sweet) this.sfx.play('oreSweet');
      else this.sfx.play('oreBreak');
    }

    this.lastSweetStreak = mine.sweetStreak;
  }

  private updateForge(state: GameState): void {
    const forge = state.forge;
    if (!forge) {
      this.lastForgeResults = 0;
      this.lastCraftCount = 0;
      this.lastKnown = state.meta.known.length;
      return;
    }

    if (forge.results.length > this.lastForgeResults) {
      const last = forge.results[forge.results.length - 1];
      this.sfx.play(
        last === 'perfect' ? 'forgePerfect' : last === 'good' ? 'forgeGood' : 'forgeMiss',
      );
    }
    this.lastForgeResults = forge.results.length;

    // Соединение на верстаке. Считаем по счётчику, а не по вспышке: два
    // одинаковых крафта подряд дают одну и ту же яркость вспышки.
    if (forge.craftCount > this.lastCraftCount) {
      // Новый узел дерева звучит иначе, чем повторное соединение: находку
      // надо отметить, повтор — нет.
      if (state.meta.known.length > this.lastKnown) this.sfx.play('unlock');
      else this.sfx.play('craft');
    }
    this.lastCraftCount = forge.craftCount;
    this.lastKnown = state.meta.known.length;
  }

  private updateMenu(state: GameState): void {
    if (state.phase === 'mine' || state.phase === 'combat') {
      this.lastMenuCursor = state.menuCursor;
      return;
    }

    if (state.menuCursor !== this.lastMenuCursor) {
      this.sfx.play('menuMove');
      this.lastMenuCursor = state.menuCursor;
    }

    // Смена экрана — подтверждение выбора.
    if (this.lastPhase !== null && this.lastPhase !== state.phase && state.phase !== 'result') {
      this.sfx.play('menuConfirm');
    }
  }
}
