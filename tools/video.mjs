// ГОРИЗОНТАЛЬНОЕ ПРОМО-ВИДЕО ДЛЯ КАРТОЧКИ ИГРЫ.
//
//   node tools/video.mjs          — снять promo/video/gorizontalnoe-16x9.mp4
//   node tools/video.mjs --keep   — оставить исходный webm рядом
//
// Зачем скриптом, а не рукой (та же причина, что и у tools/shots.mjs).
// Площадка требует ролик из АКТУАЛЬНОЙ сборки: поменялся интерфейс — видео
// надо переснимать, иначе «материалы не соответствуют игре» и отказ. Руками
// это каждый раз полчаса: дождаться плотного боя, поймать босса на 2:45,
// попасть в выброс спор, не умереть по дороге и уложиться в 28 секунд.
// Скриптом — две минуты, и ролик воспроизводится: та же сборка даёт то же
// видео.
//
// Ставится НЕ в зависимости проекта — как и Playwright для скриншотов:
//
//   npm i -g playwright ffmpeg-static && npx playwright install chromium
//
// ffmpeg берётся из PATH, из переменной FFMPEG или из пакета ffmpeg-static.
//
// ТРЕБОВАНИЯ КОНСОЛИ к горизонтальному ролику: mp4, 16:9, высота от 400
// пикселей, не больше 100 МБ, не длиннее 28 секунд. Снимаем 1920x1080 и
// около 26 секунд — с запасом по обоим краям.
//
// ТРЕБОВАНИЯ МОДЕРАЦИИ к самому содержанию (раздел 8.3 требований площадки):
//   8.3.1 — без артефактов сжатия, без избыточного затемнения и полностью
//           одноцветных кадров, без обрезанного текста;
//   8.3.2 — показывает суть игры, а не произвольную картинку: значит настоящий
//           геймплей, а не заставка и не арт;
//   8.3.3 — БЕЗ РАМОК и скруглённых углов;
//   8.3.4 — без системного интерфейса (адресная строка, статус-бар) и без
//           интерфейса самих Яндекс Игр. Игровой интерфейс — можно.
// Каждый пункт отработан ниже и подписан по месту.

import { chromium } from "playwright";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "promo", "video");
const RAW = join(OUT, "raw");
const MP4 = join(OUT, "gorizontalnoe-16x9.mp4");
const PORT = 8178;
const keepRaw = process.argv.includes("--keep");

// РАЗМЕР КАДРА. Окно 1280x720 выбрано не за красоту числа: при нём коробка
// игры (`min(100vw,1280) x min(100vh,860)` — см. style.css) совпадает с окном
// ровно, и в кадре нет ни одного пикселя фона вокруг игры.
//
// РАЗМЕР ВИДЕО РАВЕН ОКНУ, и это не лень. Первый прогон писал 1920x1080 при
// окне 1280x720 — и Playwright положил страницу в угол кадра, оставив треть
// пустой: он умеет уменьшать картинку под заданный размер, но не увеличивать.
// Плотность тоже единица: при 1.5 холст рисуется в 1920x1080 и потом
// ужимается до размера видео, а это пересэмплирование пиксель-арта, то есть
// мыло — прямо запрещённые «пиксельные артефакты» из п. 8.3.1.
// 720 пикселей высоты — вдвое выше требуемых площадкой 400.
const VIEW = { width: 1280, height: 720 };
const VIDEO = { width: 1280, height: 720 };

