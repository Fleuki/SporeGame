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

### 2. Фон — ВСЕГДА МАГЕНТА, НИКОГДА «прозрачный»

Раньше здесь стояло «проси прозрачный фон, а магента — если не выйдет».
Теперь наоборот, и вот почему.

**Просьба «transparent background» почти всегда даёт не прозрачность, а
НАРИСОВАННУЮ СЕРУЮ ШАХМАТКУ.** Модель видела тысячи превью прозрачных PNG и
честно рисует то, как прозрачность выглядит. Файл при этом открывается как
PNG, у него даже бывает альфа-канал — но альфа целиком равна 255, а клетки
лежат обычными пикселями поверх картинки.

Проверено на листе элиты: `PNG RGBA 4128x1024`, прозрачных пикселей 0.0%,
клетка шахматки 51,5 px (дробная, с шумом ±2 по яркости — то есть картинка
ещё и пережата где-то по дороге).

**И это не чинится постобработкой.** Твёрдые части силуэта снять с подложки
можно, а всё полупрозрачное — свечение, дымку, искры — нельзя: под ними
лежала смесь «свечение + клетка», и что именно было сверху, в файле не
записано. Попытка выдаёт шипы начисто и серые квадраты в ореоле.

Поэтому в конец **каждого** промпта на спрайт идёт:

```
Solid uniform pure magenta background #FF00FF, absolutely flat, no gradient,
no texture, no shadow on the background. Do NOT draw a transparency
checkerboard pattern, no grey and white squares, no chequered backdrop.
```

Магента вырезается точно и вместе с полупрозрачными краями: фон один
известный цвет, и по нему считается и прозрачность, и настоящий цвет
пикселя. В палитре игры магенты нет, поэтому вырежется ровно фон.

**Чем резать.** В репозитории лежит `tools/cut_key.py` — он снимает ключ и
заодно, если попросить, пересобирает лист в ровную сетку с центрированием
каждого кадра (модели возвращают кадры разного размера и съехавшие в сторону,
а движок делит лист на равные клетки):

```
python3 tools/cut_key.py вход.png docs/assets/images/ui/emblem.png --mode pale
python3 tools/cut_key.py вход.png docs/assets/images/effects/acid_pool.png --mode grey --grid 4x1 --cell 256 --anchor
```

**У скрипта три режима, и выбирать их надо глазами.** Кеинг недоопределён:
в пикселе три числа, а неизвестных четыре (цвет и прозрачность), поэтому
алгоритм добавляет допущение о том, каким бывает рисунок.

* по умолчанию — «рисунок насыщенный». Верно для золота, бирюзы, почти
  любого спрайта. Бледное съедает: кремовая нить это высокий красный и
  высокий синий, по такой мерке «в основном фон», и она станет прозрачной;
* `--mode pale` — «рисунок не перекошен в сторону ключа». Спасает кремовое и
  белое, но золотой ореол от него розовеет;
* `--mode grey` — фон СЕРЫЙ, а не магентовый: спасательный круг на случай,
  когда бот всё-таки нарисовал шахматку. Ключом служит насыщенность, поэтому
  годится, только если в рисунке нет своих бесцветных мест. На кислотной
  луже сработал (109..166 против 0..2), на кроне элиты не сработал бы —
  её шипы почти серые.

Правило: фон магентовый и в картинке есть кремовое, белое, бледное — `pale`;
фон магентовый и всё насыщенное — обычный; фон серый (шахматка) и в рисунке
нет бесцветного — `grey`. Проверять итог обязательно на ТЁМНОМ фоне: на
светлом розовый подмес и съеденная альфа не видны.

Чего скрипт не делает ни в каком режиме — не считает альфу по расстоянию до
ключа: оно растёт нелинейно, мягкий край получает завышенную альфу, и вокруг
спрайта остаётся розовая кайма.

Если скрипт напишет «прозрачного почти нет» — значит фон опять нарисованный,
и надо перегенерировать, а не подбирать пороги.

**Сохранение с телефона.** «Сохранить изображение» в Фото пережимает и часто
отдаёт JPEG со вклеенной подложкой. Надёжнее: «Поделиться» → **«Сохранить в
Файлы»**, и отправлять файл из Файлов, а не из Фото. Но при магентовом фоне
это уже не критично: сплошной цвет переживает пережатие, шахматка — нет.

### 3. Если вышел не пиксель-арт

Самая частая осечка: модель выдаёт гладкую иллюстрацию с градиентами, мягкой
обводкой и антиалиасингом. Картинка сама по себе может быть отличной, но рядом
с пиксельными врагами это видно сразу.

