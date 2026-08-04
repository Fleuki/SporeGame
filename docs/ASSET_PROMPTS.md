# ПРОМПТЫ ДЛЯ ГЕНЕРАЦИИ АССЕТОВ

Промпты написаны под Nano Banana 2 / Gemini 3 Pro Image, но подойдут любой
модели. Сами промпты — на английском: на нём модели держат стиль заметно
стабильнее, чем на русском.

---

## КАК ЭТИМ ПОЛЬЗОВАТЬСЯ

### 1. Сначала референс, потом лист

Не проси сразу спрайт-лист. Ни одна модель не удержит одного и того же
персонажа одинаковым в шестнадцати клетках с первой попытки.

1. Сгенерируй **один кадр** — персонаж стоит лицом к камере.
2. Отбирай, пока не понравится.
3. Скорми этот кадр обратно **как референс-картинку** и проси лист:
   «using this exact character, generate a 4x4 sprite sheet…».

Nano Banana 2 хорошо держит персонажа по картинке-референсу. Это разница
между «похожие существа» и «один и тот же враг».

### 2. Фон

Проси прозрачный фон. Если модель всё равно рисует подложку — добавь в конец:

```
Solid uniform pure magenta background #FF00FF, absolutely flat, no gradient,
no texture, no shadow on the background.
```

Магенту потом вырезаешь за секунду (в GIMP: Цвет → Цвет в альфа-канал).
Магента выбрана специально: в палитре игры такого цвета нет, вырежется
ровно фон и ничего больше.

### 3. Размеры и сетка

Генерируй квадрат 1:1 в 1K или 2K, потом при необходимости уменьшай.
`frame` в config.js — это **сторона одной клетки в файле**, то есть
ширина файла / число колонок.

| Что            | Файл      | Сетка | frame |
|----------------|-----------|-------|-------|
| Рядовой враг   | 1024x1024 | 4x4   | 256   |
| Босс           | 1024x1024 | 4x4   | 256   |
| Снаряд         | 256x256   | 1x1   | 256   |
| Взрыв/эффект   | 1024x256  | 4x1   | 256   |
| Иконка HUD     | 128x128   | 1x1   | —     |
| Тайл земли     | 512x512   | 1x1   | —     |

Уже лежащие в репозитории враги сделаны в 512x512 с `frame: 128` — обе
схемы рабочие, движок просто масштабирует под `display`.

### 4. Порядок рядов у существ с четырьмя направлениями

Ряды **сверху вниз**: спиной к камере → вправо → лицом к камере → влево.
Именно этот порядок ждёт `dirRows: {up:0, right:1, down:2, left:3}`.

Если модель не тянет четыре направления — сгенерируй один ряд «лицом к
камере» и поставь в конфиге `row: 0, mirror: true`: движок будет зеркалить
спрайт по направлению движения. Так сделаны Спороносец и Летучая Спора.

---

## БАЗА СТИЛЯ

**Этот блок вставляй в начало каждого промпта.** Он и держит всё в одном
визуальном языке.

```
Pixel art sprite for a top-down survival game, 16-bit SNES era style.
Chunky readable pixels, hard edges, no anti-aliasing, no blur, no modern
soft shading. Three-quarter top-down view, camera looking down at about
60 degrees.

Colour palette, use only these: deep forest green #1a3d2e, near-black green
#0d1f15, fungal purple #6b2d5c, toxic yellow #c4a000, bioluminescent teal
#00d4aa, acid green #39ff14, worn leather brown #5c3a21, gas-mask black
#2a2a2a, spore grey #8a8a8a.

Setting: a dark post-apocalyptic world swallowed by giant mutated fungi.
Everything is grimy, damp and muted; the only bright light comes from
glowing fungus. Grim but not gory.

Fully transparent background, nothing behind the subject, no ground plane,
no cast shadow, no border, no frame, no text, no watermark, no labels.
```

---

## ВРАГИ

### Плодовое Тело — СПРАЙТА НЕТ, рисуется кружком

Самый нужный из всех. Медленно ползёт, не бьёт при касании, взрывается ядом
при смерти. Должен читаться как «ходячая бомба, к которой лучше не подходить».

