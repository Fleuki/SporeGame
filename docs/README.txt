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

3. ФОН:
   assets/images/backgrounds/dungeon.png
   В config.js assets.images.bg = "..."
   В main.js замени drawGrid() на отрисовку фона.

4. МУЗЫКА:
   assets/sounds/music/battle.ogg
   В config.js assets.sounds.bgm = "..."
   В main.js раскомментируй audio.playMusic("bgm")

5. ЗВУКИ:
   Добавь пути в config.js assets.sounds
   Раскомментируй audio.playSfx() в main.js

============================================
КОРОТКИЕ ПРОМПТЫ ДЛЯ БОТОВ В ТЕЛЕГРАМ
============================================

[ФАЙЛ: js/config.js]
Добавь врага "GhostFungus": hp 40, speed 1.5,
способность — телепортация на 50px каждые 3 сек.

[ФАЙЛ: js/systems/waveSystem.js]
Каждые 7 волн спавни редкого элитного врага
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