**Чинится без перегенерации.** Уменьши картинку до 64x64 **билинейно**, потом
увеличь обратно до 256 **методом «ближайший сосед»** (в GIMP: Изображение →
Размер изображения → Интерполяция: Нет). Пиксельная сетка появится
принудительно, и объект сядет в общий стиль.

Если хочется добиться этого сразу в промпте — добавляй в конец жёстче обычной
базы:

```
Rendered on a strict 64x64 pixel grid, every pixel a visible hard square,
absolutely no anti-aliasing, no soft gradients, no smooth outlines, no glow
blur. Limited palette of at most 16 flat colours. Looks like a sprite from
a Super Nintendo game, not like a digital painting.
```

И следи за размером файла: модели любят отдавать 4096x4096. Для снаряда,
который на экране занимает 32 пикселя, это 64 МБ в памяти браузера ни за что.
Уменьшай до указанных в таблице размеров перед тем, как класть в репозиторий.

### 4. Размеры и сетка

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

### 5. Порядок рядов у существ с четырьмя направлениями

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

Solid uniform pure magenta background #FF00FF, absolutely flat, no gradient,
no texture, no shadow on the background. Do NOT draw a transparency
checkerboard pattern, no grey and white squares, no chequered backdrop.
Nothing behind the subject, no ground plane, no cast shadow, no border,
no frame, no text, no watermark, no labels.
```

**В этом блоке раньше стояло «Fully transparent background».** Именно эта
строка и приводила к нарисованной шахматке — см. пункт 2 выше. Просить
прозрачность бесполезно: модель рисует то, КАК прозрачность выглядит.
Магента же снимается точно, скриптом `tools/cut_key.py`.

---

## ИГРОК

### Лист БЕГА — САМЫЙ НУЖНЫЙ ИЗ ВСЕГО СПИСКА

Сейчас в игре один лист алхимика, `alchemist_purple.png`. Он даёт четыре
направления, но **шага в нём нет**: кадры внутри ряда — это лёгкое переминание
плюс движение рук, а ноги закрыты плащом и почти не двигаются. Поэтому бег и
не читается как бег.

Движок уже готов принять отдельный лист бега. Положи файл как
`assets/images/player/alchemist_run.png` — и он подхватится сам, без правок
кода: на ходу играет он, на месте остаётся старый лист поз. Файла нет — игра
работает как сейчас.

**Формат жёсткий** (задан в `CONFIG.player.walk*`): сетка **6 колонок x 4
ряда**, кадр **256x256**, итоговый файл **1536x1024**.

Порядок рядов ОБЯЗАН совпадать с листом поз, иначе персонаж снова побежит
влево, а смотреть будет вправо. Порядок такой:

| ряд | что в нём |
|-----|-----------|
| 0   | лицом НА КАМЕРУ (герой бежит вниз, на зрителя) |
| 1   | в три четверти ВПРАВО (маска и хобот смотрят вправо) |
| 2   | в три четверти ВЛЕВО (зеркало ряда 1) |
| 3   | СО СПИНЫ (виден капюшон, герой бежит вверх) |

Внимание: у листа поз порядок именно такой — 1 вправо, 2 влево. В коде
полгода стояло наоборот, и это был баг. Сверяй по картинке, а не по памяти.

```
[БАЗА СТИЛЯ]

A 6x4 sprite sheet, 24 frames in a strict even grid, each cell 256x256
pixels, character centred in every cell, identical scale and identical
ground line in every cell.

Subject: the same plague-alchemist as the reference — a short, stocky figure
in a heavy brown hooded cloak over a dusty violet tunic, a round riveted gas
mask with two green glass lenses and a ribbed hose curling down from the
snout, a belt of glowing violet potion flasks, a brass-and-bone charm
hanging at the hip.

All four rows are a RUN CYCLE, six frames each: contact, down, passing,
lift, contact on the other foot, passing back. The legs must clearly
alternate and the cloak must swing behind the direction of travel — this is
the whole point of the sheet. Slight vertical bob between frames, the hose
and the flasks trail one frame behind the body.

Rows top to bottom:
  row 1 - running toward the camera, face and lenses fully visible
  row 2 - running to the RIGHT in three-quarter view, mask and hose to the right
  row 3 - running to the LEFT in three-quarter view, exact mirror of row 2
  row 4 - running away from the camera, only the hood and cloak back visible
