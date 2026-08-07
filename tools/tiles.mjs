// ТАЙЛЫ ЗЕМЛИ — рисуются кодом, а не генерируются.
//
// Почему не нейросетью. У тайла есть одно жёсткое требование, которого от
// генератора добиться нельзя: БЕСШОВНОСТЬ. Земля выкладывается сеткой по всей
// арене, и если правый край не сходится с левым, по всему экрану идёт решётка
// из стыков — это заметнее любой красоты внутри тайла. Здесь бесшовность не
// проверяется, а следует из устройства: весь шум периодический по решётке,
// свёрнутой по модулю, а пятна, которые вылезают за край, дорисовываются с
// противоположной стороны.
//
// Второе: земля обязана быть САМЫМ ТИХИМ в кадре. Сгенерированные текстуры
// были нарисованы как иллюстрации — плотный фрактальный узор с высоким
// контрастом, — и враги в них тонули; движку пришлось заводить и тинт поверх
// земли, и светящийся контур врагам. Здесь диапазон яркости задаётся числом
// (см. VALUES) и не может уехать.
//
//   node tools/tiles.mjs           — перерисовать все четыре биома
//   node tools/tiles.mjs moss      — только один
//
// Результат кладётся в assets-raw и прогоняется обычной нормализацией: тайлы
// проходят через ту же обрезанную палитру земли, что и всё остальное.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { encodePng } from "./png.mjs";
import { RAMPS } from "./palette.mjs";
import { CONFIG } from "../docs/js/config.js";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const RAW=join(ROOT,"assets-raw/map");
const SIZE=CONFIG.map.tileSize;   // 200: ровно столько, сколько тайл занимает в мире

// Пять ступеней яркости на биом — от впадины до бугра. Больше не нужно:
// палитра земли всё равно обрезана сверху, а ступеней сверх пяти на таком
// диапазоне глаз не различает.
// Ступени идут от впадины к бугру, и они НАРОЧНО близкие: тайл — это фактура,
// а не пейзаж. Разнообразие в кадр добавляет движок поверх (пятна соседнего
// биома, крупные пятна света и тени, тропы — см. CONFIG.map), и если тайл сам
// по себе пёстрый, всё это складывается в мешанину. Ровно так и было.
//
// Самая светлая ступень встречается редко — на неё приходится верхняя четверть
// диапазона шума. Поэтому бирюза в биолюме читается как редкая жила, а не как
// залитое поле, каким она вышла в первой попытке.
const BIOMES={
  moss:   { file:"ground_moss.png",   ramp:[RAMPS.moss[0],RAMPS.moss[0],RAMPS.moss[1],RAMPS.moss[2]],
            specks:[{color:RAMPS.fungus[1],n:60,r:[1,2]},{color:RAMPS.biolum[0],n:22,r:[1,1]}] },
  dirt:   { file:"ground_dirt.png",   ramp:[RAMPS.iron[0],RAMPS.leather[0],RAMPS.leather[0],RAMPS.leather[1]],
            specks:[{color:RAMPS.iron[1],n:80,r:[1,2]},{color:RAMPS.leather[1],n:34,r:[1,2]}] },
  biolum: { file:"ground_biolum.png", ramp:[RAMPS.moss[0],RAMPS.moss[0],RAMPS.moss[1],RAMPS.biolum[0]],
            specks:[{color:RAMPS.biolum[0],n:40,r:[1,2]},{color:RAMPS.fungus[1],n:16,r:[1,1]}] },
  bone:   { file:"ground_bone.png",   ramp:[RAMPS.iron[0],RAMPS.iron[0],RAMPS.iron[1],RAMPS.spore[0]],
            specks:[{color:RAMPS.spore[0],n:46,r:[1,2]},{color:RAMPS.fungus[0],n:20,r:[1,2]}] }
};