// СЦЕНАРИЙ. Секунды — экранное время ролика; сумма обязана уложиться в 28.
//
// Порядок такой же, каким игрок встречает эти экраны, и начинается ролик с
// названия: п. 5.1.3 требует, чтобы название в видео совпадало с названием в
// карточке побуквенно, а показать его негде, кроме стартового экрана.
//
// Секунды забега идут ПО ВОЗРАСТАНИЮ и взяты поздние нарочно. Первый прогон
// снимал бой на 95-й секунде и дал полупустую арену: там ещё начало забега,
// потолок живых врагов низкий. Требование 8.3.2 — «отражают суть объекта», а
// суть этой игры — поток, а не трое грибов на весь экран. К четвёртой минуте
// поток настоящий, и это та же игра, просто позже.
const SCENES = [
  { name: "название",  hold: 2.2, at: null },
  { name: "бой",       hold: 6.0, at: 240 },
  { name: "прокачка",  hold: 3.2, at: 240, open: "upgrade" },
  { name: "лавка",     hold: 3.0, at: 245, open: "shop" },
  { name: "выброс",    hold: 4.0, at: 285, open: "burst" },
  // БОСС СНИМАЕТСЯ НА ПЕРВОМ, а не на втором, и это единственная сцена, ради
  // которой время забега идёт назад. На пятой минуте босс выходит в уже
  // выкошенную арену: пока он жив, рядовые не спавнятся, и кадр получается
  // тёмным и пустым — то есть ровно то, что п. 8.3.1 называет «полностью
  // одноцветными кадрами». На 2:45 он выходит в живой бой.
  { name: "босс",      hold: 7.6, at: 158, open: "boss" },
];
const TOTAL = SCENES.reduce((s, x) => s + x.hold, 0);
if (TOTAL > 27.5) { console.error(`Сценарий длиннее 27.5 с (${TOTAL}) — потолок площадки 28`); process.exit(1); }

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0) return "ffmpeg";
  try { return require("node:module").createRequire(import.meta.url)("ffmpeg-static"); } catch {}
  return null;
}
const FFMPEG = findFfmpeg();
if (!FFMPEG) {
  console.error("Не нашёл ffmpeg. Поставьте `npm i -g ffmpeg-static` или укажите путь: FFMPEG=/путь/ffmpeg node tools/video.mjs");
  process.exit(1);
}

if (!existsSync(join(ROOT, "docs", "index.html"))) {
  console.error("Не вижу docs/index.html — запускать из корня проекта");
  process.exit(1);
}
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const server = spawn("python3", ["-m", "http.server", String(PORT)], {
  cwd: join(ROOT, "docs"), stdio: "ignore"
});
process.on("exit", () => { try { server.kill(); } catch {} });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch();
// Playwright пишет видео с момента создания контекста. Метку берём здесь,
// чтобы потом отрезать загрузку страницы (см. хвост файла).
const ctxStartedAt = Date.now();
const ctx = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 1,
  // hasTouch включает авто-прицел: без него бот стреляет в точку (0,0) и в
  // ролике не будет ни одного попадания (грабли из shots.mjs, пункт 3).
  hasTouch: true,
  recordVideo: { dir: RAW, size: VIDEO },
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));

await page.goto(`http://127.0.0.1:${PORT}/index.html?debug`, { waitUntil: "load" });
// РАМКУ ХОЛСТА УБИРАЕМ (п. 8.3.3). На десктопе у него розовый контур в три
// пикселя — в игре это часть оформления, а в медиаматериалах рамки запрещены
// прямым пунктом. Правило не выдумано: ровно это же делает сама игра в
// мобильной раскладке (`canvas { border: none }`), и ровно это же делает
// tools/shots.mjs для скриншотов.
await page.addStyleTag({ content: "canvas{border:none !important}" });
await page.waitForFunction(() => document.getElementById("bootScreen").classList.contains("hidden"),
                           null, { timeout: 30000 });
