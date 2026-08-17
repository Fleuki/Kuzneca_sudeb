# Промпты для генерации ассетов

Размеры здесь не выдуманы: они взяты из `src/core/constants.ts` и совпадают
с хитбоксами. Спрайт может быть чуть больше хитбокса (волосы, оружие, крылья),
но **центр и линия пола обязаны совпадать**, иначе «бил, а не попал».

| Что | Хитбокс в игре | Холст спрайта |
|---|---|---|
| Игрок | 22×34 | 48×48 (фигура ~32 px в высоту, стоит на нижней кромке) |
| Каменный Голем | 128×168 | 160×192 |
| Пепельная Гарпия | 120×96 | 160×128 |
| Повелитель Бездны | 140×176 | 176×208 |
| Тайл породы | 24×24 | 24×24 или 48×48 (кратно двум) |
| Руда в жиле | ~15–24 | 32×32 |
| Оружие в руке | — | 32×16 (молот), 24×12 (клинок) |
| Иконка предмета | — | 32×32 |

## Общий хвост промпта

Дописывать **ко всем** промптам ниже — он отвечает за то, чтобы ассеты сели
в игру без переделки:

```
pixel art, side view, facing right, full body inside frame, transparent background,
limited palette, crisp hard pixels, no anti-aliasing, no dithering gradients,
no drop shadow, no ground shadow, no background scenery, no text, no watermark,
single character centered, dark fantasy underground palette
```

## Палитра проекта

Просить генератор держаться этих цветов — тогда ассеты не поспорят с атмосферой:

```
palette: #0d0b09 #191410 #2a2118 (тьма и камень)
         #b9c2cc #dfe6ee (железо и сталь)
         #6b4fa0 #8a63d6 (обсидиан)
         #63e0d8 #8ff8f0 (кристалл)
         #c4404a #e0616b (кровавое железо)
         #ff9a4a #ff5a1e (угли и горн)
```

---

## Герой — пять концептов

Игрок — кузнец, который сам испытывает свою работу. Человеком быть не обязан.

### 1. Пустой доспех с углём в груди (рекомендую)

Он и кузнец, и собственное изделие: сам себя выковал. Тлеющие угли в груди
дают тёплый свет, который ложится на нашу палитру и на искры от ударов.

```
pixel art sprite of a small empty suit of armor, hollow knight-like silhouette,
no face inside the helmet, only two glowing ember eyes, a burning coal heart
visible through the ribcage gap, blacksmith apron of scorched leather over the
plates, soot-stained iron, compact stocky proportions, standing idle pose,
holding a smith hammer down at its side
```

### 2. Жук-кузнец

Прямой поклон Hollow Knight: хитин, маска, фартук.

```
pixel art sprite of a beetle-like creature blacksmith, hard chitin shell,
pale bone mask with two dark eye holes, leather apron with tool loops,
four limbs, two of them thick and muscular for hammering, hunched sturdy stance,
holding a smith hammer, muted earth tones with warm ember highlights
```

### 3. Каменный подмастерье

Родня боссу-Голему. Иронично: он бьёт своих.

```
pixel art sprite of a small stone golem apprentice, rough granite body with
moss in the cracks, single glowing rune carved on its chest, oversized blocky
hands, leather smith apron too big for it, dented iron hammer,
heavy grounded stance, weathered grey stone with warm rune glow
```

### 4. Крот-рудокоп

Тот, кто под землёй у себя дома.

```
pixel art sprite of a mole miner blacksmith, dense dark fur, blind squinting
eyes, big digging claws, brass goggles pushed up on the forehead, leather apron
burned by sparks, small pickaxe on the belt and a hammer in hand,
stocky low-slung posture
```

### 5. Дух горна

Живое пламя, удерживаемое железным каркасом.

```
pixel art sprite of a forge spirit, humanoid shape made of glowing embers held
together by an iron cage frame, molten cracks running through charcoal skin,
no face, only a bright furnace glow where the head would be, wisps of heat
rising, holding a hammer of black iron
```

