/**
 * Сенсорное управление.
 *
 * Живёт в DOM поверх канваса, а не внутри PixiJS: браузер сам разбирается
 * с мультитачем, а кнопки не участвуют в отрисовке игры и не могут её тормозить.
 *
 * Наружу отдаёт ровно то же, что и клавиатура: InputState и список команд.
 * Симуляция про существование телефона не знает (§11).
 *
 * Раскладка меняется по фазе: в шахте кирка и подъёмник, в бою рывок,
 * в меню кнопок нет вовсе — там тыкают прямо в карточки через hitRegions.
 */

import type { Command } from '../core/commands.ts';
import { PLAYER } from '../core/constants.ts';
import { emptyInput } from '../core/types.ts';
import type { GameState, InputState, Phase } from '../core/types.ts';
import { backpackCapacity, backpackTotal } from '../sim/state.ts';
import type { HitRegion } from '../render/scenes/scene.ts';

/** Запас вокруг кнопки, в котором касание всё ещё считается попаданием. */
const TOUCH_SLOP = 20;

/** Действия, которые удерживаются пальцем. */
type HoldAction = 'left' | 'right' | 'jump' | 'attack' | 'dash';

type ButtonId =
  | 'left'
  | 'right'
  | 'jump'
  | 'attack'
  | 'dash'
  | 'exit'
  | 'up'
  | 'down'
  | 'prev'
  | 'next'
  | 'ok'
  | 'back'
  | 'mine'
  | 'drop'
  | 'craft';

interface ButtonDef {
  id: ButtonId;
  label: string;
  /** Удерживаемое действие; если нет — кнопка одноразовая. */
  hold?: HoldAction;
  /** Команда, отправляемая при нажатии одноразовой кнопки. */
  tap?: Command;
  /** CSS-класс для расположения. */
  cls: string;
}

const BUTTONS: ButtonDef[] = [
  { id: 'left', label: '◀', hold: 'left', cls: 'kz-btn kz-move kz-left' },
  { id: 'right', label: '▶', hold: 'right', cls: 'kz-btn kz-move kz-right' },
  { id: 'jump', label: '▲', hold: 'jump', cls: 'kz-btn kz-act kz-jump' },
  { id: 'attack', label: '✦', hold: 'attack', cls: 'kz-btn kz-act kz-attack' },
  { id: 'dash', label: '»', hold: 'dash', cls: 'kz-btn kz-act kz-dash' },
  { id: 'exit', label: 'Наверх', tap: { type: 'LEAVE_MINE' }, cls: 'kz-btn kz-wide kz-exit' },
  { id: 'up', label: '▲', tap: { type: 'MENU_ROW', delta: -1 }, cls: 'kz-btn kz-nav kz-up' },
  { id: 'down', label: '▼', tap: { type: 'MENU_ROW', delta: 1 }, cls: 'kz-btn kz-nav kz-down' },
  { id: 'prev', label: '◀', tap: { type: 'MENU_MOVE', delta: -1 }, cls: 'kz-btn kz-nav kz-prev' },
  { id: 'next', label: '▶', tap: { type: 'MENU_MOVE', delta: 1 }, cls: 'kz-btn kz-nav kz-next' },
  { id: 'ok', label: 'Ковать', tap: { type: 'MENU_CONFIRM' }, cls: 'kz-btn kz-wide kz-ok' },
  { id: 'back', label: 'Назад', tap: { type: 'MENU_BACK' }, cls: 'kz-btn kz-small kz-back' },
  { id: 'mine', label: 'В шахту', tap: { type: 'RETURN_TO_MINE' }, cls: 'kz-btn kz-small kz-mine' },
  { id: 'drop', label: 'Выбросить', tap: { type: 'DISCARD_SELECTED' }, cls: 'kz-btn kz-small kz-drop' },
  { id: 'craft', label: 'Соединить', tap: { type: 'CRAFT_COMBINE' }, cls: 'kz-btn kz-wide kz-ok' },
];

