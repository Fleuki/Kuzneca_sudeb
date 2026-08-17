/**
 * Корень симуляции: приём команд и фиксированный шаг.
 *
 * Это единственный модуль, который знает про все фазы сразу. Он же держит
 * переходы между ними, потому что «фазы автономны и сохраняемы» (§2) —
 * значит, переход это явная операция, а не побочный эффект где-то в глубине.
 */

import {
  BIOMES,
  BIOME_ORDER,
  BOSSES,
  DT,
  FORGE_GRID_COLS,
  KEEP_WEAPON_ON_DEFEAT,
  PLAYER,
  SHAPE_ORDER,
  UPGRADES,
  UPGRADE_ORDER,
  WEAPON_BASE_COST,
} from '../core/constants.ts';
import { ITEMS, isForgeable } from '../core/items.ts';
import type { ItemId } from '../core/items.ts';
import { nextU32 } from '../core/rng.ts';
import type { Command } from '../core/commands.ts';
import type { BossId, GameState, ResultState } from '../core/types.ts';
import { generateMine } from './mine/generate.ts';
import { stepMine } from './mine/step.ts';
import {
  beginMinigame,
  bestBase,
  canForge,
  createForgeState,
  forgeStrike,
  requiredAmount,
  stepForge,
} from './forge/step.ts';
import { canCraft, clampCursor, clearSlots, craft, itemAtCursor, putInSlot } from './forge/craft.ts';
import { combatFinished, createCombat, stepCombat } from './combat/step.ts';
import {
  availableBosses,
  canAfford,
  canForgeAnything,
  forgeableItems,
  hasUpgrade,
  oreYield,
  ownedItems,
} from './state.ts';

const NOTICE_TIME = 2.6;

function notice(state: GameState, text: string): void {
  state.notice = text;
  state.noticeTimer = NOTICE_TIME;
}

// ---------------------------------------------------------------------------
// Фиксированный шаг (§11)
// ---------------------------------------------------------------------------

