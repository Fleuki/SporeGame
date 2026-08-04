============================================
  ГРИБНОЙ СУМРАК — Модульная игра
============================================

ЗАПУСК:
  cd gribnoy-sumrak
  python -m http.server 8000
  Открой http://localhost:8000

ВАЖНО: нельзя открыть index.html двойным кликом —
нужен локальный сервер из-за ES6 модулей.

============================================
КАК ДОБАВИТЬ СВОИ АССЕТЫ
============================================

1. СПРАЙТ ИГРОКА:
   Положи PNG → assets/images/player/hero.png
   В js/config.js:
     player: { sprite: "assets/images/player/hero.png" }

2. СПРАЙТ ВРАГА:
   assets/images/enemies/spore_bearer.png
   В config.js enemies.types.spore_bearer.sprite = "..."

3. ЗЕМЛЯ (ТАЙЛ КАРТЫ):
   Положи БЕСШОВНЫЙ квадратный PNG → assets/images/map/ground_swamp.png
   В config.js assets.images.groundSwamp = "assets/images/map/ground_swamp.png"
   Затем добавь биом в config.js map.biomes:
     { key: "swamp", tile: "groundSwamp", tint: "rgba(10,25,20,0.35)" }
   Биомы сменяются по кругу каждые map.secondsPerBiome секунд забега.
   tint — полупрозрачная заливка поверх текстуры: без неё яркая земля
   забивает врагов и снаряды.

4. ДЕКОРАЦИИ КАРТЫ (пни, телеги, камни):
   PNG С ПРОЗРАЧНЫМ ФОНОМ → assets/images/props/prop_rock.png
   В config.js assets.images.propRock = "..."
   И в config.js map.props:
     rock: { image: "propRock", width: 90 }
   width — ширина на экране, высота считается по пропорциям картинки.
   Необязательные поля:
     glow/glowBlur — свечение вокруг спрайта (как у грибного пня);
     flat: true    — объект лежит на земле (лужа): без тени, центром в точке;
     frames: 4 + animSpeed: 11 — анимация, кадры одним рядом в PNG.
   Декорации раскладываются сами по клеткам мира (map.decorCell,
   map.decorChance), коллизий у них нет. Точка опоры спрайта — низ по
   центру, поэтому рисуй объект «стоящим на земле».

5. ИНТЕРФЕЙС И КУРСОР:
   Иконки HUD — обычные <img class="icon"> в index.html,
   лежат в assets/images/ui/. Масштаб задаётся в css/style.css
   (.icon), там же image-rendering: pixelated — без него
   пиксель-арт мылится при уменьшении.
   Курсор — тоже CSS: cursor: url(...) X Y, где X Y — точка
   прицела внутри картинки.

6. АНИМАЦИЯ-ВСПЫШКА (левел-ап, взрыв):
   PNG с кадрами В ОДИН РЯД → assets/images/effects/levelup.png
   В config.js:
     levelUp: { key:"fx_levelup", frame:192, cols:4, display:220, speed:7 }
   frame — сторона кадра в файле, display — размер на экране,
   speed — сколько кадров игры держится один кадр анимации.

7. МУЗЫКА:
   assets/sounds/music/battle.ogg
   В config.js assets.sounds.bgm = "..."
   В main.js раскомментируй audio.playMusic("bgm")

8. ЗВУКИ:
   Звуки боя НЕ требуют файлов: они синтезируются в браузере
   через WebAudio (js/engine/audio.js, объект RECIPES).
   Поменять звук выстрела — поменять там частоты и длительность,
   класть в репозиторий ничего не надо.
   Если хочется настоящих сэмплов — добавь пути в
   config.js assets.sounds под теми же ключами (shoot, hit,
   kill, boom, hurt, pickup, coin, levelup, boss, wave) и зови
   audio.playSfx("shoot"): при наличии файла играет он, при
   отсутствии — синтез.
   Звук включается после первого клика или нажатия клавиши —
   так требует браузер. M — выключить/включить.

============================================
УПРАВЛЕНИЕ
============================================
  WASD / джойстик на экране — движение
  Мышь                     — прицел (на мобильных авто-прицел)
  Стрельба                 — автоматическая, всеми стволами сразу
  Esc                      — пауза
  M                        — звук
  R                        — рестарт после смерти

============================================
КОРОТКИЕ ПРОМПТЫ ДЛЯ БОТОВ В ТЕЛЕГРАМ
============================================

[ФАЙЛ: js/config.js]
Добавь врага "GhostFungus": hp 40, speed 1.5,
способность — телепортация на 50px каждые 3 сек.

[ФАЙЛ: js/systems/spawnSystem.js]
Раз в 90 секунд забега спавни редкого элитного врага
с золотой аурой и х2.5 HP.

[ФАЙЛ: js/entities/player.js]
Добавь третье оружие — огнемёт: короткая дистанция,
постоянный урон, поджигает врагов (дот 5 ур/сек).

[ФАЙЛ: js/systems/upgradeSystem.js]
Добавь улучшение "Споровый ураган": при левел-апе
взрыв отталкивает всех врагов на 100px.

[ФАЙЛ: js/entities/boss.js]
Добавь Боссу 3 фазы: 100-70%, 70-40%, 40-0%.
Каждая фаза меняет цвет, скорость атаки, добавляет
новую способность.

[ФАЙЛ: js/engine/renderer.js]
Добавь метод drawAnimatedSprite для спрайт-листов
(колонки, строки, тайминг).

============================================
ПРОМПТЫ ДЛЯ ГЕНЕРАЦИИ АССЕТОВ (нейросети)
============================================

Герой:
Pixel art character sprite sheet, post-apocalyptic mycologist
survivor, gas mask with two tubes, brown fungal leather cloak,
mechanical arm with gears, belt with glowing potion vials,
top-down view, 4 directions, 4 idle frames each,
muted brown and purple, 16-bit style, transparent background.

Трава:
Pixel art seamless tile, dark green overgrown grass,
post-apocalyptic mushroom forest floor, palette #1a3d2e,
small glowing purple mycelium veins, 64x64, top-down,
16-bit style, transparent background.

Спороносец:
Pixel art sprite sheet, infected peasant with mushroom head,
tattered clothes, glowing purple veins, shambling walk,
4 directions, 4 frames each, dark colors, 16-bit,
transparent background.

Дерево:
Pixel art game asset, tall tree covered in giant glowing
mushrooms, bioluminescent turquoise and purple,
dark green moss, top-down, 128x128, 16-bit style,
transparent background.