```

Если модель не тянет 24 кадра за раз — генерируй по одному ряду (лист
1536x256) и склей четыре полосы в столбик. Главное, чтобы масштаб и линия ног
совпадали: иначе персонаж будет прыгать при смене направления.

**Размер файла значения не имеет.** Движок считает размер кадра из самой
картинки по `walkCols`/`walkRows` — важна только СЕТКА, то есть сколько кадров
в ряду и сколько рядов. Первая версия листа вышла 2048x2048 при заказанных
1536x1024, и это ничему не помешало.

### Что в итоге сработало

Ключ — **генерировать ПО ОДНОМУ РЯДУ** и описывать каждый кадр отдельной
строкой («левая нога впереди», «в воздухе», «правая нога впереди»,
«в воздухе»). Пока просили лист 4x4 целиком, модель выдавала одну и ту же
позу в четырёх экземплярах: сравнение силуэтов давало 12-20% различий, то
есть шага не было. Полоса из четырёх кадров с описанием каждого дала честный
цикл контакт-полёт-контакт-полёт, различие соседних кадров 68%.

Вид сбоку достаточно нарисовать ОДИН раз: второй профиль получается зеркалом
при сборке листа, и это нормальная практика. Итого на полный лист нужно ТРИ
полосы: профиль, на камеру, со спины.

Числа для сравнения (различие соседних кадров, силуэты приведены к одному
размеру): полоса профиля 68%, полоса «на камеру» 60-63%, полоса «со спины»
48%, а те же направления в листе 4x4 целиком — 12-20%, то есть шага там нет
вовсе.

ПРОВЕРЯЙ НЕ ТОЛЬКО СОСЕДНИЕ КАДРЫ, А ПЕРВЫЙ С ТРЕТЬИМ. Это два контакта, и в
них должна стоять РАЗНАЯ нога. У профиля они расходятся на 39%, у вида на
камеру на 35%, а у вида со спины — на 5%: там модель нарисовала одну и ту же
позу дважды, и ряд играет как подпрыгивание в два такта, а не как бег.
Подменить второй контакт зеркалом первого нельзя — вид со спины отличается от
собственного зеркала на 33-42% (сумка и драпировка плаща несимметричны), сумка
перескакивала бы с боку на бок.

Ещё модель любит подрисовывать МОТИОН-БЛЮР у ног. В пиксель-арте его быть не
должно, и снятием фона он не убирается — он нарисован поверх персонажа. Проси
«no motion blur, no speed lines, crisp pixels only».

Что модель так и не смогла, сколько ни проси, — **настоящую прозрачность**.
За четыре попытки: дважды она РИСОВАЛА шахматку (узор, которым редакторы
показывают прозрачный фон), один раз положила плоский серый, один раз выдала
PNG с полностью непрозрачным альфа-каналом. Просить перестань — планируй, что
фон снимается заливкой по цветности: фон ахроматичен, а плащ и склянки
цветные. Из всех вариантов удобнее всего ПЛОСКИЙ ОДНОТОННЫЙ фон, его и проси.

И проси НЕ РИСОВАТЬ линию земли: в полосе профиля она попала прямо в картинку
чёрной чертой под ногами, её пришлось обрезать.

Ещё две вещи, которые чинятся только обработкой, — проси, но не рассчитывай:
- **разный размер фигуры между кадрами** (в полосе кадры полёта вышли на 13%
  крупнее кадров контакта);
- **высота подскока**: в полосе он 100 пикселей при росте фигуры 680, то есть
  15%. При росте персонажа на экране в 64 пикселя это девять пикселей
  вверх-вниз — прыжки, а не бег. При сборке оставлена половина.

Если генерируешь ряд отдельной полосой, не забудь: линию земли модель рисует
прямо в картинку, её надо обрезать, иначе она попадёт в кадр как чёрная
полоса под ногами.

---

### Что пошло не так в первой версии листа — правь промпт этим

Лист от бота пришёл рабочим, но по четырём пунктам разошёлся с заказом. Всё
это чинилось руками, но лучше получать сразу правильно:

1. **JPEG на сплошном сером фоне вместо PNG с прозрачностью.** Самое дорогое:
   фон пришлось вырезать заливкой по цветности, а компрессия JPEG оставляет по
   краю силуэта кайму, которой в пиксель-арте быть не должно. Требуй PNG и
   прозрачность отдельной строкой, а если модель не умеет альфу — проси
   ОДНОТОННЫЙ ярко-зелёный фон (#00ff00), его снять чище, чем серый: серый
   слишком близок к маске и камню.
2. **Ряды вышли разного масштаба** — вид спереди заметно мельче вида сбоку.
   В игре персонаж менял бы рост при каждом развороте. Проси явно: одинаковая
   высота фигуры и одна линия ног во ВСЕХ шестнадцати кадрах.
3. **Снаряжение гуляет от кадра к кадру**: где-то две склянки на поясе, где-то
   три, а в одном кадре в руках появляется свиток, которого нет больше нигде.
   Проси: один и тот же набор предметов в каждом кадре.
4. **В рядах «на камеру» и «со спины» ног не видно** — их закрывает плащ, и
   эти два направления читаются как скольжение, а не бег. Виды сбоку при этом
   получились отлично. Проси для этих рядов плащ короче или распахнутым, и
   чтобы из-под подола явно торчали переставляемые ноги.

---

## ВРАГИ

### Плодовое Тело — НОСИТ ЧУЖОЙ СПРАЙТ

Кружком с глазами оно больше не рисуется, но своего листа у него так и нет:
сейчас берётся нулевой ряд листа Материнской Капли, уменьшенный до 82. То
есть рядовой враг — это уменьшенный босс, и босс от этого перестаёт быть
событием.

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

### Мицелиевое Щупальце — НОСИТ ЧУЖОЙ СПРАЙТ

Сейчас это нижний ряд листа Мицелиевой Сердцевины. Неподвижное, направления
не нужны — хватит одного ряда из четырёх кадров.

Важно для позы: щупальце больше **не держит игрока, а замедляет вдвое**.
Значит нужна не хватка, а зацеп — барбы на конце загнуты назад, к земле,
будто тянут за ноги, а не сомкнуты в кулак.

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

**Споровый Трубач** (дальнобойный) — лист уже есть, промпт на случай
перегенерации. У этого листа **колонки — не шаги, а фазы одного действия**:
мешок на спине раскрывается в раструб. Движок крутит их не по таймеру, а по
прогрессу замаха (`SpriteAnim.hold`, см. `enemy.js`), поэтому кадр 0 обязан
быть «труба закрыта» — именно его враг показывает, пока просто идёт.

```
[БАЗА СТИЛЯ]

