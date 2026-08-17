/**
 * Клавиатура → команды.
 *
 * Слой ввода не трогает состояние: он собирает InputState и список команд,
 * а применяет их игровой цикл через dispatch (§11).
 */

import type { Command } from '../core/commands.ts';
import { emptyInput } from '../core/types.ts';
import type { InputState, Phase } from '../core/types.ts';

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const JUMP = ['Space', 'ArrowUp', 'KeyW'];
const ATTACK = ['KeyJ', 'KeyZ', 'KeyX'];
const DASH = ['ShiftLeft', 'ShiftRight', 'KeyK', 'KeyL'];

/** Клавиши, у которых прокрутка страницы мешает игре. */
const PREVENT = new Set([
  'Backspace',
  'Space',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Tab',
  'Enter',
]);

export class Keyboard {
  private down = new Set<string>();
  /** Фронты нажатий, ещё не съеденные симуляцией. */
  private edges = new Set<string>();
  /** Очередь нажатий для навигации по меню. */
  private queue: string[] = [];

  attach(target: EventTarget = window): void {
    target.addEventListener('keydown', this.onKeyDown as EventListener);
    target.addEventListener('keyup', this.onKeyUp as EventListener);
    window.addEventListener('blur', this.onBlur);
  }

  detach(target: EventTarget = window): void {
    target.removeEventListener('keydown', this.onKeyDown as EventListener);
    target.removeEventListener('keyup', this.onKeyUp as EventListener);
    window.removeEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.repeat) {
      // Автоповтор нужен только меню — так удобно листать длинные списки.
      this.queue.push(e.code);
      return;
    }
    this.down.add(e.code);
    this.edges.add(e.code);
    this.queue.push(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  /** Потеря фокуса не должна оставлять персонажа бегущим в стену. */
  private onBlur = (): void => {
    this.down.clear();
    this.edges.clear();
    this.queue.length = 0;
  };

  private any(codes: string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  private anyEdge(codes: string[]): boolean {
    for (const c of codes) if (this.edges.has(c)) return true;
    return false;
  }

  snapshot(): InputState {
    const input = emptyInput();
    input.left = this.any(LEFT);
    input.right = this.any(RIGHT);
    input.up = this.any(UP);
    input.down = this.any(DOWN);
    input.jump = this.any(JUMP);
    input.jumpPressed = this.anyEdge(JUMP);
    input.attack = this.any(ATTACK);
    input.attackPressed = this.anyEdge(ATTACK);
    input.dash = this.any(DASH);
    input.dashPressed = this.anyEdge(DASH);
    return input;
  }

  /**
   * Съедает фронты нажатий. Вызывается только если в этом кадре реально
   * прошёл хотя бы один тик — иначе нажатие потерялось бы между кадрами.
   */
  consumeEdges(): void {
    this.edges.clear();
  }

  /** Команды меню; какие клавиши учитывать, зависит от фазы. */
  drainCommands(phase: Phase): Command[] {
    const out: Command[] = [];
    const keys = this.queue;
    this.queue = [];

    for (const code of keys) {
      const cmd = mapKey(code, phase);
      if (cmd) out.push(cmd);
    }
    return out;
  }
}

function mapKey(code: string, phase: Phase): Command | null {
  // В геймплейных фазах стрелки и пробел заняты управлением персонажем,
  // поэтому меню слушает только выход и подтверждение действия.
  if (phase === 'mine') {
    if (code === 'KeyE' || code === 'Enter') return { type: 'LEAVE_MINE' };
    if (code === 'Escape') return { type: 'MENU_BACK' };
    return null;
  }
  if (phase === 'combat') {
    if (code === 'Escape') return { type: 'MENU_BACK' };
    return null;
  }

  // Кузница. Спуститься ещё раз и выбросить лишнее — из этих двух действий
  // складывается защита от тупика, поэтому они есть и на клавиатуре.
  // Соединение на верстаке вынесено на отдельную клавишу: Enter здесь занят
  // раскладыванием предметов по слотам.
  if (phase === 'forge') {
    if (code === 'KeyR') return { type: 'RETURN_TO_MINE' };
    if (code === 'Backspace' || code === 'Delete') return { type: 'DISCARD_SELECTED' };
    if (code === 'KeyQ' || code === 'Digit1') return { type: 'FORGE_TAB', tab: 'craft' };
    if (code === 'KeyE' || code === 'Digit2') return { type: 'FORGE_TAB', tab: 'assemble' };
    if (code === 'KeyC') return { type: 'CRAFT_COMBINE' };
    if (code === 'KeyX') return { type: 'CRAFT_CLEAR' };
  }

  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return { type: 'MENU_ROW', delta: -1 };
    case 'ArrowDown':
    case 'KeyS':
      return { type: 'MENU_ROW', delta: 1 };
    case 'ArrowLeft':
    case 'KeyA':
      return { type: 'MENU_MOVE', delta: -1 };
    case 'ArrowRight':
    case 'KeyD':
      return { type: 'MENU_MOVE', delta: 1 };
    case 'Enter':
    case 'Space':
    case 'KeyJ':
    case 'KeyZ':
      return { type: 'MENU_CONFIRM' };
    case 'Escape':
      return { type: 'MENU_BACK' };
    default:
      return null;
  }
}
