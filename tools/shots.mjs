// СКРИНШОТЫ ДЛЯ КАРТОЧКИ ИГРЫ.
//
//   node tools/shots.mjs            — снять всю подборку в promo/screenshots
//   node tools/shots.mjs boss       — только кадры, чьё имя содержит подстроку
//
// Зачем скриптом, а не рукой. Площадка требует, чтобы на скриншоте был
// НАСТОЯЩИЙ геймплей не меньше чем на 70% кадра, и требует обе ориентации —
// значит снимков надо восемь, каждый в свой момент забега. Рукой это полтора
// часа: дождаться босса на 2:45, успеть нажать в момент удара, не промахнуться
// мимо лавки, повторить всё на телефоне. Скриптом — полторы минуты, и снимки
// повторяются: поменяли интерфейс, перезапустили, получили ту же подборку.
//
// Ставится это НЕ в зависимости проекта: игра остаётся папкой без сборки, а
// Playwright нужен один раз человеку, который снимает. Готовые PNG лежат в
// репозитории (promo/), поэтому запускать скрипт ради самих снимков не надо —
// только когда игра изменилась.
//
//   npm i -g playwright && npx playwright install chromium
//
// Снимки кладутся в promo/, а НЕ в docs/: всё, что лежит в docs/, уезжает в
// архив для площадки (tools/build_yandex.mjs копирует папку целиком), и восемь
// полноэкранных PNG утяжелили бы игру мегабайтами ради картинок, которые
// игроку не нужны вовсе.
//
// Грабли, на которых этот скрипт уже стоял (все — из HANDOFF, раздел «Как
// проверять», и все проверены здесь заново):
//
//   1. До нажатия «Играть» симуляция не идёт вообще. Первый кадр без клика —
//      это стартовый экран, а не бой.
//   2. Бессмертие надо подновлять КАЖДЫЙ кадр, а не один раз: бот не уклоняется
//      и умирает раньше, чем дойдёт до нужной секунды.
//   3. hasTouch включает авто-прицел. Без него бот стреляет в точку (0,0) —
//      попаданий на снимке не будет ни одного.
//   4. Меню прокачки и лавка ставят игру на паузу. Не закрыл — снимаешь
//      застывший мир вместо боя.
//   5. Короткие эффекты (кольцо удара, выброс спор) живут семь кадров и в
//      снимок не попадают. Ловятся не паузой (она затемняет кадр и пишет
//      «ПАУЗА»), а остановкой удара: CONFIG.feel.hitStopCrit=90.
//   6. jumpTo двигает время, спавн и очередь боссов разом. Без него ожидание
//      босса стоит 165 секунд реального времени на каждый снимок.

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "promo", "screenshots");
const PORT = 8177;
const only = process.argv[2] || "";

// РАЗМЕРЫ ОКНА ВЫБРАНЫ ПОД ВЁРСТКУ, А НЕ ПОД КРАСИВЫЕ ЧИСЛА.
//
// Первый заход снимал в 1920x1080 и дал кадр с широкими пустыми полями: на
// большом экране игра рисуется окном `min(100vw,1280) x min(100vh,860)`
// посередине страницы, то есть треть снимка занимал фон вокруг игры. Для
// площадки это провал сразу по двум пунктам — «геймплей не меньше 70% кадра»
// и «сплошная заливка вместо содержания».
//
// Поэтому окно берётся ровно такое, при котором коробка игры совпадает с ним:
//   альбом  1280x720 — обе стороны упираются в потолки вёрстки;
//   портрет  900x1600 — ширина ниже 950, а это порог мобильной раскладки
//                       (см. медиазапрос в style.css), и кадр занимает экран
//                       целиком, как на телефоне.
// Плотность добирает разрешение до привычного размера снимка: 1920x1080 и
// 1080x1920 получаются множителем, а не растяжкой.
const LANDSCAPE = { viewport: { width: 1280, height: 720 },  deviceScaleFactor: 1.5, hasTouch: true };
const PORTRAIT  = { viewport: { width: 900,  height: 1600 }, deviceScaleFactor: 1.2, hasTouch: true };

// Сцены. Каждая — момент забега, который стоит показать в карточке; порядок
// такой же, каким игрок их встречает.
const SHOTS = [
  { name: "01-boi",        mode: LANDSCAPE, at: 95,  scene: "fight" },
  { name: "02-boss",       mode: LANDSCAPE, at: 160, scene: "boss" },
  { name: "03-prokachka",  mode: LANDSCAPE, at: 95,  scene: "upgrade" },
  { name: "04-lavka",      mode: LANDSCAPE, at: 95,  scene: "shop" },
  { name: "05-vybros",     mode: LANDSCAPE, at: 120, scene: "burst" },
  { name: "06-boi-telefon",      mode: PORTRAIT, at: 110, scene: "fight" },
  { name: "07-boss-telefon",     mode: PORTRAIT, at: 160, scene: "boss" },
  { name: "08-prokachka-telefon",mode: PORTRAIT, at: 95,  scene: "upgrade" },
];