A 4x4 sprite sheet, 16 frames in a strict even grid, each cell 256x256
pixels, creature centred, identical scale in every cell, feet on a common
baseline.

Subject: "Spore Piper" — a gaunt, long-limbed humanoid the colour of wet
moss #7d8f6a, hunched forward on four thin limbs. A dusty violet #6b2d5c
spore sac grows from its shoulders; the sac opens into a wide funnel whose
throat glows toxic yellow #c4a000. A crown of pale bone spikes on the skull.

Rows top to bottom: back to camera, facing right, facing camera, facing
left. Columns are NOT a walk cycle: they are one inflation of the funnel —
sac fully closed, cracking open, half open with the throat lit, fully flared
and about to fire.
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

**Третий босс — Споровый Улей** (третий в очереди боссов, двенадцатая минута
забега):

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

Два правила, которые важнее красоты самого спрайта:

1. **Объект должен быть компактным и вытянутым вдоль полёта.** Движок вращает
   картинку вокруг центра. Всё, что торчит вбок — широкий веер, длинный
   разлетевшийся шлейф, — при повороте начинает заметно «вилять». Веер
   осколков и облако брызг годятся как ЭФФЕКТ выстрела, но не как снаряд.
2. **Шлейф рисовать не надо.** Движок сам добавляет свечение и хвост из
   затухающих точек по полю `glow` в конфиге ствола. Нарисованный хвост
   сложится с ним в кашу — рисуй только сам летящий объект.

```js
// config.js → weapons.<ствол> — цвет свечения и хвоста
sprite: "projectile", frame: 256, display: 32, glow: "#00d4aa",
```

На 32 пикселях деталей склянки всё равно не разобрать: читается именно
движущееся яркое пятно. Поэтому силуэт важнее рисунка.

### Существующие три

```
[БАЗА СТИЛЯ]

A single centred object on solid magenta #FF00FF background, 256x256 pixels, one
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

A single centred object on solid magenta #FF00FF background, 256x256 pixels, one
frame only.

Subject: a single sharp spore shard flying to the RIGHT, seen from above.
One narrow angular splinter of hardened fungus, pale grey #8a8a8a along the
leading edge darkening to purple #6b2d5c at the back, chipped crystalline
surface. Compact and elongated along the direction of flight, no trail, no
motion streaks, no additional fragments.
```

Веер осколков как отдельная картинка — это уже РЕЗУЛЬТАТ выстрела, а не
летящий снаряд: широкий конус при вращении по направлению полёта заметно
виляет. Если такая картинка уже сгенерирована, ей место среди эффектов
(вспышка у ствола), а снарядом ставь одиночный осколок выше.

