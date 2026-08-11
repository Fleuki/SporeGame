// СБОРКА ЛИСТА ИЗ ВЫБРАННЫХ РЯДОВ.
//
// Генератор регулярно отдаёт сетку не того размера, что просили: шесть рядов
// вместо четырёх, шесть колонок вместо четырёх, последняя колонка порченая.
// Перегенерация стоит денег и времени, а нужные ряды в листе обычно уже есть —
// просто не те и не в том количестве.
//
// Скрипт вырезает из листа указанные ряды (и, если надо, колонки) и складывает
// из них новый лист в том порядке, в каком они перечислены. Ничего больше он
// не делает: ни палитры, ни масштаба — этим занимается normalize.mjs, который
// и надо запускать следом.
//
//   node tools/pick_rows.mjs --in=assets-raw/bosses/spore_hive_v2.png \
//        --out=assets-raw/bosses/spore_hive.png \
//        --grid=4x6 --rows=1,4,5,6
//
//   --grid   сетка ИСХОДНИКА, колонки x ряды
//   --rows   какие ряды взять, через запятую, нумерация с 1, порядок важен:
//            первый в списке станет верхним рядом нового листа
//   --cols   какие колонки взять (по умолчанию все)
//   --size   сторона клетки в готовом файле; кадр масштабируется ближайшим
//            соседом (пиксель-арт нельзя сглаживать). По умолчанию — как есть.
//
// Размер клетки исходника берётся делением файла на сетку и обязан быть целым:
// «почти квадрат» 1447 на 6 рядов — это дробная клетка, и ряды поедут.

import { readFileSync, writeFileSync } from "node:fs";
import { decodePng, encodePng } from "./png.mjs";
import { downscale, upscale } from "./image.mjs";

function arg(name,def=null){
  const p=process.argv.find(a=>a.startsWith("--"+name+"="));
  return p?p.slice(name.length+3):def;
}
function list(name){
  const v=arg(name); if(!v) return null;
  return v.split(",").map(s=>parseInt(s.trim(),10)).filter(n=>n>0);
}

const inPath=arg("in"), outPath=arg("out");
if(!inPath||!outPath){
  console.error("нужны --in и --out; пример в шапке файла");
  process.exit(1);
}
const grid=(arg("grid")||"4x4").toLowerCase().split("x").map(Number);
const [gCols,gRows]=grid;
if(!(gCols>0&&gRows>0)){ console.error("--grid вида 4x6"); process.exit(1); }

const src=decodePng(readFileSync(inPath));

// ШАГ СЕТКИ. Обычно это просто файл, делённый на сетку, но генератор регулярно
// отдаёт файл, обрезанный на десяток пикселей снизу: у листа Улья вышло
// 1696x2528 при шаге 424, то есть последнему ряду не хватило 16 пикселей.
// Делением такой файл даёт шаг 421.3, и к третьему ряду разметка уезжает на
// полкадра. Поэтому шаг можно задать руками (--cell), а чтение за краем файла
// возвращает прозрачность, а не ошибку.
const cellArg=(arg("cell")||"").toLowerCase().split("x").map(Number);
const cellW=cellArg[0]>0?cellArg[0]:src.width/gCols;
const cellH=(cellArg[1]>0?cellArg[1]:(cellArg[0]>0?cellArg[0]:src.height/gRows));
if(!Number.isInteger(cellW)||!Number.isInteger(cellH)){
  console.error(`клетка дробная: ${src.width}x${src.height} на сетку ${gCols}x${gRows} `+
                `даёт ${cellW}x${cellH}. Задайте шаг явно: --cell=424 — его видно по `+
                `тому, где начинается содержимое каждого ряда.`);
  process.exit(1);
}

const rows=list("rows")||Array.from({length:gRows},(_,i)=>i+1);
const cols=list("cols")||Array.from({length:gCols},(_,i)=>i+1);
for(const r of rows) if(r>gRows){ console.error(`ряда ${r} в листе нет`); process.exit(1); }
for(const c of cols) if(c>gCols){ console.error(`колонки ${c} в листе нет`); process.exit(1); }

// Сторона клетки в готовом файле. Кадр обязан быть кратен экранному размеру
// (`display` в конфиге): нормализация ужимает картинку до него и возвращает
// обратно целым множителем, а при дробном блоки пикселей выходят разной
// ширины. У Улья это 352 = 176x2.
const size=Number(arg("size"))||0;
const square=Math.max(cellW,cellH);
const outCell=size>0?size:square;
const outW=outCell*cols.length, outH=outCell*rows.length;
const out=Buffer.alloc(outW*outH*4);

// Клетка исходника кладётся в КВАДРАТ по центру, а не растягивается: растянутый
// босс отличался бы пропорциями от нарисованного. Чтение за краем файла даёт
// прозрачность — последнему ряду обрезанного листа не хватает пикселей.
function cellToSquare(cx,cy){
  const buf=Buffer.alloc(square*square*4);
  const offX=Math.floor((square-cellW)/2), offY=Math.floor((square-cellH)/2);
  for(let y=0;y<cellH;y++){
    const sy=cy+y;
    if(sy<0||sy>=src.height) continue;
    for(let x=0;x<cellW;x++){
      const sx=cx+x;
      if(sx<0||sx>=src.width) continue;
      const i=(sy*src.width+sx)*4, o=((y+offY)*square+(x+offX))*4;
      buf[o]=src.data[i]; buf[o+1]=src.data[i+1];
      buf[o+2]=src.data[i+2]; buf[o+3]=src.data[i+3];
    }
  }
  return {width:square,height:square,data:buf};
}

for(let ri=0;ri<rows.length;ri++){
  for(let ci=0;ci<cols.length;ci++){
    let cell=cellToSquare((cols[ci]-1)*cellW,(rows[ri]-1)*cellH);
    // Уменьшение — усреднением по площади (тем же, чем нормализация), а
    // увеличение — ближайшим соседом. Пиксель-арт нельзя интерполировать
    // ВВЕРХ, но при уменьшении усреднение сохраняет тонкие детали, которые
    // «ближайший сосед» выбрасывает через одну.
    if(outCell<square) cell=downscale(cell,outCell,outCell);
    else if(outCell>square) cell=upscale(cell,outCell,outCell);
    for(let y=0;y<outCell;y++){
      for(let x=0;x<outCell;x++){
        const i=(y*outCell+x)*4;
        const o=((ri*outCell+y)*outW+(ci*outCell+x))*4;
        out[o]=cell.data[i]; out[o+1]=cell.data[i+1];
        out[o+2]=cell.data[i+2]; out[o+3]=cell.data[i+3];
      }
    }
  }
}

writeFileSync(outPath,encodePng({width:outW,height:outH,data:out}));
console.log(`${inPath} ${src.width}x${src.height} (сетка ${gCols}x${gRows}, шаг ${cellW}x${cellH})`);
console.log(`→ ${outPath} ${outW}x${outH}: ряды ${rows.join(",")}, колонки ${cols.join(",")}, клетка ${outCell}`);
console.log(`Дальше обязательно: node tools/normalize.mjs bosses`);
