// СБОРКА АРХИВА ДЛЯ ЯНДЕКС ИГР.
//
//   node tools/build_yandex.mjs           — собрать build/yandex/ и zip рядом
//   node tools/build_yandex.mjs --check   — только проверить, ничего не писать
//
// Зачем отдельная сборка, если игра и так статическая папка.
//
// Площадка требует ОДНОГО, чего нет в `docs/`: тега своего SDK в index.html.
// Дописать его в сам `docs/index.html` нельзя — там игра открывается со
// своего адреса (GitHub Pages) и с диска, а тег тянул бы скрипт с чужого
// домена на каждой загрузке ради функций, которых на своём адресе нет. Здесь
// же он не мешает никому: архив уезжает только на площадку.
//
// Всё остальное — проверки. Каждая из них соответствует пункту критериев
// модерации и каждая ловит отказ ДО того, как игра три дня пролежит на
// проверке и вернётся с формулировкой в одну строку.

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
// консоль вернула игру с отказом «не встроено или некорректно встроено SDK».
//
// Здесь стоял абсолютный `https://yandex.ru/games/sdk/v2`. Он ЖИВОЙ — запрос
// отдаёт 200 и настоящий скрипт, — и выбран был потому, что документированный
// `yandex.ru/games/sdk.js` отвечает 404 (тоже проверено запросом, отдаёт HTML
// страницы каталога). Ошибка была в другом выводе: раз живой, значит годится.
//
// Не годится. Архив, залитый через Консоль, отдаётся С ДОМЕНА ПЛОЩАДКИ, и
// документация требует для этого случая именно относительный путь. `/sdk.js`
// снаружи 404 не потому, что его нет, а потому, что снаружи мы стучимся не в
// тот домен: на своём хостинге площадка отдаёт его сама.
//
// Правило, которое из этого следует: проверять адрес запросом ИЗВНЕ можно
// только для абсолютных ссылок. Относительный путь проверяется единственным
// способом — заливкой.
const SDK_TAG = `<script src="/sdk.js"></script>`;

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
  for (const m of body.matchAll(/https?:\/\/[^"'\s)]+/g)) {
    const url = m[0];
    // Ссылки наружу площадка запрещает: разрешено только то, что ведёт к ней
    // самой. Схемы разметки (w3.org) и адрес самого SDK — не ссылки для
    // игрока, они никуда не ведут.
    if (/w3\.org/.test(url)) continue;
    problems.push(`${f.rel}: внешняя ссылка ${url}`);
  }
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

// SDK ставится ПЕРВЫМ скриптом страницы и обычным тегом, а не подгрузкой из
// кода: YaGames должен существовать к моменту, когда его спросит игра, а
// модуль игры грузится асинхронно и стартует раньше любого динамического
// скрипта.
const indexPath = path.join(OUT, "index.html");
let html = await readFile(indexPath, "utf8");
if (!html.includes("sdk.js")) {
  const anchor = "</head>";
  html = html.replace(anchor, `  <!-- SDK Яндекс Игр. Тега нет в docs/index.html намеренно: там игра\n       открывается со своего адреса, где этих функций нет вовсе.\n       Вписывается сборкой — tools/build_yandex.mjs. -->\n  ${SDK_TAG}\n${anchor}`);
  await writeFile(indexPath, html);
}

if (existsSync(ZIP)) await rm(ZIP);
execFileSync("zip", ["-r", "-q", ZIP, "."], { cwd: OUT });
const zipped = (await stat(ZIP)).size;
console.log(`\nГотово: ${path.relative(ROOT, ZIP)} — ${(zipped / 1048576).toFixed(1)} МБ`);
console.log(`Распакованная копия: ${path.relative(ROOT, OUT)}`);
console.log("Черновик и что писать в его поля — docs/YANDEX.md");