### Поза удара (после того как выберешь героя)

Генерировать **той же моделью и тем же описанием**, добавив в конец:

```
mid-swing attack pose, hammer raised overhead and coming down, body leaning
forward, same character design, same palette, same canvas size
```

---

## Боссы

### Каменный Голем (160×192)

Такой уже есть, но если перегенерировать — важно, чтобы он был **шире, чем выше**
в плечах: игрок должен видеть, куда бить.

```
pixel art sprite of a massive stone golem boss, boulders held together by
glowing runes, mossy shoulders, tiny red eyes deep in a cracked skull face,
huge asymmetric arms, hunched heavy stance, ancient and slow,
grey granite with green moss and faint blue rune light
```

### Пепельная Гарпия (160×128)

Широкая по горизонтали: она летает через весь экран.

```
pixel art sprite of an ash harpy boss, bird-woman creature with charred feathers,
wide spread wings mid-flight, burning ember eyes, sharp talons, trailing ash and
sparks, lean and fast silhouette, ash grey and rust orange palette
```

### Повелитель Бездны (176×208)

Ему нужна вторая фаза: тот же силуэт, но со щитом.

```
pixel art sprite of an abyss lord boss, tall cloaked figure with no visible body
inside, void where the face should be, two rows of pale glowing eyes in the hood,
long tattered robe dissolving into darkness at the bottom, floating slightly
above the ground, deep purple and black with cold violet glow
```

Вторая фаза — отдельный кадр, добавить в конец:

```
same character, now surrounded by a hexagonal barrier of violet light,
arms raised, shield runes floating around the body
```

---

## Руда и тайлы

### Руда в жиле (32×32, четыре штуки)

Одинаковая форма, разный цвет и характер — игрок должен различать их боковым зрением.

```
pixel art ore vein embedded in dark rock, chunky angular crystals bursting out
of stone, thick dark outline, readable at small size, 32x32 sprite,
[ЦВЕТ]
```

Подставить вместо `[ЦВЕТ]`:

- **Железо**: `dull grey-blue metallic nuggets, cold steel tint #b9c2cc`
- **Обсидиан**: `black volcanic glass shards with violet sheen #6b4fa0`
- **Кристалл**: `translucent glowing turquoise crystals, inner light #63e0d8`
- **Кровавое железо**: `deep red iron with wet crimson veins #c4404a, faintly pulsing`

### Тайл породы (24×24, бесшовный, три биома)

```
seamless tileable pixel art rock texture, 24x24 tile, top-down-lit stone blocks,
subtle cracks, tiles perfectly on all four sides, no lighting gradient across
the tile, [БИОМ]
```

- **Верхние штольни**: `dry brown sandstone with old pick marks`
- **Вулканические слои**: `black basalt with glowing orange lava cracks`
- **Кристальные каверны**: `dark blue stone with tiny glowing turquoise specks`

---

## Оружие

Хватит **двух** текстур: цвет узла дерева накладывается кодом, и одна картинка
превращается в 26 вариантов.

```
pixel art blacksmith war hammer, side view, horizontal, plain grey metal head
and dark wooden handle, no glow, no colored gems, flat neutral colors for
recoloring, 32x16 sprite, thick dark outline
```

```
pixel art short dagger blade, side view, horizontal, plain grey steel,
no ornaments, flat neutral colors for recoloring, 24x12 sprite,
thick dark outline
```

**Важно:** оружие должно быть **серым и без свечения** — цвет добавит игра.
Уже присланный фиолетовый молот с трещинами хорош как отдельная легендарная
вещь (Ядро Погибели), но как основа под перекраску не годится.

---

## Как отдавать результат

- PNG с прозрачным фоном, без обрезки полей (холст ровно того размера,
  что в таблице).
- Один файл — один спрайт. Атлас соберётся сам при сборке.
- Если генератор выдал 1024×1024 — уменьшать **только целым делением**
  (1024 → 512 → 256 → 128) и обязательно методом «ближайший сосед»,
  иначе пиксели поплывут и появится грязь по краям.