// Детерминированный хеш решётки. Свёрнут по модулю периода — отсюда и
// бесшовность: узел на правом краю это буквально тот же узел, что на левом.
function hash(x,y,period,seed){
  const i=((x%period)+period)%period, j=((y%period)+period)%period;
  let h=i*374761393+j*668265263+seed*1442695040888963407;
  h=(h^(h>>13))*1274126177;
  return ((h^(h>>16))>>>0)/4294967295;
}

const smooth=(t)=>t*t*(3-2*t);

function noise(x,y,period,seed){
  const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
  const u=smooth(xf), v=smooth(yf);
  const a=hash(xi,yi,period,seed),      b=hash(xi+1,yi,period,seed);
  const c=hash(xi,yi+1,period,seed),    d=hash(xi+1,yi+1,period,seed);
  return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v;
}

// Четыре октавы: крупный рельеф задаёт «места», мелкая — фактуру.
// Периоды кратны друг другу и делят размер тайла нацело, иначе стык вернётся.
function fbm(x,y,seed){
  let sum=0, amp=1, norm=0, period=4;
  for(let o=0;o<4;o++){
    sum+=noise(x*period/SIZE,y*period/SIZE,period,seed+o*17)*amp;
    norm+=amp; amp*=0.5; period*=2;
  }
  return sum/norm;
}

const hex=(h)=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];

function build(def,seed){
  const data=Buffer.alloc(SIZE*SIZE*4);
  const ramp=def.ramp.map(hex);
  for(let y=0;y<SIZE;y++){
    for(let x=0;x<SIZE;x++){
      // РАСТЯЖЕНИЕ КОНТРАСТА. Сумма октав кучкуется вокруг 0.5 и краёв
      // диапазона почти не достаёт: без этой строки в первой попытке мох и
      // грязь вышли одноцветными, потому что все пиксели попадали в одну
      // среднюю ступень. Берём рабочую часть распределения (0.34..0.66) и
      // растягиваем её на все ступени.
      const v=Math.max(0,Math.min(0.9999,(fbm(x,y,seed)-0.34)/0.32));
      const c=ramp[Math.floor(v*ramp.length)];
      const i=(y*SIZE+x)*4;
      data[i]=c[0]; data[i+1]=c[1]; data[i+2]=c[2]; data[i+3]=255;
    }
  }
  // Крапины: камешки, споры, огоньки. Кладутся с заворотом через края —
  // пятно, вылезшее справа, дорисовывается слева, и шва снова нет.
  let s=seed*7919;
  const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
  for(const sp of def.specks){
    const c=hex(sp.color);
    for(let k=0;k<sp.n;k++){
      const cx=rnd()*SIZE, cy=rnd()*SIZE;
      const r=sp.r[0]+rnd()*(sp.r[1]-sp.r[0]);
      for(let dy=-Math.ceil(r);dy<=Math.ceil(r);dy++){
        for(let dx=-Math.ceil(r);dx<=Math.ceil(r);dx++){
          if(dx*dx+dy*dy>r*r) continue;
          const x=((Math.round(cx+dx)%SIZE)+SIZE)%SIZE;
          const y=((Math.round(cy+dy)%SIZE)+SIZE)%SIZE;
          const i=(y*SIZE+x)*4;
          data[i]=c[0]; data[i+1]=c[1]; data[i+2]=c[2];
        }
      }
    }
  }
  return {width:SIZE,height:SIZE,data};
}

const only=process.argv[2];
mkdirSync(RAW,{recursive:true});
let n=0, seed=1;
for(const [key,def] of Object.entries(BIOMES)){
  seed+=101;
  if(only&&key!==only) continue;
  writeFileSync(join(RAW,def.file),encodePng(build(def,seed)));
  console.log("assets-raw/map/"+def.file+"  "+SIZE+"x"+SIZE);
  n++;
}
if(!n){ console.error("Нет такого биома. Есть: "+Object.keys(BIOMES).join(", ")); process.exit(1); }
execFileSync(process.execPath,[join(ROOT,"tools/normalize.mjs"),"map/"],{stdio:"inherit"});
