// СБОРКА СПРАЙТОВОГО ЛИСТА ПЕРСОНАЖА через PixelLab.
//
// Зачем отдельно от pixellab.mjs. Одиночная картинка не даёт ни четырёх
// направлений, ни цикла шага, а листу ходьбы нужно и то и другое: четыре ряда
// (вниз, вправо, влево, вверх) по четыре кадра. Здесь это собирается в три
// шага, каждый — своя ручка API:
//
//   1. РЕФЕРЕНС. Берётся кадр из УЖЕ СУЩЕСТВУЮЩЕГО листа поз. Это главное:
//      прошлый лист бега сгенерировали с нуля по описанию, и вышел другой
//      персонаж — другие пропорции, другой цвет, олива вместо фиолетового.
//      Пока модель видит настоящего героя картинкой, она рисует его, а не
//      «кого-то по описанию».
//   2. ПОВОРОТЫ (/generate-8-rotations-v3): из одного кадра — восемь видов.
//      Берём из них четыре нужных.
//   3. ШАГ (/animate-with-text-v3): из каждого вида — цикл ходьбы.
//
// Готовые кадры складываются в лист tools/image.mjs и кладутся в assets-raw,
// после чего зовётся обычная нормализация.
//
//   node tools/pixellab-sheet.mjs \
//     --ref=player/alchemist_purple.png --ref-grid=4x4 --ref-cell=0,0 \
//     --out=player/alchemist_run.png --size=64 --frames=4 \
//     --action="walking, side view of the legs, cloak swaying"
//
// Порядок рядов в листе — тот же, что читает Player.angleToRow:
// 0 вниз, 1 вправо, 2 влево, 3 вверх. Менять его нельзя, не меняя игру.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { decodePng, encodePng } from "./png.mjs";
import { crop, downscale, compose } from "./image.mjs";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const RAW=join(ROOT,"assets-raw");
// Референс берётся из СОБРАННОЙ папки, а не из оригиналов: образцом стиля
// должно служить то, как игра выглядит сейчас — общая палитра, чистая альфа,
// нужная плотность пикселя. Оригинал тянет за собой ровно те беды, от которых
// нормализация и избавлялась. Флаг --raw-ref возвращает старое поведение.
const OUT=join(ROOT,"docs/assets/images");
const API="https://api.pixellab.ai/v2";

// Ряды листа игры -> номера видов среди восьми поворотов.
//
// В документации порядок описан как South, South-West, West, North-West,
// North, North-East, East, South-East, и по нему «вправо» — это шестой вид.
// ПРОВЕРЕНО ГЛАЗАМИ НА ГОТОВОМ ЛИСТЕ: шестой смотрит ВЛЕВО, второй — ВПРАВО.
// Стороны света у них считаются не от персонажа, а навстречу ему.
//
// Ровно на этом проект уже горел один раз: в player.js стояло «1 — влево,
// 2 — вправо», и герой бежал влево, а смотрел вправо (см. комментарий там же).
// Поэтому здесь номера взяты из наблюдения, а не из документации, и после
// КАЖДОЙ генерации листа направления надо сверять кадром, а не доверием.
const ROWS=[
  {name:"вниз",  rot:0},
  {name:"вправо",rot:2},
  {name:"влево", rot:6},
  {name:"вверх", rot:4}
];

function token(){
  const env=process.env.PIXELLAB_TOKEN;
  if(env) return env.trim();
  const f=join(ROOT,"tools/.pixellab-token");
  if(existsSync(f)) return readFileSync(f,"utf8").trim();
  console.error("Нет токена: PIXELLAB_TOKEN или tools/.pixellab-token");
  process.exit(1);
}

const args=process.argv.slice(2);
const flag=(n,d=null)=>{
  const a=args.find(x=>x.startsWith("--"+n+"="));
  return a?a.slice(n.length+3):(args.includes("--"+n)?true:d);
};

const refPath=flag("ref"), out=flag("out");
if(!refPath||!out){ console.error("Нужны --ref и --out"); process.exit(1); }
const size=+flag("size",64);
const frames=+flag("frames",4);
const action=flag("action","walking");

// Кадр-референс вырезается из листа поз: сетка и клетка задаются флагами,
// потому что у разных листов они разные
const ref=decodePng(readFileSync(join(flag("raw-ref",false)?RAW:OUT,refPath)));
const [gc,gr]=String(flag("ref-grid","1x1")).split("x").map(Number);
const [cc,cr]=String(flag("ref-cell","0,0")).split(",").map(Number);
const fw=ref.width/gc, fh=ref.height/gr;
const first=downscale(crop(ref,cc*fw,cr*fh,fw,fh),size,size);

const b64=(img)=>encodePng(img).toString("base64");
const post=async(path,body)=>{
  const r=await fetch(API+path,{
    method:"POST",
    headers:{Authorization:"Bearer "+token(),"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const t=await r.text();
  if(!r.ok){ console.error("\n"+path+" -> "+r.status+"\n"+t); process.exit(1); }
  return JSON.parse(t);
};

// Обе ручки отвечают фоновой задачей: ждём и показываем, что не зависли
async function wait(job){
  if(!job.background_job_id) return job;
  const id=job.background_job_id;
  for(let i=0;i<180;i++){
    await new Promise(r=>setTimeout(r,2000));
    const j=await (await fetch(API+"/background-jobs/"+id,
      {headers:{Authorization:"Bearer "+token()}})).json();
    if(j.status==="completed") return j.last_response;
    if(j.status==="failed"){ console.error("\nзадача провалилась: "+JSON.stringify(j)); process.exit(1); }
    process.stdout.write(".");
  }
  console.error("\nне дождались задачи "+id); process.exit(1);
}
const img64=(o)=>decodePng(Buffer.from(
  (o.base64||o.image?.base64||"").replace(/^data:image\/\w+;base64,/,""),"base64"));

if(flag("dry")){
  console.log(`референс ${refPath} клетка ${cc},${cr} из сетки ${gc}x${gr} -> ${size}x${size}`);
  console.log(`лист: 4 ряда x ${frames} кадров, действие «${action}»`);
  console.log(`итог: assets-raw/${out} (${frames*size}x${4*size})`);
  process.exit(0);
}

process.stdout.write("повороты ");
const seed=flag("seed")?+flag("seed"):null;
const rot=await wait(await post("/generate-8-rotations-v3",{
  first_frame:{type:"base64",base64:b64(first)},
  description:flag("who","")||undefined,
  no_background:true,
  ...(seed!==null?{seed}:{})
}));
const views=(rot.images||[]).map(img64);
if(views.length<8){ console.error("\nждали 8 поворотов, пришло "+views.length); process.exit(1); }
console.log(" готово");

const rows=[];
for(const r of ROWS){
  process.stdout.write("шаг «"+r.name+"» ");
  const anim=await wait(await post("/animate-with-text-v3",{
    first_frame:{type:"base64",base64:b64(views[r.rot])},
    action, frame_count:frames, no_background:true,
    ...(seed!==null?{seed}:{})
  }));
  const list=(anim.images||[]).map(img64);
  if(!list.length){ console.error("\nкадров не пришло"); process.exit(1); }
  rows.push(list.slice(0,frames));
  console.log(" готово");
}

const sheet=compose(rows,size,size);
const dst=join(RAW,out);
mkdirSync(dirname(dst),{recursive:true});
writeFileSync(dst,encodePng(sheet));
console.log("assets-raw/"+out+"  "+sheet.width+"x"+sheet.height);
execFileSync(process.execPath,[join(ROOT,"tools/normalize.mjs"),out],{stdio:"inherit"});
