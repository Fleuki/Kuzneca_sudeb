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
  KEEP_WEAPON_ON_DEFEAT,
  MATERIALS,
  MATERIAL_ORDER,
  PLAYER,
  RECIPE_PRIMARY,
  RECIPE_SECONDARY,
  SHAPE_ORDER,
  UPGRADES,
  UPGRADE_ORDER,
} from '../core/constants.ts';
import { nextU32 } from '../core/rng.ts';
import type { Command } from '../core/commands.ts';
import type { BossId, GameState, MaterialId, ResultState } from '../core/types.ts';
import { generateMine } from './mine/generate.ts';
import { stepMine } from './mine/step.ts';
import { beginMinigame, canForge, createForgeState, forgeStrike, requiredAmount, stepForge } from './forge/step.ts';
import { combatFinished, createCombat, stepCombat } from './combat/step.ts';
import { availableBosses, canAfford, hasUpgrade, oreYield } from './state.ts';

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

    case 'FORGE_SET_SHAPE':
      if (state.forge && state.forge.stage === 'select') state.forge.shape = cmd.shape;
      break;

    case 'FORGE_SET_PRIMARY':
      if (state.forge && state.forge.stage === 'select') state.forge.primary = cmd.material;
      break;

    case 'FORGE_SET_SECONDARY':
      if (state.forge && state.forge.stage === 'select') state.forge.secondary = cmd.material;
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
      if (state.forge && state.forge.stage === 'select') {
        state.forge.cursorRow = (state.forge.cursorRow + cmd.delta + 3) % 3;
      } else {
        menuMove(state, cmd.delta);
      }
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
  // Подставляем осмысленный стартовый выбор: то, чего в рюкзаке больше всего.
  state.forge.primary = richestMaterial(state) ?? null;
  state.phase = 'forge';
  state.mine = null;
}

function tryBeginForge(state: GameState): void {
  const forge = state.forge;
  if (!forge || forge.stage !== 'select') return;

  if (forge.primary === null) {
    notice(state, 'Не выбран основной материал');
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
  if (!forge || forge.primary === null) return 'Не хватает материалов';
  const bp = state.meta.backpack;
  const parts: string[] = [];
  for (const m of MATERIAL_ORDER) {
    const need = requiredAmount(m, forge.primary, forge.secondary);
    if (need > bp[m]) parts.push(`${materialName(m)}: ${bp[m]}/${need}`);
  }
  return `Не хватает материалов — ${parts.join(', ')}`;
}

function materialName(m: MaterialId): string {
  return MATERIALS[m].name;
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
    return 'Броня Голема съела 40% урона. Обсидиан проходит сквозь неё.';
  }
  if (bossId === 'abyss' && w.magicFraction < 0.5) {
    return 'Ниже 50% Повелитель поднимает щит: физический урон почти не проходит. Нужен кристалл.';
  }
  if (bossId === 'harpy' && w.lifesteal <= 0) {
    return 'Гарпия набивает урон мелкими ударами. Кровавое железо возвращает его обратно.';
  }
  if (bossId === 'harpy' && w.interval > 0.9) {
    return 'Тяжёлым оружием в окна Гарпии не попасть. Лёгкое успевает.';
  }
  if (run.hp <= 0) {
    return 'Подготовка была верной — не хватило уклонений. Тот же материал, но аккуратнее.';
  }
  return 'Материал подобран неплохо. Попробуй другую форму или добери прочности.';
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

/** На экране ковки стрелки влево/вправо меняют значение в текущей строке. */
function forgeMove(state: GameState, delta: number): void {
  const forge = state.forge;
  if (!forge || forge.stage !== 'select') return;

  if (forge.cursorRow === 0) {
    const i = SHAPE_ORDER.indexOf(forge.shape);
    forge.shape = SHAPE_ORDER[(i + delta + SHAPE_ORDER.length) % SHAPE_ORDER.length];
    return;
  }
  if (forge.cursorRow === 1) {
    const i = forge.primary ? MATERIAL_ORDER.indexOf(forge.primary) : 0;
    forge.primary = MATERIAL_ORDER[(i + delta + MATERIAL_ORDER.length) % MATERIAL_ORDER.length];
    return;
  }
  // Во вторичной строке есть дополнительный вариант «без вторичного».
  const options: (MaterialId | null)[] = [...MATERIAL_ORDER, null];
  const i = options.indexOf(forge.secondary);
  forge.secondary = options[(i + delta + options.length) % options.length];
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
      if (forge.stage === 'select') tryBeginForge(state);
      else if (forge.stage === 'minigame') forgeStrike(state);
      else takeWeapon(state);
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

function richestMaterial(state: GameState): MaterialId | null {
  let best: MaterialId | null = null;
  let bestCount = 0;
  for (const m of MATERIAL_ORDER) {
    if (state.meta.backpack[m] > bestCount) {
      bestCount = state.meta.backpack[m];
      best = m;
    }
  }
  return best;
}

/** Текст «сколько нужно» для экрана ковки. */
export function recipeText(): string {
  return `${RECIPE_PRIMARY} основного + ${RECIPE_SECONDARY} вторичного`;
}

export function bossName(id: BossId): string {
  return BOSSES[id].name;
}

export function biomeName(id: (typeof BIOME_ORDER)[number]): string {
  return BIOMES[id].name;
}