// ВСПЫШКУ УРОНА ГАСИМ НА КАЖДОМ КАДРЕ, а не раз в сотню миллисекунд из бота.
// Она живёт двенадцать кадров, и бот между своими тиками её не догонял: в
// первом прогоне каждый четвёртый кадр ролика был залит красным. Бот в этой
// записи бессмертен, то есть красный экран показывает урон, которого нет, —
// и читается как «избыточное затемнение» из п. 8.3.1.
// Признак босса и отладочное имя кладём в страницу один раз: ими пользуются
// и ожидание выхода, и удержание его в кадре.
await page.evaluate(() => {
  window.isBossEl = (e) => !!e && !e.dead && e.constructor && e.constructor.name === "Boss";
  window.g_name = () => (window.GAME.enemies.find(window.isBossEl) || {}).name || "";
});
await page.evaluate(() => {
  const tick = () => {
    const p = window.GAME?.player;
    if (p) p.hurtFlash = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.waitForTimeout(400);

// ОТМЕТКИ СЦЕН. Playwright пишет ВСЁ подряд, включая загрузку страницы,
// перемотку забега к нужной секунде и ожидание босса, — а это десятки секунд,
// которым в двадцатишестисекундном ролике места нет. Поэтому каждая сцена
// отмечает своё окно, и монтаж потом вырезает ровно их и склеивает встык
// (см. хвост файла). Пауза между сценами в ролик не попадает вовсе.
//
// Отметка знает, СКОЛЬКО сцена должна занять в ролике (`want`), и это не то же
// самое, сколько она заняла при записи: клик по карточке прокачки может
// прождать актуальности элемента несколько секунд, а выброс спор — подвиснуть
// на остановке кадра. Первый прогон дал 39 секунд вместо 26 ровно поэтому.
// Лишнее режется на монтаже, а `focus` говорит, вокруг чего резать: у сцены с
// выбросом смысл в одном мгновении, и потерять его нельзя.
const marks = [];
const mark = (name, want) => { const m = { name, want, from: Date.now() - ctxStartedAt }; marks.push(m); return m; };
const focus = (m) => { m.focus = Date.now() - ctxStartedAt; };
const close = (m) => { m.to = Date.now() - ctxStartedAt; };

// ДВИЖЕНИЕ БОТА. В shots.mjs шаги короткие: там нужен один кадр, и как игрок
// доехал до него — неважно. В ролике важно: рывки по 200 мс читаются как
// дёрганая игра. Поэтому направление держится почти секунду и меняется по
// кругу — со стороны это обычная игра «по дуге вокруг толпы».
let dirAt = 0, dir = 0;
const DIRS = [["KeyW","KeyD"], ["KeyD","KeyS"], ["KeyS","KeyA"], ["KeyA","KeyW"]];
async function steer() {
  if (Date.now() - dirAt < 850) return;
  for (const k of DIRS[dir]) await page.keyboard.up(k).catch(() => {});
  dir = (dir + 1) % DIRS.length; dirAt = Date.now();
  for (const k of DIRS[dir]) await page.keyboard.down(k).catch(() => {});
}
async function release() {
  for (const k of DIRS[dir]) await page.keyboard.up(k).catch(() => {});
}

// Мир живёт заданное время, бот ходит, герой не умирает. Бессмертие
// подновляется КАЖДЫЙ раз, а не однажды: бот не уклоняется и без этого не
// доживает до босса (грабли из shots.mjs, пункт 2).
async function live(seconds, { steering = true, keepBoss = false } = {}) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    await page.evaluate((keepBoss) => {
      const g = window.GAME, p = g.player;
      if (p) {
        p.hp = p.maxHp = 100000;
        // КРАСНЫЙ ЗАЛИВ КАДРА СНИМАЕМ. Вспышка урона (drawHurtVignette) — в
        // игре честная обратная связь, но бот бессмертен и стоит в толпе, то
        // есть получает по себе непрерывно: в ролике это сплошной красный
        // экран, а не «попали». Ровно то, что п. 8.3.1 называет избыточным
        // затемнением.
        p.hurtFlash = 0;
      }
      // ЗАЛИПШЕЕ МЕНЮ ОСТАНАВЛИВАЕТ МИР. Прокачка и лавка ставят игру на
      // паузу, и если бот их не закрыл, весь остаток ролика — неподвижная
      // картинка с открытой панелью. Первый прогон именно так и вышел:
      // двадцать секунд застывшего меню прокачки.
      if (g.upgrades?.isOpen) document.querySelector("#upgradeCards .upgrade-card")?.click();
      if (g.shop?.isOpen) g.shop.close();
      // ЗАРАЖЕНИЕ ДЕРЖИМ СРЕДНИМ. На пороге «критическое» игра заливает кадр
      // красным (см. drawHurtVignette) — в игре это честное предупреждение, а
      // в ролике двадцать секунд сплошного красного читаются как «избыточное
      // затемнение» из п. 8.3.1. Сорок процентов — обычная середина забега,
      // до которой шкалу сбивает первый же антидот.
      if (p && p.sporeLevel > 55) p.sporeLevel = 40;
      // БОСС ДОЛЖЕН ОСТАТЬСЯ В КАДРЕ. Материнская Капля неподвижна (speed: 0),
      // камера ходит за игроком — и бот, нарезающий круги, просто уходил от
      // неё: сцена «босс» в прошлом прогоне не показала ни одного босса.
      // Держим игрока на поводке вокруг него: это и есть бой с ним.
      if (keepBoss && p) {
        const b = g.enemies.find(window.isBossEl);
        if (b) {
          const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
          if (d > 230) { p.x = b.x + dx / d * 230; p.y = b.y + dy / d * 230; }
        }
      }
    }, keepBoss);
    if (steering) await steer();
    await page.waitForTimeout(90);
  }
}

// Довести забег до нужной секунды. jumpTo двигает часы, спавн и очередь
// боссов разом, но врагов от этого на арене не появляется — поэтому после
// прыжка миру дают несколько живых секунд наполниться.
async function jumpTo(sec) {
  await page.evaluate(s => window.GAME.jumpTo(s), sec);
  await live(3.2);
}

// Успокоить кадр перед панелью. Мир на паузе замирает вместе со вспышкой
// урона и красным предупреждением о заражении — а панель висит на экране
// три секунды, и всё это время кадр залит красным.
async function calmFrame() {
  await page.evaluate(() => {
    const p = window.GAME.player;
    if (p) { p.hurtFlash = 0; p.sporeLevel = Math.min(p.sporeLevel, 40); }
  });
  await page.waitForTimeout(120);
}

// РАЗОГРЕВ. Бот без прокачки к четвёртой минуте стреляет из стартового ствола
// и не успевает убивать: арена забивается врагами, которые просто ходят.
// Живой игрок к этому времени взял с десяток карточек — берём столько же, и
// в ролике видно то же, что видит человек: поток, который РАСПАДАЕТСЯ под
// огнём. Карточки выбираются те же, что предложила бы игра.
async function warmUp(levels) {
  for (let i = 0; i < levels; i++) {
    await page.evaluate(() => {
      const g = window.GAME, p = g.player;
      p.xp = p.xpToNext + 1;
    });
    await page.waitForTimeout(140);
    await page.evaluate(() => {
      document.getElementById("upgradeBtn")?.click();
      const card = document.querySelector("#upgradeCards .upgrade-card");
      if (card) card.click();
    });
    await page.waitForTimeout(140);
  }
  await page.evaluate(() => {
    const g = window.GAME;
    let guard = 20;
    while (g.upgrades?.isOpen && guard-- > 0) document.querySelector("#upgradeCards .upgrade-card")?.click();
  });
}

console.log(`Снимаю ${TOTAL.toFixed(1)} с в ${VIDEO.width}x${VIDEO.height}`);
for (const sc of SCENES) {
  process.stdout.write(`  · ${sc.name} — ${sc.hold} с\n`);

  if (sc.at === null) {                       // стартовый экран с названием
    const m = mark(sc.name, sc.hold);
    await page.waitForTimeout(sc.hold * 1000);
    close(m);
    await page.click("#playBtn");
    await page.waitForTimeout(500);
    await warmUp(11);
    continue;
  }
  if (sc.at) await jumpTo(sc.at);

  if (sc.open === "upgrade") {
    // Меню открывает игрок сам — копим уровень и жмём кнопку, как человек.
    await release();
    await calmFrame();
    await page.evaluate(() => { const p = window.GAME.player; p.xp = p.xpToNext + 1; });
    // Уровень засчитывается не присваиванием опыта, а ПОДБОРОМ следующей
    // капли (см. loot.update в main.js) — поэтому ждём, пока он вправду
    // возьмётся, и только потом жмём кнопку.
    await page.waitForFunction(() => window.GAME.stats().upgradesReady > 0,
                               null, { timeout: 10000 }).catch(() => {});
    // Кнопку жмём ИЗ СТРАНИЦЫ. Playwright ждал её «актуальности» и на скрытой
    // кнопке уходил в тридцатисекундный таймаут: в прошлом прогоне сцена с
    // прокачкой оказалась обычным боем, потому что меню так и не открылось.
    await page.evaluate(() => document.getElementById("upgradeBtn")?.click());
    await page.waitForFunction(() => window.GAME.upgrades?.isOpen,
                               null, { timeout: 5000 }).catch(() => {});
    // Кнопка могла быть спрятана (уровней не накопилось) — тогда открываем
    // тем же вызовом, каким это делает сама игра. Сцену, в которой нет ровно
    // того, ради чего она снята, снимать бессмысленно.
    if (!(await page.evaluate(() => !!window.GAME.upgrades?.isOpen))) {
      await page.evaluate(() => {
        const g = window.GAME;
        g.upgrades.showMenu(g.upgrades.generateCards(g.player), g.player);
      });
      await page.waitForTimeout(200);
    }
    const menuUp = await page.evaluate(() => !!window.GAME.upgrades?.isOpen);
    console.log(`    меню прокачки: ${menuUp ? "открыто" : "НЕ ОТКРЫЛОСЬ"}`);
    await page.waitForTimeout(350);
    const m = mark(sc.name, sc.hold);
    await page.waitForTimeout(1800);
    // Карточку берём: ролик должен показать, что выбор к чему-то приводит.
    // Клик делается ИЗ СТРАНИЦЫ, а не через Playwright: тот ждёт «актуальности»
    // элемента, и на анимированной панели ожидание срывалось в таймаут — меню
    // оставалось открытым, а мир стоял до конца записи.
    await page.evaluate(() => document.querySelector("#upgradeCards .upgrade-card")?.click());
    focus(m);
    await page.waitForTimeout(900);
    close(m);
    // Накопленных уровней может быть больше одного: панель тогда открывается
    // снова той же кнопкой, и мир остаётся стоять.
    await page.evaluate(() => {
      const g = window.GAME;
      let guard = 12;
      while (g.upgrades?.isOpen && guard-- > 0) document.querySelector("#upgradeCards .upgrade-card")?.click();
    });
    continue;
  }
  if (sc.open === "shop") {
    await release();
    await calmFrame();
    await page.evaluate(() => { const g = window.GAME; g.player.coins = 320; g.shop.open(g.player); });
    await page.waitForTimeout(350);
    const m = mark(sc.name, sc.hold);
    await page.waitForTimeout(sc.hold * 1000);
    close(m);
    await page.evaluate(() => window.GAME.shop.close());
    await page.waitForTimeout(300);
    continue;
  }
  if (sc.open === "burst") {
    // Выброс спор — единственное, что игрок делает руками сверх ходьбы, и
    // ради него стоит показать шкалу заражения полной.
    const m = mark(sc.name, sc.hold);
    await live(sc.hold * 0.4);
    await page.evaluate(() => { window.GAME.player.sporeLevel = 95; });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.GAME.burst());
    focus(m);                              // вокруг этого мгновения и режем
    await live(sc.hold * 0.55);
    close(m);
    continue;
  }
  if (sc.open === "boss") {
    // Босса ждём именно живым: jumpTo ставит очередь, но выходит он по
    // своему таймеру, и кадр «вот-вот появится» показывает пустую арену.
    //
    // Узнаём его ПО КЛАССУ, и это третья попытка — две предыдущие врали:
    //   `maxHp > 400` (так делает tools/shots.mjs) работает на второй минуте,
    //   но к пятой столько здоровья набирает рядовой враг;
    //   `e.name` — имя есть и у мицелиевого щупальца, обычного врага.
    // Класс не врёт: игра сама отличает босса ровно так же (`instanceof Boss`
    // в main.js). Модули не минифицируются, поэтому имя класса на месте.
    // Ждём ЖИВЫМ ЦИКЛОМ, а не waitForFunction. Разница решающая: пока
    // Playwright ждёт своё условие, бот не делает ничего — а он бессмертен
    // ровно потому, что каждый тик подновляет себе здоровье. На пятой минуте
    // без этого забег кончается за секунды, и босс не выходит уже никогда.
    let bossOut = false;
    for (let i = 0; i < 70 && !bossOut; i++) {
      await live(0.4);
      bossOut = await page.evaluate(() => window.GAME.enemies.some(window.isBossEl));
    }
    // Встаём к нему вплотную: перемотка выпускает босса где угодно, и без
    // этого первые секунды сцены — дорога к нему через пустую арену.
    await page.evaluate(() => {
      const g = window.GAME, p = g.player;
      const b = g.enemies.find(window.isBossEl);
      // Камеру не трогаем: она и так каждый кадр едет за игроком
      // (camera.follow в update), а в отладочном объекте её может не быть.
      if (b && p) { p.x = b.x + 150; p.y = b.y + 110; }
    });
    const bossName = await page.evaluate(() => g_name());
    console.log(`    босс в кадре: ${bossName || "НЕ НАЙДЕН"}`);
    await live(1.2, { keepBoss: true });    // дать ему выйти в кадр
    const m = mark(sc.name, sc.hold);
    await live(sc.hold, { keepBoss: true });
    close(m);
    continue;
  }
  const m = mark(sc.name, sc.hold);
  await live(sc.hold);
  close(m);
}
await release();