```
[БАЗА СТИЛЯ]

A 4x4 sprite sheet, 16 frames in a strict even grid, each cell 256x256
pixels, the creature centred in its cell, identical scale in every cell,
no gaps between cells, no cell borders.

Subject: "Fruit Body" — a bloated crawling fungal sac the size of a large
dog. A swollen translucent purple #6b2d5c membrane stretched over a mass of
churning toxic yellow #c4a000 spores that glow faintly through the skin. No
head, no eyes. It drags itself forward on four short stubby root-legs. The
membrane bulges and pulses as if about to burst; hairline cracks leak thin
wisps of yellow spore dust.

Rows top to bottom are four facing directions: back to camera, facing right,
facing camera, facing left. The four columns of each row are a slow crawling
cycle: the sac inflates, the legs pull, the sac lurches forward, the legs
reset.
```

Конфиг после генерации:

```js
// config.js → assets.images
enemy_fruit_body: "assets/images/enemies/fruit_body.png",

// config.js → enemies.types.fruit_body — заменить sprite: null на
sprite: { key:"enemy_fruit_body", frame:256, cols:4, rows:4,
          dirRows:{up:0,right:1,down:2,left:3}, animSpeed:12, display:76 },
```

### Мицелиевое Щупальце — СПРАЙТА НЕТ, рисуется кружком

Вырастает из земли и держит игрока. Неподвижное, направления не нужны —
хватит одного ряда из четырёх кадров.

```
[БАЗА СТИЛЯ]

A single horizontal strip of 4 frames, each cell 256x256 pixels, evenly
spaced, no gaps, no borders. Same subject in every frame, identical scale
and position.

Subject: "Mycelium Tentacle" — a thick fungal tendril bursting up out of
the soil. Rubbery purple-grey #6b2d5c flesh wrapped in pale mycelium
threads, ringed with small teal #00d4aa bioluminescent nodes that pulse.
The tip splits into four grasping hooked barbs. Around its base the earth
is broken open in a ring of torn dirt and pale root-threads.

The 4 frames are a writhing idle loop: the tendril leans left, straightens,
leans right, straightens, barbs opening and closing slightly.
```

```js
enemy_tentacle: "assets/images/enemies/mycelium_tentacle.png",

sprite: { key:"enemy_tentacle", frame:256, cols:4, rows:1,
          row:0, animSpeed:8, display:64 },
```

### Спороносец, Грибной Волк, Летучая Спора — перегенерация

Спрайты есть, но если захочешь ровнее — вот их промпты.

**Спороносец** (медленный, облако спор при смерти):

```
[БАЗА СТИЛЯ]

A 4x4 sprite sheet, 16 frames in a strict even grid, each cell 256x256
pixels, creature centred, identical scale in every cell.

Subject: "Spore Bearer" — a peasant long since taken by the fungus. The
head is gone, replaced by a heavy drooping purple #6b2d5c mushroom cap that
overhangs the shoulders and hides the face. Rotting linen shirt and trousers
in grey #8a8a8a, torn open at the chest where pale mycelium has grown out
through the ribs. Glowing purple veins run under the skin of the arms. Both
arms hang forward, shambling.

Rows top to bottom: back to camera, facing right, facing camera, facing
left. Columns are a slow shambling walk cycle.
```

**Грибной Волк** (быстрый, споровый след):

```
[БАЗА СТИЛЯ]

A 4x4 sprite sheet, 16 frames in a strict even grid, each cell 256x256
pixels, creature centred, identical scale in every cell.

Subject: "Mushroom Wolf" — a lean starved wolf overtaken by fungus. Matted
brown #5c3a21 fur; a crest of small purple #6b2d5c mushroom caps grows
along the spine from skull to tail. The muzzle is split by pale bracket
fungus and the eyes glow acid green #39ff14. Ribs show through the flank.
Low predatory stance, head down, running.

Rows top to bottom: back to camera, facing right, facing camera, facing
left. Columns are a fast four-beat running cycle.
```

**Летучая Спора** (зигзаг, токсичный след):

```
[БАЗА СТИЛЯ]

A 4x4 sprite sheet, 16 frames in a strict even grid, each cell 256x256
pixels, creature centred, identical scale in every cell.

Subject: "Spore Bat" — a small bat whose body has become a puffball. Black
#2a2a2a leathery wings, a round grey #8a8a8a spore sac for a torso that
puffs a thin trail of yellow #c4a000 dust. Eyeless; the face is a ring of
tiny teal #00d4aa glowing points. Seen from slightly above, wings spread.

Every row is the same front view of the bat, four columns are one wingbeat:
wings fully up, mid-downstroke, fully down, mid-upstroke.
```