/** Какие кнопки показывать и что на них написано в текущей фазе. */
function layoutFor(state: GameState): { visible: Set<ButtonId>; labels: Partial<Record<ButtonId, string>> } {
  const visible = new Set<ButtonId>();
  const labels: Partial<Record<ButtonId, string>> = {};

  switch (state.phase) {
    case 'mine':
      visible.add('left');
      visible.add('right');
      visible.add('jump');
      visible.add('attack');
      // Подъёмник появляется, только когда до него дошли, — как и подсказка на экране.
      if (state.mine?.atExit) visible.add('exit');
      labels.attack = '⛏';
      break;

    case 'combat':
      visible.add('left');
      visible.add('right');
      visible.add('jump');
      visible.add('attack');
      visible.add('dash');
      labels.attack = '⚔';
      break;

    case 'forge': {
      const stage = state.forge?.stage;
      if (stage === 'plan') {
        // Клетки рюкзака и строки рецепта тапаются напрямую — экранные стрелки
        // только загораживали бы карточку. Кнопками остаются действия.
        if (state.forge?.tab === 'craft') {
          visible.add('craft');
        } else {
          visible.add('ok');
          labels.ok = 'Ковать';
        }
        visible.add('mine');
        // «Выбросить» нужно только когда рюкзак полон: иначе место ещё есть.
        if (backpackTotal(state.meta.backpack) >= backpackCapacity(state.meta)) visible.add('drop');
      } else if (stage === 'minigame') {
        visible.add('ok');
        labels.ok = 'Удар';
      } else {
        visible.add('ok');
        labels.ok = 'На арену';
      }
      break;
    }

    case 'biomeSelect':
    case 'upgrades':
      visible.add('back');
      break;

    default:
      // menu, bossSelect, result — тыкают прямо в карточки.
      break;
  }

  return { visible, labels };
}

export interface TouchDeps {
  /** Перевод координат касания в логические 960×540. */
  toLogical(clientX: number, clientY: number): { x: number; y: number };
  /** Области текущего экрана. */
  regions(): HitRegion[];
}

export class TouchControls {
  readonly root: HTMLDivElement;
  private tapLayer: HTMLDivElement;
  private pads: HTMLDivElement;
  private elements = new Map<ButtonId, HTMLDivElement>();

  /** Активные касания: id → кнопка под пальцем (или null). */
  private touches = new Map<number, ButtonId | null>();
  private held = new Set<HoldAction>();
  private edges = new Set<HoldAction>();
  /** До какого момента прыжок считается зажатым, даже если палец уже убрали. */
  private jumpHeldUntil = 0;
  private queue: Command[] = [];
  private visible = new Set<ButtonId>();
  private active = false;
  private deps: TouchDeps;

  constructor(deps: TouchDeps) {
    this.deps = deps;
    this.root = document.createElement('div');
    this.root.className = 'kz-touch';

    this.tapLayer = document.createElement('div');
    this.tapLayer.className = 'kz-tap';
    this.root.appendChild(this.tapLayer);

    this.pads = document.createElement('div');
    this.pads.className = 'kz-pads';
    // Кнопки прячем до первого касания: на десктопе они только мешали бы.
    this.pads.hidden = true;
    this.root.appendChild(this.pads);

    for (const def of BUTTONS) {
      const el = document.createElement('div');
      el.className = def.cls;
      el.textContent = def.label;
      el.hidden = true;
      this.pads.appendChild(el);
      this.elements.set(def.id, el);
    }

    // Слушаем на окне, а не на самих кнопках: палец может начать движение мимо
    // кнопки и съехать на неё, и это должно считаться нажатием.
    window.addEventListener('touchstart', this.onTouchStart, { passive: false });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onTouchEnd);
    window.addEventListener('touchcancel', this.onTouchEnd);