**Мицелиевый гарпун** — пробивает всех на линии.

```
[БАЗА СТИЛЯ]

A single centred object on solid magenta #FF00FF background, 256x256 pixels, one
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

A single centred object on solid magenta #FF00FF background, 256x256 pixels, one
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

**Вспышка выстрела.** Анимации броска у героя нет вообще — выстрел
отмечается вспышкой в точке вылета. Сейчас она собрана из частиц; спрайт её
заменит и будет наряднее:

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

Иконки в HUD — обычные `<img>` в `index.html`. Есть: споры, время, череп
(экран итогов).

**Иконки HP больше не нужно рисовать.** Шкалы здоровья и спор — это резные
каменные рамки (`bar_hp_*.png`, `bar_spore_*.png`), они отличаются друг от
друга и формой наростов, и цветом свечения; иконка рядом с такой шкалой
только шумит. Слот `.icon-slot` из разметки убран вместе со старыми
текстурами `bar_frame.png` / `bar_fill_*.png`.

**Эмодзи в интерфейсе не осталось.** Убитых на экране итогов рисует спрайт
`icon_kills.png`, оглушение босса — три искры в канвасе. Системный шрифт
поверх пиксель-арта выглядит наклейкой и на разных платформах рисуется
по-разному, поэтому эмодзи здесь под запретом.

**`drop_coin.png` сейчас не используется.** Монеты убраны из игры до
магазина между забегами (ЭТАП 2 в ROADMAP): валюта, которую негде потратить,
обещает накопление, которого не происходит. Файл лежит на месте и рисовать
его заново не нужно — вернётся вместе с магазином.

**Курсор** (`cursor.png`) — прицел, а не гриб: 32x32, hotspot ровно в центре
(16,16), центральная точка обязана оставаться пустой, иначе курсор закрывает
собой ту самую цель, в которую целишься.

У полосы опыта слота под иконку нет — она тонкая, во всю ширину экрана.
Волн в игре нет, `icon_wave.png` не нужна.

Общий промпт, меняется только `[ПРЕДМЕТ]`:

```
[БАЗА СТИЛЯ]

A single game UI icon, 128x128 pixels, one object centred on transparent
background, no grid, no frame, no text. Bold and simple enough to stay
readable when shown at 20x20 pixels: few large shapes, strong silhouette,
high contrast, no fine detail.

Subject: [ПРЕДМЕТ]
```

Пример предмета, если понадобится новая иконка:
`an anatomical heart overgrown with fungus, deep blood red with pale mycelium
threads creeping across its surface and one small purple mushroom cap
sprouting from the top`

### ШКАЛЫ HP И СПОР

Шкала — ДВЕ картинки одного кадра: `bar_*_empty.png` (потухшая) и
`bar_*_full.png` (горящая). Вторая лежит поверх первой и открывается
`clip-path`'ом слева направо, поэтому заполнение — это оживающая иллюстрация,
а не полоска цвета в рамке.

Требования к паре:
- обе картинки одного размера и с одинаковой рамкой, различаться должна
  ТОЛЬКО внутренность окна: иначе рамка дёргается при изменении значения;
- свечение внутри окна — горизонтально однородное, без «начала» и «конца»:
  срез может остановиться в любой точке;
- наросты по краям заходят внутрь кадра, поэтому границы окна вынесены в CSS
  (`--win-a` / `--win-b` у `.orn-bar`, сейчас 4.7% и 97.02%). Нарисуешь новую
  рамку — пересчитай их, иначе пустая шкала будет выглядеть частично полной.

Промпт:

```
[БАЗА СТИЛЯ]

A horizontal UI progress bar, 236x44 pixels, on solid magenta #FF00FF background.
A carved dark stone frame with mushroom growths and mycelium tendrils
climbing over both ends. Inside the frame a long rectangular window filled
edge to edge with glowing purple spore energy, bright motes and swirling
mycelium patterns, evenly bright along the whole length, no gradient towards
either end. No text, no numbers, no scale marks.
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

A single game prop object, 512x512 pixels, solid magenta #FF00FF background, seen
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

---

# ЧТО ГЕНЕРИРОВАТЬ ДАЛЬШЕ (по приоритету)

Список собран не по вкусу, а по кадрам: сняты десктоп, телефон стоймя и лёжа,
меню прокачки, экран смерти, все четыре биома. Порядок — от «это видно
сразу» к «это приятно».