### Новые враги — ТРЕБУЮТ КОДА

Картинку сгенерировать можно хоть сейчас, но чтобы враг заработал, ему нужен
тип в `config.js → enemies.types` и, если способность новая, ветка в
`Enemy.update`. Проще всего начинать с врагов, которые переиспользуют уже
написанные способности (`spore_trail`, `explode_on_death`, `zigzag_flight`).

**Плесневый Стрелок** — держит дистанцию и плюётся спорами. Первый в игре
дальнобойный враг: заставляет двигаться, а не только кайтить толпу.

```
[БАЗА СТИЛЯ]

A 4x4 sprite sheet, 16 frames in a strict even grid, each cell 256x256
pixels, creature centred, identical scale in every cell.

Subject: "Mould Spitter" — a hunched humanoid whose torso has split open
into a wide funnel-shaped fungal mouth aimed forward. Grey-green mottled
skin, thin bowed limbs, no head — the neck ends in a knot of pale mycelium.
The funnel throat glows toxic yellow #c4a000 from deep inside. Long thin
arms braced on the ground for recoil.

Rows top to bottom: back to camera, facing right, facing camera, facing
left. Columns are a spit attack: throat closed, throat swelling and
brightening, funnel flared wide open firing, recoil.
```

**Гнилой Титан** — элитный, редкий, много HP, медленный.

```
[БАЗА СТИЛЯ]

A 4x4 sprite sheet, 16 frames in a strict even grid, each cell 256x256
pixels, creature centred, identical scale in every cell.

Subject: "Rot Titan" — a huge lumbering brute grown from fused corpses and
bracket fungus, twice the height of a man, heavy and slow. Shelf-like
brown #5c3a21 bracket mushrooms armour the shoulders and back like plates.
One arm has swollen into an enormous club-shaped fruiting body. The chest
cavity is open and packed with glowing acid green #39ff14 spore mass. Tiny
sunken purple eyes.

Rows top to bottom: back to camera, facing right, facing camera, facing
left. Columns are a heavy slow walk cycle with the weight shifting
side to side.
```

---

## БОССЫ

Оба босса уже есть. Промпты — на случай перегенерации или третьего босса.

Важно: у Мицелиевой Сердцевины **ряды листа = фазы по остатку HP**
(`phaseRows: true`), а не направления. Ряд 0 — целый босс, ряд 3 — почти
убитый. Это редкая, но очень выигрышная схема: босс визуально звереет.

**Третий босс — Споровый Улей** (для волны 30):

```
[БАЗА СТИЛЯ]

A 4x4 sprite sheet, 16 frames in a strict even grid, each cell 256x256
pixels, the boss centred, identical scale in every cell.

Subject: "Spore Hive" — a colossal hanging fungal hive rooted to the ground
by a thick braided stalk, wider than it is tall. The outer shell is layered
grey #8a8a8a papery fungus like a wasp nest. Dozens of dark open tubes
honeycomb the front face, and pale larvae-like spore pods squirm inside
them. Rings of teal #00d4aa light pulse deep in the openings. Roots of
purple #6b2d5c mycelium spread from the base.

The four rows top to bottom are four damage stages of the same hive, always
seen from the same front angle:
row 1 — intact and sealed, lights calm and dim;
row 2 — the shell is cracked along one side, a few tubes torn open, lights
brighter;
row 3 — half the shell has broken away exposing the glowing spore mass
inside, tubes venting dust;
row 4 — nearly destroyed, the shell hanging in shreds, the core blazing
acid green #39ff14, the stalk splitting.

Within each row the 4 columns are one breathing pulse of that stage: the
hive contracts, holds, swells, releases.
```

```js
boss_spore_hive: "assets/images/bosses/spore_hive.png",

// config.js → bosses
spore_hive: {
  name: "Споровый Улей", hp: 2000, speed: 0, radius: 55, damage: 18, xpReward: 500,
  color: { body: ["#8a8a8a","#00d4aa","#39ff14"] },
  sprite: { key:"boss_spore_hive", frame:256, cols:4, rows:4,
            phaseRows:true, animSpeed:8, display:170 },
  abilities: ["spawn_minions","sneeze_burst"],
  sneezeInterval: 150, sneezeCooldown: 80,
  minionType: "spore_bat", minionCount: 5, sporeCloudRadius: 140
}
```

---

## ОРУЖИЕ И СНАРЯДЫ

