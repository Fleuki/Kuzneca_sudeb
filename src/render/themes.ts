/**
 * Атмосферные темы: как выглядит воздух в каждом месте игры.
 *
 * Одна тема на биом, одна на босса и одна на кузницу. Смысл не в украшении:
 * игрок выбирает биом до спуска, и штольня должна ощущаться иначе, чем каверны,
 * ещё до того как он прочитает название. То же с боссами — арена Гарпии засыпана
 * пеплом, у Бездны воздух светится снизу.
 *
 * Числа подобраны на глаз и держатся тусклыми: атмосфера не имеет права спорить
 * с красным языком телеграфов (§6).
 */

import { ARENA, VIEW_H } from '../core/constants.ts';
import type { BiomeId, BossId } from '../core/types.ts';
import type { AtmosphereTheme } from './atmosphere.ts';

const CAVE_FLOOR = VIEW_H - 30;

export const BIOME_ATMOSPHERE: Record<BiomeId, AtmosphereTheme> = {
  upper: {
    skyTop: 0x0d0b09,
    skyBottom: 0x191410,
    layers: [
      {
        factor: 0.15,
        color: 0x1d1712,
        alpha: 1,
        count: 14,
        minW: 60,
        maxW: 150,
        minH: 160,
        maxH: 330,
        shape: 'pillar',
        baseY: CAVE_FLOOR,
      },
      {
        factor: 0.35,
        color: 0x2a2118,
        alpha: 1,
        count: 10,
        minW: 40,
        maxW: 90,
        minH: 70,
        maxH: 190,
        shape: 'stalactite',
        baseY: 0,
      },
    ],
    moteColor: 0xd8b982,
    moteCount: 34,
    moteSize: 1.8,
    moteRise: 9,
    moteDrift: 14,
    fogColor: 0x2c2118,
    fogAlpha: 0.07,
    glowColor: 0xc98a44,
    glowAlpha: 0.05,
  },

  volcanic: {
    skyTop: 0x100706,
    skyBottom: 0x210d09,
    layers: [
      {
        factor: 0.12,
        color: 0x1f0d0a,
        alpha: 1,
        count: 12,
        minW: 70,
        maxW: 180,
        minH: 180,
        maxH: 340,
        shape: 'pillar',
        baseY: CAVE_FLOOR,
      },
      {
        factor: 0.34,
        color: 0x35150f,
        alpha: 1,
        count: 12,
        minW: 34,
        maxW: 80,
        minH: 90,
        maxH: 210,
        shape: 'stalactite',
        baseY: 0,
      },
    ],
    // Угли не падают, а поднимаются: снизу лава.
    moteColor: 0xff9a4a,
    moteCount: 44,
    moteSize: 2.1,
    moteRise: 34,
    moteDrift: 20,
    fogColor: 0x50201a,
    fogAlpha: 0.09,
    glowColor: 0xff5a1e,
    glowAlpha: 0.12,
  },

  caverns: {
    skyTop: 0x05080f,
    skyBottom: 0x0d1628,
    layers: [
      {
        factor: 0.14,
        color: 0x0e1526,
        alpha: 1,
        count: 13,
        minW: 50,
        maxW: 130,
        minH: 150,
        maxH: 320,
        shape: 'pillar',
        baseY: CAVE_FLOOR,
      },
      {
        factor: 0.36,
        color: 0x172441,
        alpha: 1,
        count: 14,
        minW: 26,
        maxW: 70,
        minH: 100,
        maxH: 240,
        shape: 'stalactite',
        baseY: 0,
      },
    ],
    // Споры кристальных каверн светятся и еле-еле плывут вверх.
    moteColor: 0x7ce8de,
    moteCount: 40,
    moteSize: 2.2,
    moteRise: 12,
    moteDrift: 10,
    fogColor: 0x1b2c4c,
    fogAlpha: 0.1,
    glowColor: 0x2e7fa0,
    glowAlpha: 0.07,
  },
};

