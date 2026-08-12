// НОРМАЛИЗАЦИЯ АССЕТОВ.
//
// Что чинит и почему это делается скриптом, а не руками в редакторе.
//
// Замеры по репозиторию до нормализации (посчитаны по пикселям, не на глаз):
//   * у spore_bat 81% непрозрачных пикселей — полупрозрачная ТЁМНАЯ дымка
//     вокруг силуэта, у волка 57%, у Плодовой Матери 49%. Это запечённая в
//     картинку тень: поверх неё движок рисует ещё и свою, и враг выглядит
//     висящим над землёй грязным пятном;
//   * от 500 до 4200 уникальных цветов на спрайт при палитре игры в девять
//     тонов — каждая генерация приносила свою;
//   * средний тон гуляет от 27° до 297°, причём ДВА ЛИСТА ОДНОГО персонажа
//     различались на 40°: стоящий алхимик фиолетовый, бегущий — оливковый;
//   * плотность деталей у декораций втрое выше, чем у врагов: пень нарисован
//     как иллюстрация, враг — как мутное пятно 64 пикселя.
//
// Руками это не лечится: диффузионная модель не умеет держать палитру и
// масштаб между запусками, и следующая генерация принесёт ровно те же беды.
// Поэтому лечится КОНВЕЙЕР: любая картинка, от любой нейросети, проходит
// через один и тот же скрипт и выходит в общей палитре, с общей плотностью
// пикселя и без запечённых теней.
//
// Оригиналы лежат в assets-raw и никогда не правятся на месте:
// docs/assets/images собирается из них заново. Захотелось поменять палитру —
// правится tools/palette.mjs и перезапускается скрипт, а не сорок файлов.
//
//   node tools/normalize.mjs              — пересобрать всё
//   node tools/normalize.mjs enemies      — только совпадающие с подстрокой
//   node tools/normalize.mjs --report     — ничего не писать, показать план
//
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng } from "./png.mjs";
import { nearest } from "./palette.mjs";
import { downscale, upscale } from "./image.mjs";
import { CONFIG } from "../docs/js/config.js";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const RAW=join(ROOT,"assets-raw");
const OUT=join(ROOT,"docs/assets/images");

// ПЛОТНОСТЬ ПИКСЕЛЯ. 1 — один пиксель картинки на одну мировую единицу, то
// есть спрайт, который выводится размером 64, и рисуется в 64 пикселя.
// Это и есть главное, что уравнивает декорации с врагами: до сих пор у пня
// на ту же площадь экрана приходилось втрое больше деталей.
//
// Файл при этом остаётся прежнего размера — блоки просто становятся крупными.
// Так ни одно число в CONFIG (spriteFrameW и вся его родня) не надо трогать.
const PIXEL_SCALE=1;

// alpha: cut — жёсткая отсечка (убивает запечённые тени и дымку),
//        steps — четыре ступени (эффектам нужна прослойка прозрачности,
//                иначе взрыв обрывается краем),
//        keep — не трогать.
const CUT=0.5;

// --- разбор CONFIG: где какой спрайт и каким размером он выводится --------
// Ничего не захардкожено списком: числа берутся из того же конфига, по
// которому игра рисует. Иначе таблица разъезжается с игрой на первой же
// правке размера, и об этом никто не узнает.
function rulesFromConfig(){
  const byKey=new Map();   // ключ ассета -> {cols,rows,display}
  // Один и тот же лист используется в нескольких местах с разными размерами:
  // fx_burst_toxic — это и взрыв склянки на 96, и выброс спор на 330.
  // Побеждает САМЫЙ КРУПНЫЙ: если ужать лист до мелкого применения, крупное
  // превратится в кашу из огромных квадратов, а обратно пиксели не вернуть.
  const put=(key,cols,rows,display)=>{
    if(!key||!display) return;
    const had=byKey.get(key);
    if(had&&had.display>=display) return;
    byKey.set(key,{cols:cols||1,rows:rows||1,display});
  };
  const P=CONFIG.player;
  put("player",P.spriteCols,P.spriteRows,P.spriteDisplaySize);
  put("playerWalk",P.walkCols,P.walkRows,P.walkDisplaySize);
  put("playerDeath",P.deathCols,1,P.deathDisplaySize);

  for(const t of Object.values(CONFIG.enemies.types||{})){
    const s=t.sprite; if(s) put(s.key,s.cols,s.rows,s.display);
    // Лист смерти — такой же спрайт врага, только в один ряд. Без этой
    // строки он проходил бы мимо правил и оставался бы в своей плотности
    // пикселя, то есть ровно тем ассетом «из другой игры», ради которого
    // весь конвейер и заведён.
    if(t.death) put(t.death.key,t.death.cols,1,t.death.display);
  }
  for(const b of Object.values(CONFIG.bosses||{})){
    const s=b.sprite; if(s) put(s.key,s.cols,s.rows,s.display);
  }
  // Венец элиты: своего display у него нет, он рисуется крупнее спрайта врага
  const el=CONFIG.enemies.elite;
  if(el?.sprite) put(el.sprite.key,el.sprite.cols,1,Math.round(76*(el.sizeMult||1.4)));

  for(const w of Object.values(CONFIG.weapons||{})){
    if(w.sprite&&w.display) put(w.sprite,1,1,w.display);
    if(w.burst) put(w.burst.key,w.burst.cols,1,w.burst.display);
    if(w.shot?.sprite&&w.shot.display) put(w.shot.sprite,1,1,w.shot.display);
    if(w.cluster?.shot) {
      const c=w.cluster.shot;
      if(c.sprite&&c.display) put(c.sprite,1,1,c.display);
      if(c.burst) put(c.burst.key,c.burst.cols,1,c.burst.display);
    }
  }
  const fx=CONFIG.sporeSystem?.burst?.fx;
  if(fx) put(fx.key,fx.cols,1,fx.display);

  for(const t of Object.values(CONFIG.loot.types||{})){
    if(t.image&&t.size) put(t.image,1,1,t.size);
  }
  for(const p of Object.values(CONFIG.map.props||{})){
    if(p.image&&p.width) put(p.image,p.frames||1,1,p.width);
  }
  for(const b of CONFIG.map.biomes||[]) put(b.tile,1,1,CONFIG.map.tileSize);
  return byKey;
}

