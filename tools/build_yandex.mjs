// СБОРКА АРХИВА ДЛЯ ЯНДЕКС ИГР.
//
//   node tools/build_yandex.mjs           — собрать build/yandex/ и zip рядом
//   node tools/build_yandex.mjs --check   — только проверить, ничего не писать
//
// Зачем отдельная сборка, если игра и так статическая папка.
//
// Затем, что это ПРОВЕРКИ. Каждая соответствует пункту критериев модерации и
// каждая ловит отказ ДО того, как игра три дня пролежит на проверке и
// вернётся с формулировкой в одну строку. Плюс архив без документов.
//
// ТЕГ SDK ЗДЕСЬ БОЛЬШЕ НЕ ВПИСЫВАЕТСЯ. Раньше вписывался — и это была дыра
// ровно того размера, за который игру заворачивают по п. 1.1: архив, собранный
// мимо этого скрипта (руками, из `docs/`, из выгрузки GitHub), уезжал на
// площадку вообще без SDK. Теперь тег живёт в `docs/index.html`, а сборка его
// ПРОВЕРЯЕТ.

import { readdir, readFile, writeFile, mkdir, rm, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "docs");
const OUT = path.join(ROOT, "build", "yandex");
const ZIP = path.join(ROOT, "build", "gribnoy-sumrak-yandex.zip");

// SDK ПОДКЛЮЧАЕТСЯ ОТНОСИТЕЛЬНЫМ ПУТЁМ. Это не мелочь и не вкусовщина:
// консоль дважды вернула игру с отказом «не встроено или некорректно встроено
// SDK» (п. 1.1).
//
// Документация («Подключение и использование») делит случаи надвое:
//   — архив, залитый через Консоль, — ОТНОСИТЕЛЬНЫЙ путь `/sdk.js`
//     (рекомендуемый вариант, наш случай);
//   — своё размещение — АБСОЛЮТНЫЙ `https://sdk.games.s3.yandex.net/sdk.js`.
//
// Здесь стоял `https://yandex.ru/games/sdk/v2`. Он живой — запрос отдаёт 200 и
// настоящий скрипт, — и именно это сбило с толку. Живой, но СТАРЫЙ ЛОАДЕР:
// debug-панель показывает на нём «IF — используется старый лоадер», а
// документация в этом состоянии прямо велит переподключить SDK.
//
// Правило, которое из этого следует: «адрес отвечает 200» не значит «адрес
// правильный». Сверяться с документацией, а не с curl.
const SDK_SRC = "/sdk.js";
// Старые и чужие адреса лоадера. В архиве, который уезжает на площадку, любой
// из них — это отказ по п. 1.1, даже если файл по адресу отдаётся.
const SDK_WRONG = [
  { re: /yandex\.ru\/games\/sdk/i, why: "старый лоадер (debug-панель покажет «IF»)" },
  { re: /sdk\.games\.s3\.yandex\.net/i, why: "адрес для СВОЕГО размещения; в архиве путь обязан быть относительным" },
];

// Что в архив не едет. Документы — это переписка проекта с самим собой:
// площадке они не нужны, а лежать в открытом доступе рядом с игрой им незачем.
const SKIP = [/\.md$/i, /README\.txt$/i, /\.DS_Store$/i];

// Потолок площадки — 100 МБ в РАЗАРХИВИРОВАННОМ виде. Считаем с запасом:
// упереться в него на следующем треке гораздо обиднее, чем узнать заранее.
const LIMIT = 100 * 1024 * 1024;

const check = process.argv.includes("--check");

async function walk(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else out.push({ full, rel, name: e.name });
  }
  return out;
}

const files = (await walk(SRC)).filter(f => !SKIP.some(re => re.test(f.rel)));
let total = 0;
for (const f of files) total += (await stat(f.full)).size;

const problems = [];

// 1. index.html в КОРНЕ архива. Без него площадка не находит игру вообще.
if (!files.some(f => f.rel === "index.html")) problems.push("в корне нет index.html");

// 2. Пробелы в именах файлов площадка не принимает.
const spaced = files.filter(f => /\s/.test(f.rel));
if (spaced.length) problems.push(`пробелы в именах: ${spaced.map(f => f.rel).join(", ")}`);

// 3. Размер распакованного.
if (total > LIMIT) problems.push(`распакованный размер ${(total / 1048576).toFixed(1)} МБ больше 100 МБ`);