**Сначала прочти оговорку про интерфейс.** Меню и экран смерти выглядят
чужими не из-за отсутствия картинок, а из-за того, что они нарисованы
средствами веб-страницы: системный шрифт Courier New, скруглённые углы,
CSS-градиенты, мягкие тени. Никакая сгенерированная рамка это не вылечит,
пока внутри неё стоит системный шрифт. Правильный порядок такой:

1. пиксельный шрифт (`.woff2` в репозиторий, `@font-face` в CSS);
2. убрать `border-radius`, градиенты и размытые тени — в пиксель-арте всё
   это читается как «диалог браузера поверх игры»;
3. и только потом — рамка-картинка ниже.

Шрифт даёт больше, чем любая из картинок этого раздела, и стоит один файл.

---

## 1. КИСЛОТНАЯ ЛУЖА — СДЕЛАНО

`effects/acid_pool.png` нарисован **квадратом со скруглёнными углами**. На
арене он и читается квадратом: посреди мха лежит жёлто-зелёная плитка с
ровной каменной каймой по периметру. Это самая заметная неаккуратность в
кадре — единственный прямоугольный объект в мире, где всё остальное
органическое.

Лужа рисуется `flat: true` — центром в точке, без тени. Значит форма пятна
и есть весь силуэт, и она обязана быть неровной.

```
[БАЗА СТИЛЯ]

A single horizontal strip of 4 frames, each cell 256x256 pixels, evenly
spaced, no gaps, no cell borders. The same puddle in every frame, identical
position and scale, only the bubbles animate.

Subject: a puddle of glowing acid-green #39ff14 and toxic yellow #c4a000
fungal slime soaked into dark forest ground, seen straight from above.

CRITICAL — the shape: an irregular organic blob with a ragged, uneven,
lopsided outline, wider on one side than the other, with two or three thin
runnels trickling out of the edge into the surrounding soil. Absolutely NOT
a square, NOT a rectangle, NOT a rounded square, NOT a circle, no straight
edges anywhere, no frame or rim running around the outside, no tile border.
The puddle must not touch the edges of the cell — leave transparent margin
on all four sides.

The edge fades into the ground: the outermost pixels are thin dark wet
staining, not a hard outline. Solid magenta #FF00FF everywhere outside the
puddle and its stains — no transparency checkerboard, no grey squares.

The 4 frames are a slow bubbling loop: bubbles swell and pop in different
places, the outline stays exactly the same in all four frames.
```

**Готово.** Пятно теперь рваное, с подтёками, квадрата нет.

Две вещи, которые всплыли при вклейке:

* лист пришёл с нарисованной шахматкой, но здесь она снялась — тем самым
  ключом, который не сработал на кроне элиты. Разница в насыщенности: у лужи
  109..166 против 0..2 у клеток, у кроны шипы почти серые. Отсюда
  `--mode grey`: ключом служит сама насыщенность, и годится он ТОЛЬКО когда
  в рисунке нет своих бесцветных мест;
* кадры гуляли по клетке — пятно смещалось на 12% ширины между 1-м и 2-м
  кадром, и на 5,5 кадра в секунду это читалось бы как подёргивание. Лечится
  ключом `--anchor`: масштаб и центр берутся по главной фигуре кадра. После
  пересборки центр во всех четырёх — (127..128, 127).

Команда целиком:

```
python3 tools/cut_key.py вход.png docs/assets/images/effects/acid_pool.png \
        --mode grey --grid 4x1 --cell 256 --anchor --pad 0.04
```

Конфиг не менялся: `map.props.acid_pool` уже был настроен
(`flat: true, frames: 4`). Радиус урона остался прежним — новое пятно шире
круга урона, то есть лужа выглядит опаснее, чем жжёт. Так и надо: ошибаться
лучше в сторону «показалось опасным, а обошлось».

---

## 2. РАМКА ИНТЕРФЕЙСА — СДЕЛАНО

Одна рамка обслуживает и панель прокачки, и экран смерти, и будущий магазин:
в CSS она растягивается через `border-image` (девятислайс), то есть углы
остаются целыми, а стороны тянутся. Поэтому важнее красоты — **равномерность
краёв**, иначе слайсер разрежет её криво.

Цвет ветки на карточках лучше оставить за CSS (`--cat`), а рамку сделать
нейтрально-серо-фиолетовой: одна картинка, семь оттенков поверх.