export const BOSS_ATMOSPHERE: Record<BossId, AtmosphereTheme> = {
  golem: {
    skyTop: 0x0d0b0e,
    skyBottom: 0x1d1a1c,
    layers: [
      {
        factor: 0.1,
        color: 0x15121a,
        alpha: 1,
        count: 8,
        minW: 70,
        maxW: 130,
        minH: 260,
        maxH: 380,
        shape: 'pillar',
        baseY: ARENA.groundY,
      },
      {
        factor: 0.26,
        color: 0x221d29,
        alpha: 1,
        count: 6,
        minW: 44,
        maxW: 90,
        minH: 190,
        maxH: 300,
        shape: 'pillar',
        baseY: ARENA.groundY,
      },
    ],
    // Каменная пыль оседает вниз.
    moteColor: 0xb0a48c,
    moteCount: 26,
    moteSize: 1.7,
    moteRise: -12,
    moteDrift: 12,
    fogColor: 0x2a2430,
    fogAlpha: 0.08,
    glowColor: 0xc07a35,
    glowAlpha: 0.06,
  },

  harpy: {
    skyTop: 0x140d0b,
    skyBottom: 0x2b1a12,
    layers: [
      {
        factor: 0.08,
        color: 0x1c1310,
        alpha: 1,
        count: 7,
        minW: 60,
        maxW: 120,
        minH: 240,
        maxH: 360,
        shape: 'pillar',
        baseY: ARENA.groundY,
      },
      {
        factor: 0.3,
        color: 0x33201a,
        alpha: 1,
        count: 9,
        minW: 30,
        maxW: 70,
        minH: 90,
        maxH: 190,
        shape: 'stalactite',
        baseY: 0,
      },
    ],
    // Пепел падает густо — это её арена.
    moteColor: 0xd8b49a,
    moteCount: 52,
    moteSize: 1.9,
    moteRise: -26,
    moteDrift: 26,
    fogColor: 0x3a2620,
    fogAlpha: 0.09,
    glowColor: 0xd06a30,
    glowAlpha: 0.07,
  },

  abyss: {
    skyTop: 0x07060f,
    skyBottom: 0x171034,
    layers: [
      {
        factor: 0.09,
        color: 0x0e0a1e,
        alpha: 1,
        count: 9,
        minW: 60,
        maxW: 140,
        minH: 250,
        maxH: 400,
        shape: 'pillar',
        baseY: ARENA.groundY,
      },
      {
        factor: 0.28,
        color: 0x1a1240,
        alpha: 1,
        count: 8,
        minW: 34,
        maxW: 78,
        minH: 110,
        maxH: 250,
        shape: 'stalactite',
        baseY: 0,
      },
    ],
    moteColor: 0xa587ff,
    moteCount: 44,
    moteSize: 2.3,
    moteRise: 16,
    moteDrift: 12,
    fogColor: 0x241a4a,
    fogAlpha: 0.12,
    glowColor: 0x6a3fd0,
    glowAlpha: 0.1,
  },
};

/** Кузница, меню и экраны выбора: тёплый горн и поднимающиеся угли. */
export const FORGE_ATMOSPHERE: AtmosphereTheme = {
  skyTop: 0x0b090c,
  skyBottom: 0x1a1216,
  layers: [
    {
      factor: 0,
      color: 0x141017,
      alpha: 1,
      count: 6,
      minW: 90,
      maxW: 190,
      minH: 200,
      maxH: 330,
      shape: 'pillar',
      baseY: VIEW_H - 20,
    },
  ],
  moteColor: 0xffab5e,
  moteCount: 30,
  moteSize: 2,
  moteRise: 26,
  moteDrift: 16,
  fogColor: 0x2a1c18,
  fogAlpha: 0.05,
  glowColor: 0xe07a35,
  // Ниже, чем в шахте: на экранах меню поверх зарева лежат панели с текстом,
  // и слишком тёплый низ съедал их контраст.
  glowAlpha: 0.07,
};
