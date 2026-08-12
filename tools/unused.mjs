// ЧТО В ИГРЕ ЛЕЖИТ ЗРЯ.
//
//   node tools/unused.mjs            — показать неиспользуемое
//   node tools/unused.mjs --delete   — и удалить его
//
// Зачем инструмент, а не «посмотреть глазами». Ассеты в этой игре берутся
// тремя разными способами, и глазами проверяется только первый:
//
//   1. по имени в CONFIG.assets.images — так грузятся спрайты;
//   2. строкой прямо в разметке или стиле — так живут шкалы, иконки и рамка;
//   3. СКЛЕЙКОЙ ИМЕНИ НА ХОДУ: `"assets/images/ui/icon_up_"+card.category`.
//
// Третий способ и есть причина, по которой «неиспользуемое» нельзя искать
// простым поиском по имени файла: иконки веток прокачки не упоминаются нигде
// целиком. Поэтому здесь собираются ещё и ПРЕФИКСЫ — если в коде встретилась
// склейка, всё, что с неё начинается, считается используемым.
//
// Обратная сторона: конвейер (`normalize.mjs`) обходит `assets-raw` целиком и
// пишет в `docs` ВСЁ, что там найдёт. Значит любой оставленный в исходниках
// файл — старая версия листа, промежуточный кадр — уезжает в игру и в архив
// для площадки, даже если код о нём не знает. Ровно так в игре оказались
// лишние мегабайты.

import { readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const ASSETS = join(DOCS, "assets");
const RAW = join(ROOT, "assets-raw");
const doDelete = process.argv.includes("--delete");

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// Все тексты игры, в которых вообще может быть упомянут ассет
const sources = walk(join(DOCS, "js"))
  .concat([join(DOCS, "index.html"), join(DOCS, "css", "style.css"),
           join(DOCS, "manifest.webmanifest")])
  .filter(p => /\.(js|html|css|webmanifest)$/.test(p));

const text = sources.map(p => readFileSync(p, "utf8")).join("\n");

// Полные пути: "assets/images/enemies/spore_bat.png"
const used = new Set();
for (const m of text.matchAll(/assets\/[A-Za-z0-9_\-./]+\.[a-z0-9]{2,5}/g)) used.add(m[0]);
// Префиксы склеек: "assets/images/ui/icon_up_" + что-то
const prefixes = [];
for (const m of text.matchAll(/["'`](assets\/[A-Za-z0-9_\-./]*[_/])["'`]\s*\+/g)) prefixes.push(m[1]);

// ЧТО НЕ ТРОГАТЬ, ХОТЯ КОД ЭТОГО И НЕ УПОМИНАЕТ. Список короткий и каждый
// пункт с причиной: без причин он за месяц превратится в свалку исключений.
const KEEP = {
  // Лицензия шрифта. OFL требует, чтобы текст лицензии ехал ВМЕСТЕ со
  // шрифтом; удалить его — нарушить условия, на которых шрифт взят.
  "assets/fonts/OFL.txt":
    "лицензия шрифта, по OFL обязана лежать рядом со шрифтом",
  // Образец для генерации листов: pixellab-sheet.mjs берёт референс из
  // собранной папки, а не из исходников (там своя палитра и своя альфа).
  "assets/images/player/alchemist_front.png":
    "образец для tools/pixellab-sheet.mjs, 2 КБ",
};

const files = walk(ASSETS).map(p => ({ p, rel: relative(DOCS, p).replaceAll("\\", "/") }));
const unused = files.filter(f =>
  !used.has(f.rel) && !KEEP[f.rel] && !prefixes.some(pre => f.rel.startsWith(pre)));
const kept = files.filter(f => KEEP[f.rel]);

// Исходники, которых нет в игре: они не попадают в архив (normalize их
// пропускает по хвосту `_src`), но занимают место в репозитории и путают.
const rawFiles = walk(RAW).map(p => ({ p, rel: relative(RAW, p).replaceAll("\\", "/") }));
const rawOrphans = rawFiles.filter(f => {
  if (/_src\.png$/i.test(f.rel)) return false;         // образцы генерации — по делу
  const asDoc = "assets/images/" + f.rel;
  return !used.has(asDoc) && !KEEP[asDoc] && !prefixes.some(pre => asDoc.startsWith(pre));
});

const mb = n => (n / 1048576).toFixed(2) + " МБ";
const size = list => list.reduce((n, f) => n + statSync(f.p).size, 0);

console.log(`Ассетов в игре: ${files.length}, из них не используется: ${unused.length}`);
for (const f of unused) console.log(`  · ${f.rel.padEnd(48)} ${(statSync(f.p).size / 1024).toFixed(0)} КБ`);
console.log(`  итого впустую: ${mb(size(unused))}`);
if (kept.length) {
  console.log("Оставлено намеренно, хотя код их не упоминает:");
  for (const f of kept) console.log(`  · ${f.rel.padEnd(48)} ${KEEP[f.rel]}`);
}
console.log("");

console.log(`Исходников в assets-raw без пары в игре: ${rawOrphans.length}`);
for (const f of rawOrphans) console.log(`  · ${f.rel.padEnd(48)} ${(statSync(f.p).size / 1024).toFixed(0)} КБ`);
console.log(`  итого: ${mb(size(rawOrphans))} (в архив не едут, но лежат в репозитории)`);

if (doDelete) {
  // Размер считается ДО удаления: после него statSync падает на том же
  // списке. Первый прогон именно так и закончился — файлы удалились, а
  // отчёт свалился с ENOENT.
  const freed = size(unused);
  for (const f of unused) rmSync(f.p);
  console.log(`\nУдалено из игры: ${unused.length} файлов, ${mb(freed)}`);
  console.log("Исходники в assets-raw НЕ трогаю: удалять их — решение человека,");
  console.log("а не скрипта. Из них пересобирается всё остальное.");
}