// 4. АБСОЛЮТНЫЕ ССЫЛКИ. Игра раздаётся с домена площадки: любая ссылка,
//    начинающаяся со слэша или со своего домена, там указывает в никуда.
//    Отдельным пунктом критериев запрещены абсолютные адреса на серверы S3.
const textFiles = files.filter(f => /\.(html|js|css|webmanifest|json)$/i.test(f.rel));
for (const f of textFiles) {
  const body = await readFile(f.full, "utf8");
  for (const m of body.matchAll(/(?:src|href)\s*=\s*["'](\/[^"'\/][^"']*)["']/g)) {
    // ЕДИНСТВЕННОЕ ИСКЛЮЧЕНИЕ — сам SDK площадки. Он и обязан идти от корня
    // домена: его отдаёт хостинг площадки, а не наш архив. Все остальные
    // ссылки от слэша ведут в никуда, потому проверка и стоит.
    if (m[1] === "/sdk.js") continue;
    problems.push(`${f.rel}: абсолютный путь ${m[1]}`);
  }
  // 4a. МЕДИА-ЭЛЕМЕНТЫ. Игра возвращалась с модерации дважды из-за них
  //     (пп. 1.6.2.5 и 1.6.1.6): любой audio-тег, video-тег, конструктор Audio поднимает
  //     системный плеер на десктопе и карточку в шторке уведомлений на
  //     телефоне. Весь звук обязан идти через Web Audio API — и это ровно та
  //     проверка, которую руками забывают.
  for (const m of body.matchAll(/<(?:audio|video)\b|new\s+Audio\s*\(|createMediaElementSource|navigator\.mediaSession/gi)) {
    // Строка, объясняющая, почему медиа-элементов быть не должно, сама по себе
    // не медиа-элемент: комментарии пропускаем.
    const nl = body.lastIndexOf("\n", m.index) + 1;
    const line = body.slice(nl, body.indexOf("\n", m.index) + 1 || body.length);
    if (/^\s*(\/\/|\*|\/\*|<!--)/.test(line)) continue;
    problems.push(`${f.rel}: медиа-элемент «${m[0]}» — весь звук обязан идти через Web Audio API`);
  }
  for (const m of body.matchAll(/https?:\/\/[^"'\s)]+/g)) {
    const url = m[0];
    // Ссылки наружу площадка запрещает: разрешено только то, что ведёт к ней
    // самой. Схемы разметки (w3.org) и адрес самого SDK — не ссылки для
    // игрока, они никуда не ведут.
    if (/w3\.org/.test(url)) continue;
    problems.push(`${f.rel}: внешняя ссылка ${url}`);
  }
}

// 5. SDK ВСТРОЕН, И ВСТРОЕН ВЕРНО (п. 1.1) — то, на чём игра возвращалась
//    дважды. Проверяем всё, что можно проверить по файлу.
{
  const html = await readFile(path.join(SRC, "index.html"), "utf8");
  const head = html.slice(0, html.indexOf("</head>") + 1);
  const tag = new RegExp(`<script[^>]*\\ssrc\\s*=\\s*["']${SDK_SRC}["']`, "i");
  if (!tag.test(head)) {
    problems.push(`index.html: в <head> нет тега SDK <script src="${SDK_SRC}"> — это отказ по п. 1.1`);
  }
  for (const { re, why } of SDK_WRONG) {
    if (re.test(html)) problems.push(`index.html: адрес SDK ${re.source} — ${why}`);
  }
  // Тег обязан идти ДО игры: иначе YaGames не существует к моменту init().
  const sdkAt = html.search(tag), gameAt = html.indexOf("js/main.js");
  if (sdkAt >= 0 && gameAt >= 0 && sdkAt > gameAt) {
    problems.push("index.html: тег SDK стоит ПОСЛЕ игры — YaGames is not defined");
  }
  // Инициализация должна уходить из <head>, а не из игрового модуля: игра —
  // это 32 файла, и ожидание их загрузки держит лоадер площадки в состоянии
  // «W — ожидает инициализации», то есть выглядит как невстроенный SDK.
  if (!/YaGames\s*\.\s*init\s*\(/.test(head)) {
    problems.push("index.html: YaGames.init() не вызывается из <head> — лоадер площадки останется в состоянии «W»");
  }
}

// 6. СТАРТОВЫЙ ЭКРАН НЕ ДОЛЖЕН БЫТЬ ВИДЕН ДО `LoadingAPI.ready()` (п. 1.19).
//    Статически проверить можно только это: экран загрузки в разметке есть, а
//    стартовый спрятан классом. Сам порядок вызовов проверяется прогоном —
//    см. YANDEX.md, раздел «Чем это проверять».
{
  const html = await readFile(path.join(SRC, "index.html"), "utf8");
  if (!/id="bootScreen"/.test(html)) problems.push("index.html: нет экрана загрузки (#bootScreen) — интерфейс окажется доступен до ready()");
  if (!/<div id="startScreen" class="hidden">/.test(html)) problems.push("index.html: стартовый экран не спрятан классом hidden — он покажется до ready()");
}

console.log(`Файлов: ${files.length}, распакованный размер: ${(total / 1048576).toFixed(1)} МБ (потолок 100 МБ)`);
if (problems.length) {
  console.log("\nНАДО ПОЧИНИТЬ ДО ЗАЛИВКИ:");
  for (const p of problems) console.log("  · " + p);
  process.exitCode = 1;
} else {
  console.log("Проверки пройдены: index.html в корне, путей наружу нет, в размер укладываемся.");
}

if (check) process.exit(process.exitCode || 0);
if (problems.length) process.exit(1);

// --- сборка ---------------------------------------------------------------
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const f of files) {
  const dest = path.join(OUT, f.rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(f.full, dest);
}

if (existsSync(ZIP)) await rm(ZIP);
execFileSync("zip", ["-r", "-q", ZIP, "."], { cwd: OUT });
const zipped = (await stat(ZIP)).size;
console.log(`\nГотово: ${path.relative(ROOT, ZIP)} — ${(zipped / 1048576).toFixed(1)} МБ`);
console.log(`Распакованная копия: ${path.relative(ROOT, OUT)}`);
console.log("Черновик и что писать в его поля — docs/YANDEX.md");