// Ключ ассета по пути файла — через ту же таблицу CONFIG.assets.images,
// по которой игра их и грузит
function keyByPath(){
  const m=new Map();
  for(const [key,path] of Object.entries(CONFIG.assets.images)) m.set(path,key);
  return m;
}

// --- обработка одной картинки ---------------------------------------------

function quantize(img,alphaMode,ground=false){
  const d=img.data;
  for(let i=0;i<d.length;i+=4){
    let a=d[i+3];
    if(alphaMode==="cut") a=a>=CUT*255?255:0;
    else if(alphaMode==="steps") a=Math.round(a/85)*85;
    d[i+3]=a;
    if(a===0){ d[i]=d[i+1]=d[i+2]=0; continue; }
    const p=nearest(d[i],d[i+1],d[i+2],ground);
    d[i]=p.r; d[i+1]=p.g; d[i+2]=p.b;
  }
  return img;
}

// ИСХОДНИКИ ГЕНЕРАЦИИ В ИГРУ НЕ ЕДУТ. Файл с хвостом `_src` — это образец,
// с которого рисовался лист (у Улья это кадр 1696x2528 весом в мегабайт).
// Конвейер обходит assets-raw целиком и пишет в docs ВСЁ, что найдёт, а
// у картинки без записи в CONFIG нет размера кадра — она уезжала в игру как
// есть. Два таких файла занимали два мегабайта в архиве для площадки, то есть
// пятую часть игры, и не показывались ни разу.
const SKIP=/_src\.png$/i;

function walk(dir,acc=[]){
  for(const e of readdirSync(dir,{withFileTypes:true})){
    const p=join(dir,e.name);
    if(e.isDirectory()) walk(p,acc);
    else if(e.name.endsWith(".png")&&!SKIP.test(e.name)) acc.push(p);
  }
  return acc;
}

// --- прогон ----------------------------------------------------------------
const args=process.argv.slice(2);
const report=args.includes("--report");
const filter=args.find(a=>!a.startsWith("--"));

if(!existsSync(RAW)){
  console.error("Нет assets-raw — положите туда оригиналы (см. HANDOFF.md).");
  process.exit(1);
}

const rules=rulesFromConfig(), keys=keyByPath();
let done=0, skipped=0;
for(const file of walk(RAW)){
  const rel=relative(RAW,file).split("\\").join("/");
  if(filter&&!rel.includes(filter)) continue;
  const key=keys.get("assets/images/"+rel);
  const rule=key?rules.get(key):null;
  const img=decodePng(readFileSync(file));

  // Интерфейс не пикселизуем: он выводится браузером один к одному и уже
  // читается. Через палитру гоним всё равно — иначе шкалы и иконки останутся
  // единственным, что не совпадает по тону с миром.
  const isUi=rel.startsWith("ui/");
  let art=null;
  if(!isUi&&rule){
    art=[Math.max(1,Math.round(rule.cols*rule.display*PIXEL_SCALE)),
         Math.max(1,Math.round(rule.rows*rule.display*PIXEL_SCALE))];
  }
  // Эффектам нужна прослойка прозрачности, интерфейсу — родная, всем
  // остальным — жёсткая отсечка, ради которой всё и затевалось
  const alphaMode=isUi?"keep":(rel.startsWith("effects/")?"steps":"cut");
  // Земля идёт по обрезанной палитре — только тёмные ступени (см. palette.mjs)
  const ground=rel.startsWith("map/");

  if(report){
    console.log(rel.padEnd(36),
      art?`${img.width}x${img.height} -> ${art[0]}x${art[1]}`:`${img.width}x${img.height} (без пикселизации)`,
      "альфа:"+alphaMode, key?"":"  ⚠ нет в CONFIG.assets.images");
    continue;
  }

  let work=img;
  if(art&&(art[0]<img.width||art[1]<img.height)){
    work=downscale(img,art[0],art[1]);
    quantize(work,alphaMode,ground);
    work=upscale(work,img.width,img.height);
  } else {
    // Картинка и так мельче своего размера на экране — уменьшать нечего,
    // хватит палитры. Растягивать её вверх скрипт не станет: пиксели оттуда
    // всё равно не появятся.
    quantize(work,alphaMode,ground);
    if(art) skipped++;
  }

  const dst=join(OUT,rel);
  mkdirSync(dirname(dst),{recursive:true});
  writeFileSync(dst,encodePng(work));
  done++;
}
if(!report) console.log(`Готово: ${done} файлов`+(skipped?`, из них ${skipped} без пикселизации (и так мельче экранного размера)`:""));