```
[БАЗА СТИЛЯ]

A square ornamental UI frame, 512x512 pixels, seen flat from the front (NOT
three-quarter, NOT top-down — this is an interface element, not an object
in the world).

The frame border is exactly 96 pixels thick on all four sides. The inner
384x384 area is COMPLETELY EMPTY and fully transparent — no texture, no
tint, no vignette inside — fill it with solid magenta #FF00FF. Solid magenta
outside the frame as well. Do NOT draw a transparency checkerboard.

Subject: a border of damp blackened wood grown through with pale mycelium
threads and tiny fungal caps. Wood in near-black green #0d1f15 and worn
brown #5c3a21, mycelium threads in spore grey #8a8a8a, small caps in fungal
purple #6b2d5c with faint bioluminescent teal #00d4aa glow in the deepest
crevices.

CRITICAL for slicing: the top and bottom edges must carry the SAME repeating
pattern so they can be stretched horizontally without a visible break; the
left and right edges likewise, stretched vertically. The four corners are
the only places with a distinct larger feature — one cluster of mushroom
caps per corner, all four corners mirrored copies of each other. Do not put
any large unique detail in the middle of an edge.
```

**Готово:** `ui/frame_panel.png` (512x512, кайма ровно 64 по каждой стороне),
подключён к `#upgradeMenu`. Шахматку модель нарисовала и здесь, но тут это
безобидно: середина рамки обязана быть полностью прозрачной, мягкого
свечения в ней нет — вырезается прямоугольником, без потерь.

CSS (уже в `style.css`):

```css
#upgradeMenu {
  border: 24px solid transparent;       /* толщина рамки на экране */
  border-image: url("../assets/images/ui/frame_panel.png") 96 fill repeat;
  border-radius: 0;                     /* скругления убрать обязательно */
  background: rgba(8,16,12,0.94);
}
```

`96` — та самая толщина из промпта в пикселях исходника. Если модель
нарисует толще или тоньше, поменяй здесь число, а не картинку.

---

## 3. ЭКРАН СМЕРТИ — СДЕЛАНО

Сейчас это самый пустой кадр в игре: две строки системным шрифтом на ровной
зелёной заливке. Между тем это единственный экран, который игрок разглядывает
не в панике, — и единственное место, где картинке дают на себя посмотреть.

Текст в промпт НЕ просим: модели корёжат кириллицу, а буквы всё равно
рисуются шрифтом поверх.

```
Pixel art illustration, 16-bit SNES era style, 1024x576 pixels, landscape.
Chunky readable pixels, hard edges, no anti-aliasing, no modern soft
shading.

Scene: an abandoned alchemist's gas mask lying half-sunk in black wet mud,
seen up close from a low angle. The mask's round glass eye-lenses are
cracked and dark. Fungal growth has taken it over: pale mycelium threads
sew the mask to the ground, and a cluster of glowing purple #6b2d5c and
bioluminescent teal #00d4aa mushrooms has burst out through the filter
snout and the eye sockets. Spore dust drifts through the air.

Colour palette, use only these: deep forest green #1a3d2e, near-black green
#0d1f15, fungal purple #6b2d5c, toxic yellow #c4a000, bioluminescent teal
#00d4aa, worn leather brown #5c3a21, gas-mask black #2a2a2a, spore grey
#8a8a8a.

Composition: the mask sits in the LOWER LEFT of the frame. The upper right
two thirds are near-black empty gloom with only faint drifting spores —
text will be placed there, so that area must stay dark, quiet and free of
detail. Very dark overall, the mushrooms are the only light source.

No text, no letters, no numbers, no watermark, no frame, no border, no UI.
```

**Готово:** `ui/screen_death.png` (1376x768). Прозрачность здесь не нужна
вовсе, поэтому шахматка не мешала. Из картинки пришлось закрасить вклеенную
легенду палитры в правом нижнем углу — модель добавляет её сама, и ложится
она ровно туда, где стоит текст.

Раскладка: на широком экране текст прижат ВПРАВО (иллюстрация смещена влево,
правая треть намеренно пустая). На телефоне стоймя `cover` не годится —
широкая картинка обрезается в узкую полоску, и от противогаза остаётся кусок
фильтра. Там она кладётся целиком по ширине и прижимается к низу, текст
встаёт над ней.

---

## 4. ЭМБЛЕМА — СДЕЛАНО

`ui/emblem.png` (512x512) стоит на стартовом экране, который ради неё и
появился. Название набрано шрифтом, а не картинкой: кириллицу генераторы
пишут с ошибками почти всегда, и «ГРИБНОЙ СУМPAK» заметишь не сразу.

Резать пришлось **режимом `--mode pale`**, и это тот случай, ради которого
режим и появился. Обычный режим исходит из того, что рисунок насыщенный, и
съедает бледное: лучи мицелия у эмблемы кремовые, то есть высокий красный и
высокий синий — по такой мерке «в основном фон». Нити выходили
полупрозрачными и набирали цвет подложки. В `pale` меряется не яркость, а
перекос каналов в сторону ключа, и кремовое остаётся плотным.