    // Тап мимо кнопок — это выбор пункта на экране.
    //
    // Касание обрабатывается по touchend напрямую, а не по синтезированному click:
    // браузер выдаёт click с задержкой, а в мини-игре ковки тап должен попадать
    // ровно в тот момент, когда бегунок в зоне. click остаётся только для мыши
    // и подавляется после настоящего касания, иначе тап сработал бы дважды.
    this.tapLayer.addEventListener('touchstart', this.onTapStart, { passive: true });
    this.tapLayer.addEventListener('touchend', this.onTapEnd);
    this.tapLayer.addEventListener('click', this.onClick);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    // На устройстве с грубым указателем показываем сразу; на десктопе — только
    // если человек действительно коснулся экрана (бывают гибриды).
    if (window.matchMedia('(pointer: coarse)').matches) this.enable();
    window.addEventListener('touchstart', this.enableOnce, { passive: true });
  }

  private enableOnce = (): void => {
    this.enable();
    window.removeEventListener('touchstart', this.enableOnce);
  };

  private enable(): void {
    if (this.active) return;
    this.active = true;
    this.pads.hidden = false;
  }

  get enabled(): boolean {
    return this.active;
  }

  // -------------------------------------------------------------------------
  // Касания
  // -------------------------------------------------------------------------

  /**
   * Кнопка под касанием.
   *
   * Вокруг каждой кнопки есть запас: попасть точно в круг пальцем, не глядя на
   * экран, невозможно. Из-за запаса зоны соседних кнопок пересекаются, поэтому
   * выбирается не первая подходящая, а ближайшая по центру — иначе на границе
   * срабатывала бы та, что раньше в списке.
   */
  private buttonAt(x: number, y: number): ButtonId | null {
    let best: ButtonId | null = null;
    let bestDist = Infinity;

    for (const [id, el] of this.elements) {
      if (el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left - TOUCH_SLOP || x > r.right + TOUCH_SLOP) continue;
      if (y < r.top - TOUCH_SLOP || y > r.bottom + TOUCH_SLOP) continue;

      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = id;
      }
    }
    return best;
  }

  private onTouchStart = (e: TouchEvent): void => {
    this.enable();
    let onButton = false;
    for (const t of Array.from(e.changedTouches)) {
      const id = this.buttonAt(t.clientX, t.clientY);
      if (id !== null) onButton = true;
      this.touches.set(t.identifier, id);
    }
    // Гасим жест браузера только если действительно нажали кнопку: тапы по
    // карточкам меню должны остаться обычными касаниями.
    if (onButton) e.preventDefault();
    this.recompute();
  };

  /**
   * Палец может съехать с одной кнопки на другую, не отрываясь от экрана, —
   * это нормальный способ играть большим пальцем. Поэтому кнопка под каждым
   * касанием пересчитывается на каждое движение, а не фиксируется при нажатии.
   */
  private onTouchMove = (e: TouchEvent): void => {
    let changed = false;
    for (const t of Array.from(e.changedTouches)) {
      if (!this.touches.has(t.identifier)) continue;
      this.touches.set(t.identifier, this.buttonAt(t.clientX, t.clientY));
      changed = true;
    }
    if (changed) {
      e.preventDefault();
      this.recompute();
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) this.touches.delete(t.identifier);
    this.recompute();
  };

  /** Пересобирает удержания и подсветку из текущего набора касаний. */
  private recompute(): void {
    const next = new Set<HoldAction>();
    const pressed = new Set<ButtonId>();

    for (const id of this.touches.values()) {
      if (id === null) continue;
      pressed.add(id);
      const def = BUTTONS.find((b) => b.id === id);
      if (def?.hold) next.add(def.hold);
    }

    for (const action of next) {
      if (this.held.has(action)) continue;
      this.edges.add(action);
      // Тап по прыжку удерживаем до вершины: иначе гашение высоты срежет прыжок
      // и на ступеньку в шахте будет не забраться.
      if (action === 'jump') this.jumpHeldUntil = Date.now() + PLAYER.touchJumpHold * 1000;
    }

    // Одноразовые кнопки срабатывают в момент появления касания на них.
    for (const id of pressed) {
      if (this.pressedLast.has(id)) continue;
      const def = BUTTONS.find((b) => b.id === id);
      if (def && !def.hold && def.tap) this.queue.push(def.tap);
    }

    this.held = next;
    this.pressedLast = pressed;

    for (const [id, el] of this.elements) el.classList.toggle('kz-pressed', pressed.has(id));
  }

  private pressedLast = new Set<ButtonId>();

  /** Точка начала касания — чтобы отличить тап от смаза. */
  private tapStart: { id: number; x: number; y: number } | null = null;
  /** До этого момента click игнорируется как «призрачный» после касания. */
  private suppressClickUntil = 0;

  private onTapStart = (e: TouchEvent): void => {
    const t = e.changedTouches[0];
    if (!t) return;
    this.tapStart = { id: t.identifier, x: t.clientX, y: t.clientY };
  };

  private onTapEnd = (e: TouchEvent): void => {
    const start = this.tapStart;
    this.tapStart = null;
    if (!start) return;

    let end: Touch | null = null;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === start.id) end = t;
    }
    if (!end) return;

    // Смаз пальцем — не выбор пункта.
    const moved = Math.hypot(end.clientX - start.x, end.clientY - start.y);
    if (moved > 24) return;

    this.suppressClickUntil = Date.now() + 700;
    this.dispatchAt(end.clientX, end.clientY);
  };

  private onClick = (e: MouseEvent): void => {
    if (Date.now() < this.suppressClickUntil) return;
    this.dispatchAt(e.clientX, e.clientY);
  };

  private dispatchAt(clientX: number, clientY: number): void {
    const { x, y } = this.deps.toLogical(clientX, clientY);
    for (const region of this.deps.regions()) {
      if (x < region.x || x > region.x + region.w) continue;
      if (y < region.y || y > region.y + region.h) continue;
      for (const cmd of region.commands) this.queue.push(cmd);
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Интерфейс, общий с клавиатурой
  // -------------------------------------------------------------------------

  snapshot(): InputState {
    const input = emptyInput();
    input.left = this.held.has('left');
    input.right = this.held.has('right');
    input.jump = this.held.has('jump') || Date.now() < this.jumpHeldUntil;
    input.jumpPressed = this.edges.has('jump');
    input.attack = this.held.has('attack');
    input.attackPressed = this.edges.has('attack');
    input.dash = this.held.has('dash');
    input.dashPressed = this.edges.has('dash');
    return input;
  }

  consumeEdges(): void {
    this.edges.clear();
  }

  drainCommands(_phase: Phase): Command[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  /** Обновляет набор видимых кнопок под текущую фазу. */
  update(state: GameState): void {
    if (!this.active) return;
    const { visible, labels } = layoutFor(state);

    if (!sameSet(visible, this.visible)) {
      for (const [id, el] of this.elements) el.hidden = !visible.has(id);
      this.visible = visible;
      // Скрытая кнопка не должна остаться «нажатой»: иначе смена фазы под
      // прижатым пальцем оставляла бы персонажа бегущим в новую фазу.
      for (const [id] of this.elements) if (!visible.has(id)) this.pressedLast.delete(id);
      for (const [touchId, buttonId] of this.touches) {
        if (buttonId !== null && !visible.has(buttonId)) this.touches.set(touchId, null);
      }
      this.recompute();
    }

    for (const [id, label] of Object.entries(labels) as [ButtonId, string][]) {
      const el = this.elements.get(id);
      if (el && el.textContent !== label) el.textContent = label;
    }
  }
}

function sameSet(a: Set<ButtonId>, b: Set<ButtonId>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** Объединяет ввод с клавиатуры и с экрана: активно то, что нажато хоть где-то. */
export function mergeInput(a: InputState, b: InputState): InputState {
  return {
    left: a.left || b.left,
    right: a.right || b.right,
    up: a.up || b.up,
    down: a.down || b.down,
    jump: a.jump || b.jump,
    jumpPressed: a.jumpPressed || b.jumpPressed,
    attack: a.attack || b.attack,
    attackPressed: a.attackPressed || b.attackPressed,
    dash: a.dash || b.dash,
    dashPressed: a.dashPressed || b.dashPressed,
  };
}