export function tick(state: GameState): void {
  state.tick += 1;
  if (state.noticeTimer > 0) state.noticeTimer -= DT;

  switch (state.phase) {
    case 'mine':
      stepMine(state, DT);
      break;
    case 'forge':
      stepForge(state, DT);
      break;
    case 'combat':
      stepCombat(state, DT);
      if (state.combat && combatFinished(state.combat)) finishCombat(state);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Команды (§11: мутации только через команды)
// ---------------------------------------------------------------------------

export function dispatch(state: GameState, cmd: Command): void {
  switch (cmd.type) {
    case 'INPUT':
      state.input = cmd.input;
      break;

    case 'START_RUN':
      startRun(state);
      break;

    case 'SELECT_BOSS':
      selectBoss(state, cmd.bossId);
      break;

    case 'SELECT_BIOME':
      selectBiome(state, cmd.biome);
      break;

    case 'LEAVE_MINE':
      leaveMine(state);
      break;

    case 'FORGE_TAB':
      if (state.forge && state.forge.stage === 'plan') state.forge.tab = cmd.tab;
      break;

    case 'FORGE_SET_SHAPE':
      if (state.forge && state.forge.stage === 'plan') state.forge.shape = cmd.shape;
      break;

    case 'FORGE_SET_BASE':
      if (state.forge && state.forge.stage === 'plan' && isForgeable(cmd.item)) {
        state.forge.base = cmd.item;
      }
      break;

    case 'FORGE_SET_INLAY':
      if (state.forge && state.forge.stage === 'plan') state.forge.inlay = cmd.item;
      break;

    case 'CRAFT_CURSOR':
      if (state.forge && state.forge.stage === 'plan') {
        state.forge.cursor = cmd.index;
        clampCursor(state);
      }
      break;

    case 'CRAFT_PICK':
      craftPick(state, cmd.item);
      break;

    case 'CRAFT_CLEAR':
      if (state.forge) clearSlots(state.forge);
      break;

    case 'CRAFT_COMBINE':
      tryCraft(state);
      break;

    case 'FORGE_BEGIN':
      tryBeginForge(state);
      break;

    case 'FORGE_STRIKE':
      forgeStrike(state);
      break;

    case 'FORGE_TAKE':
      takeWeapon(state);
      break;

    case 'RETURN_TO_MINE':
      returnToMine(state);
      break;

    case 'DISCARD_SELECTED':
      discardSelected(state);
      break;

    case 'RESULT_CONTINUE':
      state.result = null;
      state.run = null;
      state.phase = 'menu';
      state.menuCursor = 0;
      break;

    case 'OPEN_UPGRADES':
      state.phase = 'upgrades';
      state.menuCursor = 0;
      break;

    case 'CLOSE_UPGRADES':
      state.phase = 'menu';
      state.menuCursor = 0;
      break;

    case 'BUY_UPGRADE':
      buyUpgrade(state, cmd.upgrade);
      break;

    case 'MENU_MOVE':
      menuMove(state, cmd.delta);
      break;

    case 'MENU_SET':
      state.menuCursor = Math.max(0, Math.min(menuLength(state) - 1, cmd.index));
      break;

    case 'MENU_ROW':
      if (state.phase === 'forge') forgeRow(state, cmd.delta);
      else menuMove(state, cmd.delta);
      break;

    case 'MENU_CONFIRM':
      menuConfirm(state);
      break;

    case 'MENU_BACK':
      menuBack(state);
      break;

    case 'ABANDON_RUN':
      abandonRun(state);
      break;
  }
}

// ---------------------------------------------------------------------------
// Переходы между фазами
// ---------------------------------------------------------------------------

function startRun(state: GameState): void {
  const offered = availableBosses(state.meta);
  state.run = {
    seed: nextU32(state.rng),
    bossId: offered[0],
    biome: null,
    hp: PLAYER.hpMax,
    hpMax: PLAYER.hpMax,
    weapon: null,
    offered,
  };
  state.meta.runsStarted += 1;
  state.phase = 'bossSelect';
  state.menuCursor = 0;
  state.mine = null;
  state.forge = null;
  state.combat = null;
  state.result = null;
}

function selectBoss(state: GameState, bossId: BossId): void {
  if (!state.run || state.phase !== 'bossSelect') return;
  if (state.run.offered.indexOf(bossId) < 0) return;
  state.run.bossId = bossId;
  state.phase = 'biomeSelect';
  state.menuCursor = 0;
}

function selectBiome(state: GameState, biome: (typeof BIOME_ORDER)[number]): void {
  const run = state.run;
  if (!run || state.phase !== 'biomeSelect') return;
  run.biome = biome;
  state.mine = generateMine(state.rng, biome, oreYield(state.meta));
  state.phase = 'mine';
}

function leaveMine(state: GameState): void {
  if (state.phase !== 'mine' || !state.mine) return;
  if (!state.mine.atExit) {
    notice(state, 'Уйти можно только через подъёмник в конце штольни');
    return;
  }
  state.forge = createForgeState(state);
  state.phase = 'forge';
  state.mine = null;

  if (!canForgeAnything(state.meta)) {
    notice(state, 'Ни на оружие, ни на соединение не хватает — придётся спуститься ещё раз');
  }
}

/** Кладёт предмет на верстак: под курсором или явно указанный (тап пальцем). */
function craftPick(state: GameState, item?: ItemId): void {
  const forge = state.forge;
  if (!forge || forge.stage !== 'plan') return;

  const chosen = item ?? itemAtCursor(state);
  if (!chosen || state.meta.backpack[chosen] <= 0) return;

  forge.tab = 'craft';
  putInSlot(forge, chosen);
}

/** Соединение на верстаке. Отказ всегда объясняется словами, а не молчанием. */
function tryCraft(state: GameState): void {
  const forge = state.forge;
  if (!forge || forge.stage !== 'plan') return;

  if (forge.slotA === null || forge.slotB === null) {
    notice(state, 'Верстаку нужны два предмета');
    return;
  }
  if (!canCraft(state)) {
    notice(state, 'Эта пара не соединяется');
    return;
  }

  const known = state.meta.known.slice();
  const out = craft(state);
  if (!out) return;

  const first = known.indexOf(out) < 0;
  notice(state, first ? `Открыто: ${ITEMS[out].name}` : `Получилось: ${ITEMS[out].name}`);

  // Если основа кончилась или появилось что-то лучше, наковальня должна это знать.
  if (forge.base === null || state.meta.backpack[forge.base] < WEAPON_BASE_COST) {
    forge.base = bestBase(state);
  }
  if (forge.inlay !== null && state.meta.backpack[forge.inlay] <= 0) forge.inlay = null;
}

function tryBeginForge(state: GameState): void {
  const forge = state.forge;
  if (!forge || forge.stage !== 'plan') return;

  if (forge.base === null) {
    notice(state, 'Не выбрана основа. Сырьё не годится — сперва переплавь его на верстаке');
    return;
  }
  if (!canForge(state)) {
    notice(state, missingText(state));
    return;
  }
  beginMinigame(state);
}

function missingText(state: GameState): string {
  const forge = state.forge;
  if (!forge || forge.base === null) return 'Не хватает предметов';

  const bp = state.meta.backpack;
  const parts: string[] = [];
  const items: ItemId[] = forge.inlay && forge.inlay !== forge.base
    ? [forge.base, forge.inlay]
    : [forge.base];

  for (const id of items) {
    const need = requiredAmount(id, forge.base, forge.inlay);
    if (need > bp[id]) parts.push(`${ITEMS[id].name}: ${bp[id]}/${need}`);
  }
  return `Не хватает — ${parts.join(', ')}`;
}

function takeWeapon(state: GameState): void {
  const forge = state.forge;
  const run = state.run;
  if (!forge || !run || forge.stage !== 'done' || !forge.forged) return;
  run.weapon = forge.forged;
  state.combat = createCombat(state);
  state.phase = 'combat';
  state.forge = null;
}

/**
 * Спуск в шахту второй раз за забег.
 *
 * Возвращает на выбор биома, а не сразу в старую шахту: если материала не хватило,
 * скорее всего нужен другой биом. Босс остаётся выбранным, рюкзак сохраняется,
 * здоровье — нет. Именно здоровье и есть цена лишнего захода: урон из шахты
 * переносится в бой (§4), так что второй спуск оплачивается тем же, чем и первый.
 */
function returnToMine(state: GameState): void {
  const forge = state.forge;
  const run = state.run;
  if (!forge || !run || forge.stage !== 'plan') return;

  state.forge = null;
  state.mine = null;
  state.phase = 'biomeSelect';
  state.menuCursor = 0;
  notice(state, 'Спускаешься ещё раз. Здоровье не восстановится.');
}

/** Предмет, на который сейчас наведён игрок: клетка сетки или строка наковальни. */
export function selectedItem(state: GameState): ItemId | null {
  const forge = state.forge;
  if (!forge) return null;
  if (forge.tab === 'craft') return itemAtCursor(state);
  return forge.assembleRow === 2 ? forge.inlay : forge.base;
}

/** Выбрасывает весь запас выбранного предмета — освобождает рюкзак под нужную руду. */
function discardSelected(state: GameState): void {
  const forge = state.forge;
  if (!forge || forge.stage !== 'plan') return;

  const item = selectedItem(state);
  if (!item) return;

  const amount = state.meta.backpack[item];
  if (amount <= 0) return;

  state.meta.backpack[item] = 0;
  if (forge.slotA === item) forge.slotA = null;
  if (forge.slotB === item) forge.slotB = null;
  if (forge.inlay === item) forge.inlay = null;
  if (forge.base === item) forge.base = bestBase(state);
  clampCursor(state);
  notice(state, `Выброшено: ${ITEMS[item].name} ×${amount}`);
}

function finishCombat(state: GameState): void {
  const combat = state.combat;
  const run = state.run;
  if (!combat || !run) return;

  const won = combat.outcome === 'won';
  if (won) {
    state.meta.brands += 1;
    state.meta.runsWon += 1;
    if (state.meta.defeated.indexOf(run.bossId) < 0) state.meta.defeated.push(run.bossId);
  }

  const result: ResultState = {
    won,
    bossId: run.bossId,
    brandsEarned: won ? 1 : 0,
    damageDealt: Math.round(combat.damageDealt),
    timeSeconds: combat.elapsed,
    weaponBroken: combat.weaponBroken,
    hint: buildHint(state, won),
  };

  if (!KEEP_WEAPON_ON_DEFEAT || combat.weaponBroken) run.weapon = null;

  state.result = result;
  state.combat = null;
  state.phase = 'result';
}

/**
 * Подсказка на экране итога. Смысл — чтобы поражение читалось как
 * «я неправильно подготовился», а не «я плохо играл» (§1).
 */
function buildHint(state: GameState, won: boolean): string {
  const run = state.run;
  const combat = state.combat;
  if (!run || !combat) return '';

  const w = run.weapon;
  const bossId = run.bossId;

  if (won) {
    if (combat.weaponBroken) return 'Оружие рассыпалось на последнем ударе. Успел.';
    return 'Оружие выдержало. Клеймо твоё.';
  }

  if (combat.weaponBroken) {
    return 'Оружие сломалось раньше, чем кончился босс. Нужна прочность — или урон выше.';
  }
  if (!w) return 'В бой без оружия ходить не стоит.';

  if (bossId === 'golem' && w.armorPierce < 0.5) {
    return 'Броня Голема съела 40% урона. Обсидиановая ветка проходит сквозь неё: литой обсидиан, осадный сплав.';
  }
  if (bossId === 'abyss' && w.magicFraction < 0.5) {
    return 'Ниже 50% Повелитель поднимает щит: физический урон почти не проходит. Нужна магия — призма, звёздное ядро.';
  }
  if (bossId === 'harpy' && w.lifesteal <= 0) {
    return 'Гарпия набивает урон мелкими ударами. Кровавая ветка возвращает его обратно: сердечное железо, скорая кровь.';
  }
  if (bossId === 'harpy' && w.interval > 0.9) {
    return 'Тяжёлым оружием в окна Гарпии не попасть. Лёгкое успевает.';
  }
  if (ITEMS[w.base].tier <= 1) {
    return `${ITEMS[w.base].name} — это первый уровень дерева. Соедини два таких и выкуй из того, что получится.`;
  }
  if (run.hp <= 0) {
    return 'Подготовка была верной — не хватило уклонений. Та же основа, но аккуратнее.';
  }
  return 'Основа подобрана неплохо. Попробуй другую форму, вставку или уровень выше.';
}

function abandonRun(state: GameState): void {
  if (state.phase === 'menu' || state.phase === 'upgrades') return;
  // Ресурсы остаются: поражение не отнимает ничего, кроме времени (§8).
  state.run = null;
  state.mine = null;
  state.forge = null;
  state.combat = null;
  state.result = null;
  state.phase = 'menu';
  state.menuCursor = 0;
  notice(state, 'Забег брошен. Ресурсы остались в рюкзаке.');
}

function buyUpgrade(state: GameState, id: (typeof UPGRADE_ORDER)[number]): void {
  if (hasUpgrade(state.meta, id)) {
    notice(state, 'Уже куплено');
    return;
  }
  if (!canAfford(state.meta, id)) {
    notice(state, `Нужно клейм: ${UPGRADES[id].cost}`);
    return;
  }
  state.meta.brands -= UPGRADES[id].cost;
  state.meta.upgrades.push(id);
  notice(state, `${UPGRADES[id].name} — установлено`);
}

// ---------------------------------------------------------------------------
// Навигация по меню (в симуляции, чтобы поток команд был воспроизводим)
// ---------------------------------------------------------------------------

function menuLength(state: GameState): number {
  switch (state.phase) {
    case 'menu':
      return 2;
    case 'bossSelect':
      return state.run ? state.run.offered.length : 1;
    case 'biomeSelect':
      return BIOME_ORDER.length;
    case 'upgrades':
      return UPGRADE_ORDER.length;
    default:
      return 1;
  }
}

function menuMove(state: GameState, delta: number): void {
  if (state.phase === 'forge') {
    forgeMove(state, delta);
    return;
  }
  const len = menuLength(state);
  state.menuCursor = (state.menuCursor + delta + len * 2) % len;
}

/**
 * Стрелки влево/вправо в кузнице.
 * На верстаке это движение по сетке рюкзака, на наковальне — смена значения
 * в текущей строке рецепта.
 */
function forgeMove(state: GameState, delta: number): void {
  const forge = state.forge;
  if (!forge || forge.stage !== 'plan') return;

  if (forge.tab === 'craft') {
    const owned = ownedItems(state.meta.backpack);
    if (owned.length === 0) return;
    forge.cursor = (forge.cursor + delta + owned.length) % owned.length;
    return;
  }

  if (forge.assembleRow === 0) {
    const i = SHAPE_ORDER.indexOf(forge.shape);
    forge.shape = SHAPE_ORDER[(i + delta + SHAPE_ORDER.length) % SHAPE_ORDER.length];
    return;
  }

  if (forge.assembleRow === 1) {
    // Основой может быть только то, чего хватает на оружие: показывать узлы,
    // которыми нельзя воспользоваться, — это обещание, которое экран не держит.
    const options = forgeableItems(state.meta.backpack);
    if (options.length === 0) return;
    const i = forge.base ? options.indexOf(forge.base) : 0;
    forge.base = options[(i + delta + options.length) % options.length];
    return;
  }

  // У вставки есть дополнительный вариант «без вставки».
  const inlays: (ItemId | null)[] = [
    null,
    ...ownedItems(state.meta.backpack).filter((id) => isForgeable(id)),
  ];
  const i = inlays.indexOf(forge.inlay);
  forge.inlay = inlays[(i + delta + inlays.length) % inlays.length];
}

/** Стрелки вверх/вниз: ряд сетки на верстаке, строка рецепта на наковальне. */
function forgeRow(state: GameState, delta: number): void {
  const forge = state.forge;
  if (!forge || forge.stage !== 'plan') return;

  if (forge.tab === 'assemble') {
    forge.assembleRow = (forge.assembleRow + delta + 3) % 3;
    return;
  }

  const owned = ownedItems(state.meta.backpack);
  if (owned.length === 0) return;
  forge.cursor = Math.max(0, Math.min(owned.length - 1, forge.cursor + delta * FORGE_GRID_COLS));
}

function menuConfirm(state: GameState): void {
  switch (state.phase) {
    case 'menu':
      if (state.menuCursor === 0) startRun(state);
      else dispatch(state, { type: 'OPEN_UPGRADES' });
      break;

    case 'bossSelect': {
      const run = state.run;
      if (!run) return;
      selectBoss(state, run.offered[state.menuCursor] ?? run.offered[0]);
      break;
    }

    case 'biomeSelect':
      selectBiome(state, BIOME_ORDER[state.menuCursor]);
      break;

    case 'mine':
      leaveMine(state);
      break;

    case 'forge': {
      const forge = state.forge;
      if (!forge) return;
      if (forge.stage === 'minigame') {
        forgeStrike(state);
      } else if (forge.stage === 'done') {
        takeWeapon(state);
      } else if (forge.tab === 'assemble') {
        tryBeginForge(state);
      } else if (forge.slotA !== null && forge.slotB !== null) {
        // Оба слота заняты — подтверждение означает «соединяй».
        tryCraft(state);
      } else {
        craftPick(state);
      }
      break;
    }

    case 'result':
      dispatch(state, { type: 'RESULT_CONTINUE' });
      break;

    case 'upgrades':
      buyUpgrade(state, UPGRADE_ORDER[state.menuCursor]);
      break;

    default:
      break;
  }
}

function menuBack(state: GameState): void {
  switch (state.phase) {
    case 'biomeSelect':
      state.phase = 'bossSelect';
      state.menuCursor = 0;
      break;
    case 'upgrades':
      state.phase = 'menu';
      state.menuCursor = 0;
      break;
    case 'mine':
    case 'forge':
    case 'combat':
      abandonRun(state);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Вспомогательное
// ---------------------------------------------------------------------------

/** Текст «сколько нужно» для экрана ковки. */
export function recipeText(): string {
  return `${WEAPON_BASE_COST} основы + 1 вставка`;
}

export function bossName(id: BossId): string {
  return BOSSES[id].name;
}

export function biomeName(id: (typeof BIOME_ORDER)[number]): string {
  return BIOMES[id].name;
}