if (errors.length) console.log("Ошибки на странице:", errors.join(" | "));
await ctx.close();          // видео дописывается только после закрытия контекста
await browser.close();
server.kill();

const webm = readdirSync(RAW).filter(f => f.endsWith(".webm")).map(f => join(RAW, f))[0];
if (!webm) { console.error("Playwright не отдал видео"); process.exit(1); }

// РЕЗКА И ПЕРЕКОДИРОВАНИЕ.
//
// Playwright пишет всё с момента создания контекста: загрузку страницы, экран
// загрузки, перемотку забега и ожидание босса. В ролик из этого не идёт
// ничего — берутся только окна, отмеченные сценами.
//
// Ключи, каждый из которых стоит на своём месте:
//   -ss/-t          — окно ролика; длительность режем по сценарию, а не по
//                     тому, сколько успел записать браузер;
//   scale flags=neighbor — пиксель-арт нельзя сглаживать при масштабировании:
//                     любой другой фильтр даёт мыло, а мыло — это «пиксельные
//                     артефакты» из п. 8.3.1;
//   -crf 18         — с запасом по качеству: артефакты сжатия там же, в 8.3.1;
//   -pix_fmt yuv420p — иначе часть плееров (и проверка консоли) файл не берёт;
//   -movflags +faststart — заголовок в начало, чтобы ролик начинал играть до
//                     полной загрузки;
//   -an             — звука нет: Playwright его не пишет, а пустая дорожка в
//                     файле только путает.
// Вырезаем окна сцен и склеиваем встык. trim/setpts на каждую сцену, потом
// concat — так ролик получается ровно из того, что задумано сценарием, без
// перемоток и ожиданий между ними.
// Сцена подрезается до задуманной длины: записанная длина больше почти
// всегда (см. mark), а потолок площадки — 28 секунд на весь ролик.
const cuts = marks.filter(m => m.to > m.from).map(m => {
  const want = m.want * 1000;
  let from = m.from, to = m.to;
  if (to - from > want) {
    if (m.focus != null) {
      // Мгновение, ради которого сцена снята, ставим на 55% окна: чуть
      // больше подводки, чем последствий, — так событие читается.
      from = Math.max(m.from, m.focus - want * 0.55);
      to = Math.min(m.to, from + want);
      from = Math.max(m.from, to - want);
    } else {
      to = from + want;
    }
  }
  return { ...m, from, to };
});
if (!cuts.length) { console.error("Ни одна сцена не отмечена"); process.exit(1); }
const parts = cuts.map((m, i) =>
  `[0:v]trim=start=${(m.from / 1000).toFixed(3)}:end=${(m.to / 1000).toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
const chain = cuts.map((_, i) => `[v${i}]`).join("");
// Масштабирования нет намеренно: видео пишется в своём размере (см. VIDEO),
// а любой пересчёт пиксель-арта — это мыло, то есть п. 8.3.1.
const filter = `${parts.join(";")};${chain}concat=n=${cuts.length}:v=1:a=0[cat];[cat]fps=30[out]`;

const args = [
  "-y", "-i", webm,
  "-filter_complex", filter, "-map", "[out]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
  MP4,
];
mkdirSync(OUT, { recursive: true });
try {
  execFileSync(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
} catch (e) {
  console.error("ffmpeg не справился:\n" + String(e.stderr || e).slice(-2000));
  process.exit(1);
}
if (!keepRaw) rmSync(RAW, { recursive: true, force: true });

const size = statSync(MP4).size;
const probe = spawnSync(FFMPEG, ["-hide_banner", "-i", MP4], { encoding: "utf8" }).stderr || "";
const dur = (probe.match(/Duration: (\d+:\d+:\d+\.\d+)/) || [])[1] || "?";
const res = (probe.match(/, (\d+x\d+)[ ,]/) || [])[1] || "?";
console.log("\nСцены в ролике:");
for (const m of cuts) console.log(`  · ${m.name} — ${((m.to - m.from) / 1000).toFixed(1)} с`);
console.log(`\nГотово: ${MP4.replace(ROOT + "/", "")}`);
console.log(`  ${res}, ${dur}, ${(size / 1048576).toFixed(1)} МБ`);
console.log("  потолки площадки: 16:9, высота от 400, до 28 с, до 100 МБ");
if (size > 100 * 1048576) console.log("  ВНИМАНИЕ: файл больше 100 МБ");