Снаряд — **один кадр**, движок сам вращает его по направлению полёта.
Поэтому рисуй склянку **летящей вправо**, горизонтально.

### Существующие три

```
[БАЗА СТИЛЯ]

A single centred object on transparent background, 256x256 pixels, one
frame only, no grid, no sheet.

Subject: a thrown alchemist's vial seen from above, flying to the RIGHT
horizontally. A stubby round glass flask with a cork stopper and a leather
grip wrap. [ЗАЛИВКА]. A short motion trail of three or four droplets
streams off behind it to the left.
```

Подставь вместо `[ЗАЛИВКА]`:

- **Антидот** (`potion.png`): `The glass is filled with bright bioluminescent teal #00d4aa liquid that glows and lights the cork from inside`
- **Токсичная** (`vial_toxic.png`): `The glass is filled with thick churning toxic yellow #c4a000 sludge with darker sediment settling at the bottom`
- **Зажигательная** (`vial_fire.png`): `The glass is filled with orange-red burning fluid; a rag fuse is stuffed in the neck and already alight with a small flame`

### Новые стволы — ТРЕБУЮТ КОДА

Новый ствол — это запись в `config.js → weapons` плюс карточка в
`upgradeSystem.js`. Если у ствола обычное поведение «летит и взрывается»,
кода писать не надо вообще — хватит конфига. Ниже как раз такие.

**Споровый дробовик** — веер из трёх снарядов в упор. Единственная правка
кода: `Weapon.fire` должен уметь вернуть несколько снарядов вместо одного.

```
[БАЗА СТИЛЯ]

A single centred object on transparent background, 256x256 pixels, one
frame only.

Subject: a dense cone-shaped burst of sharp spore shards flying to the
RIGHT, seen from above. Dozens of small angular grey #8a8a8a and purple
#6b2d5c splinters spreading outward in a tight fan, the shards nearest the
front sharpest and brightest, trailing a haze of fine dust behind.
```

**Мицелиевый гарпун** — пробивает всех на линии.

```
[БАЗА СТИЛЯ]

A single centred object on transparent background, 256x256 pixels, one
frame only.

Subject: a barbed harpoon of hardened white mycelium flying to the RIGHT
horizontally, seen from above. A pale ribbed bone-like shaft with three
backward-facing hooked barbs at the tip, wrapped in living fungal threads
that glow teal #00d4aa. A thin taut thread of mycelium trails off behind it
to the left.
```

**Кислотный шар** — оставляет лужу, как токсичная склянка.

```
[БАЗА СТИЛЯ]

A single centred object on transparent background, 256x256 pixels, one
frame only.

Subject: a wobbling sphere of acid green #39ff14 caustic slime flying to the
RIGHT, seen from above. The surface bulges and drips; the leading edge is
flattened by the speed and the rear stretches into a short tail of falling
droplets. A pale toxic haze surrounds it.
```

Конфиг нового ствола:

```js
// config.js → weapons
acid: {
  name: "Кислотный шар", desc: "Лужа кислоты по площади",
  sprite: "acid_ball", frame: 256, display: 34,
  interval: 60, damage: 0.8, speed: 4, radius: 7, range: 280,
  burst: { key: "fx_burst_toxic", frame: 128, cols: 4, display: 96, speed: 4 },
  area: { radius: 90, damage: 0.5, dot: { dps: 8, time: 150 } }
}

// upgradeSystem.js → allUpgrades
{id:"w_acid",title:CONFIG.weapons.acid.name,desc:CONFIG.weapons.acid.desc,
 category:"weapon",available:(p)=>!p.hasWeapon("acid"),
 effect:(p)=>{p.addWeapon("acid");}},
```

---

## ЭФФЕКТЫ

Эффект — **4 кадра в один горизонтальный ряд**, файл 1024x256.
Кадры идут от вспышки к затуханию, последний почти прозрачный.

**Вспышка выстрела** (сейчас её нет вообще — бросок ничем не отмечен):

```
[БАЗА СТИЛЯ]

A single horizontal strip of 4 animation frames, each cell 256x256 pixels,
evenly spaced, no gaps, no borders. The effect centred in each cell.

Subject: a small burst of teal #00d4aa spore dust puffing outward, seen from
above, as if a vial has just been thrown. Frame 1: a tight bright compact
puff. Frame 2: expanded to double size, brightest, with a few flecks
flying outward. Frame 3: wide, thinning, breaking into separate wisps.
Frame 4: a faint almost-gone haze of scattered specks.
```

