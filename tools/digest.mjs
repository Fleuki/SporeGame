// СЛЕПОК ПРОЕКТА ОДНИМ ФАЙЛОМ — чтобы показать игру чату, у которого нет
// доступа к репозиторию.
//
//   node tools/digest.mjs        — собрать build/digest-*.md
//
// Зачем это вообще нужно. Claude Code видит репозиторий целиком и ходит по
// нему сам. Обычный чат так не умеет: ему надо ПРИНЕСТИ файлы. Принести весь
// проект нельзя — это больше мегабайта текста, и разговор захлебнётся в
// исходниках раньше, чем дойдёт до сути.
//
// Поэтому слепка ДВА, и они для разных разговоров:
//
//   digest-design.md — ЗАМЫСЕЛ. Что за игра, какие решения принимались и
//     почему, что отменялось и на чём. Это то, что нужно для планирования
//     СЛЕДУЮЩЕЙ игры: ошибки и правила переносятся, а код нет.
//
//   digest-code.md — КОД целиком, с деревом файлов. Нужен, только если
//     разговор про сам код: разбор, ревью, перенос механики.
//
// Порядок внутри не алфавитный, а от общего к частному: чат читает сверху
// вниз, и первым он должен встретить «что это за игра», а не список ассетов.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build");
mkdirSync(OUT, { recursive: true });

const read = (p) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch { return null; } };
const kb = (s) => (Buffer.byteLength(s, "utf8") / 1024).toFixed(0) + " КБ";

// --- ЗАМЫСЕЛ ---------------------------------------------------------------
// ASSET_PROMPTS сюда НЕ идёт намеренно: это 114 КБ промптов на генерацию
// картинок, полезных ровно один раз и только внутри этого проекта. Для
// планирования новой игры они шум.
const DESIGN = [
  ["docs/DESIGN_DOC.md", "Что это за игра — короткое описание замысла"],
  ["docs/HANDOFF.md",    "ГЛАВНЫЙ ДОКУМЕНТ: каждое решение и почему оно такое, включая отменённые"],
  ["docs/ROADMAP.md",    "План развития и что из него сбылось"],
  ["docs/YANDEX.md",     "Публикация на площадке: требования, ловушки, происхождение ассетов"],
  ["docs/README.txt",    "Как запустить и что где лежит"],
];

// --- КОД -------------------------------------------------------------------
function walk(dir, acc = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = dir + "/" + e.name;
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(js|html|css)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function build(name, title, intro, files) {
  const parts = [`# ${title}\n\n${intro}\n`];
  parts.push("## Что внутри\n");
  for (const [p, why] of files) {
    const body = read(p);
    if (body) parts.push(`- \`${p}\` — ${why} (${kb(body)})`);
  }
  parts.push("\n---\n");
  for (const [p, why] of files) {
    const body = read(p);
    if (!body) continue;
    const lang = p.endsWith(".md") || p.endsWith(".txt") ? "" : p.split(".").pop();
    parts.push(`\n## ${p}\n\n_${why}_\n\n\`\`\`${lang}\n${body}\n\`\`\`\n`);
  }
  const text = parts.join("\n");
  writeFileSync(join(OUT, name), text);
  console.log(`${name.padEnd(20)} ${kb(text).padStart(8)}  файлов: ${files.length}`);
}

build("digest-design.md", "Грибной Сумрак: замысел и решения",
  "Браузерная игра на чистом JavaScript без сборки. Здесь собраны документы\n" +
  "проекта: что это за игра, какие решения принимались, какие отменялись и\n" +
  "почему. Кода тут нет — он в отдельном слепке.",
  DESIGN);

build("digest-code.md", "Грибной Сумрак: код целиком",
  "Весь исходный код игры. Ванильный JavaScript, модули ES6, сборки нет —\n" +
  "папка открывается как есть. Числа баланса живут в config.js с\n" +
  "объяснениями, почему они такие.",
  walk("docs/js").concat(["docs/index.html", "docs/css/style.css"])
    .map(p => [p, p.split("/").slice(-2).join("/")]));
