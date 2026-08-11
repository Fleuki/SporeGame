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
const cellW=src.width/gCols, cellH=src.height/gRows;
if(!Number.isInteger(cellW)||!Number.isInteger(cellH)){
  console.error(`клетка дробная: ${src.width}x${src.height} на сетку ${gCols}x${gRows} `+
                `даёт ${cellW}x${cellH}. Ряды поедут — обрежьте исходник до кратного размера.`);
  process.exit(1);
}

const rows=list("rows")||Array.from({length:gRows},(_,i)=>i+1);
const cols=list("cols")||Array.from({length:gCols},(_,i)=>i+1);
for(const r of rows) if(r>gRows){ console.error(`ряда ${r} в листе нет`); process.exit(1); }
for(const c of cols) if(c>gCols){ console.error(`колонки ${c} в листе нет`); process.exit(1); }

// Сторона клетки в готовом файле. Масштабируем БЛИЖАЙШИМ СОСЕДОМ: любое
// сглаживание превращает пиксель-арт в мыло, а игра выводит кадр один в один.
const size=Number(arg("size"))||0;
const outCell=size>0?size:Math.max(cellW,cellH);
const outW=outCell*cols.length, outH=outCell*rows.length;
const out=Buffer.alloc(outW*outH*4);

function px(x,y){
  const i=(y*src.width+x)*4;
  return [src.data[i],src.data[i+1],src.data[i+2],src.data[i+3]];
}

for(let ri=0;ri<rows.length;ri++){
  for(let ci=0;ci<cols.length;ci++){
    const sx0=(cols[ci]-1)*cellW, sy0=(rows[ri]-1)*cellH;
    for(let y=0;y<outCell;y++){
      for(let x=0;x<outCell;x++){
        // Клетка исходника может быть не квадратной (кадр 330x317) — вписываем
        // её в квадрат по центру, а не растягиваем: растянутый босс отличался
        // бы пропорциями от того, что нарисовал генератор.
        const fx=Math.floor((x/outCell)*Math.max(cellW,cellH))-Math.floor((Math.max(cellW,cellH)-cellW)/2);
        const fy=Math.floor((y/outCell)*Math.max(cellW,cellH))-Math.floor((Math.max(cellW,cellH)-cellH)/2);
        let p=[0,0,0,0];
        if(fx>=0&&fx<cellW&&fy>=0&&fy<cellH) p=px(sx0+fx,sy0+fy);
        const o=((ri*outCell+y)*outW+(ci*outCell+x))*4;
        out[o]=p[0]; out[o+1]=p[1]; out[o+2]=p[2]; out[o+3]=p[3];
      }
    }
  }
}

writeFileSync(outPath,encodePng({width:outW,height:outH,data:out}));
console.log(`${inPath} ${src.width}x${src.height} (сетка ${gCols}x${gRows}, клетка ${cellW}x${cellH})`);
console.log(`→ ${outPath} ${outW}x${outH}: ряды ${rows.join(",")}, колонки ${cols.join(",")}, клетка ${outCell}`);
console.log(`Дальше обязательно: node tools/normalize.mjs bosses`);