**Смерть врага** (сейчас — просто разлёт кружков):

```
[БАЗА СТИЛЯ]

A single horizontal strip of 4 animation frames, each cell 256x256 pixels,
evenly spaced, no gaps, no borders.

Subject: a fungal creature collapsing into spores, seen from above. Frame 1:
a dense purple #6b2d5c cloud bursting from a central point with dark chunks
of fungal matter flying out. Frame 2: the cloud wide and roiling, chunks
tumbling outward and beginning to fall. Frame 3: the cloud thinning to
drifting grey #8a8a8a dust, chunks landing. Frame 4: only a faint settling
haze and a few dark specks on the ground.
```

**Разбитый щит**:

```
[БАЗА СТИЛЯ]

A single horizontal strip of 4 animation frames, each cell 256x256 pixels,
evenly spaced, no gaps, no borders.

Subject: a circular bioluminescent barrier shattering, seen from above.
Frame 1: a complete thin ring of teal #00d4aa light with a faint hexagonal
pattern inside it. Frame 2: the ring cracks in several places and flares
bright. Frame 3: it breaks into curved glowing shards flying outward.
Frame 4: only a few fading sparks remain.
```

---

## ИКОНКИ ИНТЕРФЕЙСА

Иконки в HUD — обычные `<img>` в `index.html`. Есть: споры, черепа, время.
**Нет: HP и опыта** — в строках «HP» и «Опыт» стоят пустые слоты. И ещё две
позиции в `.stats` до сих пор нарисованы эмодзи (`🌊` волна, `🪙` монеты),
что посреди пиксель-арта смотрится чужеродно.

Общий промпт, меняется только `[ПРЕДМЕТ]`:

```
[БАЗА СТИЛЯ]

A single game UI icon, 128x128 pixels, one object centred on transparent
background, no grid, no frame, no text. Bold and simple enough to stay
readable when shown at 20x20 pixels: few large shapes, strong silhouette,
high contrast, no fine detail.

Subject: [ПРЕДМЕТ]
```

- **HP** (`icon_hp.png`): `an anatomical heart overgrown with fungus, deep blood red with pale mycelium threads creeping across its surface and one small purple mushroom cap sprouting from the top`
- **Опыт** (`icon_xp.png`): `a faceted glowing crystal shard of condensed spore energy, bright bioluminescent teal #00d4aa, radiating a soft halo`
- **Волна** (`icon_wave.png`): `a curling wave made of purple #6b2d5c spore dust rolling forward, stylised into a single bold curved shape`
- **Монеты** (`icon_coin.png`): `a tarnished pre-collapse coin, worn gold #c4a000, with a mushroom cap stamped in relief on its face and green corrosion in the grooves`

Как подключить — в `index.html`:

```html
<span class="icon-slot"><img class="icon" src="assets/images/ui/icon_hp.png" alt=""></span>
```

---

## ЛУТ, ДЕКОРАЦИИ, ЗЕМЛЯ

Всё это уже есть, но правила пригодятся, когда захочешь добавить своё.

**Лут.** Один предмет или полоса кадров в один ряд. `drop_crystal` — четыре
кадра по возрастанию номинала, `drop_xp_orb` — пять кадров анимации мерцания.

**Декорации** (`props/`). Прозрачный фон обязателен, **точка опоры — низ по
центру**: рисуй объект стоящим на земле, не в воздухе. Коллизий у декораций
нет, они чистый фон.

```
[БАЗА СТИЛЯ]

A single game prop object, 512x512 pixels, transparent background, seen
from a three-quarter top-down angle. The object stands on the ground with
its base at the bottom edge of the image, nothing floating.

Subject: [ОБЪЕКТ]
```

**Земля.** Главное требование — **бесшовность**, иначе стыки тайлов видно
на всю арену. И текстура должна быть тёмной и спокойной: на ней стоят враги,
и если земля пёстрая, силуэты в ней тонут.

```
Seamless tileable pixel art texture, 512x512, 16-bit style, top-down view.
[БИОМ]. Very dark and low contrast overall, muted, no bright spots, no
single large feature that would obviously repeat, no lighting gradient
across the tile. The pattern must tile seamlessly on all four edges with no
visible seam.
```

Где `[БИОМ]` — например:
`A floor of dead pine needles and black soil threaded with pale glowing
mycelium veins and scattered tiny purple mushrooms`