mkdirSync(OUT, { recursive: true });
if (!existsSync(join(ROOT, "docs", "index.html"))) {
  console.error("Не вижу docs/index.html — запускать из корня проекта");
  process.exit(1);
}

const server = spawn("python3", ["-m", "http.server", String(PORT)], {
  cwd: join(ROOT, "docs"), stdio: "ignore"
});
const stop = () => { try { server.kill(); } catch {} };
process.on("exit", stop);

await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch();

// Мир доводится до нужной секунды НЕ перемоткой времени в одиночку: jumpTo
// двигает часы, но врагов на арене от этого не появляется. Поэтому сначала
// прыжок, потом несколько живых секунд — за них спавн наполняет экран так же,
// как он наполнил бы его в настоящем забеге.
async function play(page, seconds) {
  await page.evaluate(s => window.GAME.jumpTo(s), seconds);
  const until = Date.now() + 4500;
  while (Date.now() < until) {
    await page.evaluate(() => {
      const g = window.GAME, p = g.player;
      p.hp = p.maxHp = 100000;                       // бессмертие подновляем каждый раз
      if (g.upgrades.isOpen) document.querySelector("#upgradeCards .upgrade-card")?.click();
      if (g.shop.isOpen) g.shop.close();
    });
    // Ходим кругами: стоящий на месте игрок собирает вокруг себя кольцо, а в
    // карточке нужен бой, а не осада.
    const key = ["KeyW", "KeyD", "KeyS", "KeyA"][Math.floor(Date.now() / 400) % 4];
    await page.keyboard.down(key);
    await page.waitForTimeout(220);
    await page.keyboard.up(key);
  }
}

for (const shot of SHOTS) {
  if (only && !shot.name.includes(only)) continue;
  const page = await browser.newPage(shot.mode);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html?debug`, { waitUntil: "load" });
  // РАМКУ ХОЛСТА УБИРАЕМ. На десктопе у него розовый контур в один пиксель —
  // в игре это часть оформления, а в карточке магазина рамки запрещены прямым
  // пунктом требований к медиаматериалам. Правило не выдумано на ходу: ровно
  // это же делает сама игра в мобильной раскладке (`canvas { border: none }`).
  await page.addStyleTag({ content: "canvas{border:none !important}" });
  await page.waitForTimeout(1500);
  await page.click("#playBtn");
  await page.waitForTimeout(600);
  await play(page, shot.at);

  if (shot.scene === "boss") {
    // Босса ждём именно живым: jumpTo ставит очередь, но выходит он по своему
    // таймеру, и снимок «вот-вот появится» показывает пустую арену.
    await page.waitForFunction(() => window.GAME.enemies.some(e => e.maxHp > 400 && !e.dead),
                               null, { timeout: 30000 }).catch(() => {});
    await play(page, shot.at + 8);
  }
  if (shot.scene === "upgrade") {
    // Меню открывает игрок сам, поэтому копим уровень и жмём кнопку — ровно
    // так же, как это делает человек.
    await page.evaluate(() => { const p = window.GAME.player; p.xp = p.xpToNext + 1; });
    await page.waitForTimeout(400);
    await page.click("#upgradeBtn").catch(() => {});
    await page.waitForTimeout(700);
  }
  if (shot.scene === "shop") {
    await page.evaluate(() => {
      const g = window.GAME; g.player.coins = 180; g.shop.open(g.player);
    });
    await page.waitForTimeout(700);
  }
  if (shot.scene === "burst") {
    // Выброс спор живёт доли секунды. Останавливаем мир НА УДАРЕ: кадр
    // рисуется как в бою, а не как на паузе.
    await page.evaluate(() => {
      const g = window.GAME;
      g.player.sporeLevel = 95;
      g.config.feel.hitStopCrit = 90;
      g.burst();
    });
    await page.waitForTimeout(120);
  }
  if (shot.scene === "fight") {
    await page.evaluate(() => { window.GAME.config.feel.hitStopCrit = 90; });
    await page.waitForTimeout(150);
  }

  const file = join(OUT, shot.name + ".png");
  await page.screenshot({ path: file });
  const stats = await page.evaluate(() => window.GAME.stats());
  console.log(`${shot.name.padEnd(22)} ${shot.mode.viewport.width}x${shot.mode.viewport.height}` +
              `  время ${Math.floor(stats.time / 60)}:${String(Math.floor(stats.time % 60)).padStart(2, "0")}` +
              `  врагов на экране ${stats.onScreen ?? "?"}` +
              (errors.length ? `  ОШИБКИ: ${errors.join("; ")}` : ""));
  await page.close();
}

await browser.close();
stop();
console.log(`\nГотово: ${OUT}`);