Обратно это не работает: `pale` на золотом ореоле кроны завышает альфу, и
ореол розовеет. Правило — есть в картинке кремовое, белое, бледное — `pale`,
иначе обычный режим.

Стартового экрана пока нет вовсе (ЭТАП 4 в `ROADMAP.md`) — страница
открывается сразу в бой. Когда он появится, ему нужна одна картинка.

**Название — НЕ картинкой.** Кириллицу модели пишут с ошибками почти всегда:
получишь «ГРИБНОЙ СУМPAK» и не заметишь. Слова ставим шрифтом, картинкой —
только герб над ними.

```
[БАЗА СТИЛЯ]

A single emblem on a solid magenta #FF00FF background, 512x512 pixels, seen
flat from the front, symmetrical along the vertical axis.

Subject: a heraldic emblem for a plague-alchemist order. A gas mask with
round glass lenses and a filter snout, seen head-on, crowned by a single
large mushroom cap growing straight out of the top of the skull. Behind the
mask, two glass vials crossed like swords, one filled with bioluminescent
teal #00d4aa liquid, one with toxic yellow #c4a000. Pale mycelium threads
spread out behind everything like rays.

Grim, worn, damp. Faint teal glow from the vials and from the gills under
the mushroom cap. No text, no letters, no ribbon, no banner, no scroll.
```

---

## 5. ДВА ВРАГА, КОТОРЫЕ НОСЯТ ЧУЖИЕ СПРАЙТЫ

Плодовое Тело и Мицелиевое Щупальце рисуются **рядами из листов боссов**
(`mother_cap` ряд 0 и `mycelium_heart` ряд 3). Это лучше кружка с глазами,
которым они были раньше, но платится тем, что рядовой враг выглядит уменьшенным
боссом — а босс от этого перестаёт быть событием.

Промпты на обоих готовы выше, в разделе «ВРАГИ». Единственная правка к
описанию Щупальца: оно больше **не держит игрока, а замедляет вдвое** —
значит и поза нужна не «схватило», а «вцепилось и тянет»: барбы на конце
загнуты назад, к земле, а не сомкнуты в кулак.

---

## 6. ЭЛИТА — СДЕЛАНО

Усиленный враг (`isMutated`) уже есть в коде: +50% HP, +30% урона, вокруг
него рисуется золотая аура. И это всё — сам спрайт остаётся прежним, поэтому
в толпе элита отличается только оттенком свечения, которое в темноте теряется
среди грибов и луж.

Отдельный лист рисовать не надо: элита обязана быть УЗНАВАЕМОЙ ВЕРСИЕЙ того
же врага, а не новым существом. Дешевле и правильнее — нарост, который
рисуется ПОВЕРХ любого спрайта в его координатах.

**Готово:** `enemies/elite_crown.png` подключён, рисует `Enemy.drawCrown`,
настройки — `CONFIG.enemies.elite` (`sizeMult` регулирует, насколько венец
крупнее врага). Листа нет — остаётся прежняя золотая аура.

Что стоило знать при генерации этого листа:

* фон по магенте снялся с первого раза и начисто — ни розовой каймы, ни
  следов, включая мягкое свечение и искры;
* модель трижды продублировала один и тот же шип в промежутке между 1-м и
  2-м кадром. Такой мусор она ставит именно В ПРОМЕЖУТКИ, и `--clean`
  выбрасывает его сам, но здесь обрывок прирос к кольцу вплотную и пришлось
  замазать полосу вручную. Смотри лист глазами перед вклейкой;
* первый кадр вышел кособоким — правый шип короче остальных, и в петле
  кольцо подмигивало шириной. Взят четвёртый кадр (такой же тусклый, но
  ровный) и поставлен первым: петля осталась честной — тускло, ярче,
  вспышка, тускло.

Промпт ниже оставлен как есть: он сработал, повторять можно.


```
[БАЗА СТИЛЯ]

A single horizontal strip of 4 frames, each cell 128x128 pixels, evenly
spaced, no gaps, no borders.

Subject: a crown of parasitic growth that will be drawn on top of another
creature — a ring of five twisted fungal spines erupting outward, dripping
toxic yellow #c4a000 light, with a haze of golden spores around them. The
centre of the image is COMPLETELY EMPTY and transparent: only the ring of
spines near the edges of the cell is drawn, because the creature itself
shows through the middle.

The 4 frames are a pulsing loop: the spines flare brighter and dim, spores
drift outward.
```

