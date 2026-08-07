// ИКОНКИ КАРТОЧЕК ПРОКАЧКИ — собираются из уже существующих ассетов.
//
// Генерировать их отдельно не нужно и, пожалуй, неправильно. Карточка
// «Тяжёлая склянка» должна показывать ТУ САМУЮ склянку, которая летит в
// врага, а не нарисованную заново похожую: иначе интерфейс и мир расходятся,
// а игрок запоминает две разные картинки для одной вещи.
//
// Поэтому иконка — это кадр из боевого спрайта, уменьшенный до 32 пикселей.
// Ветки без своего снаряда (снаряжение, мутации, эволюция) берут предмет,
// который их означает: красную склянку, гриб-переростка, кристалл.
//
//   node tools/icons.mjs
//
// Источники читаются из docs/assets/images (то есть уже нормализованные), а
// результат кладётся туда же. В assets-raw эти файлы не нужны: они не
// оригиналы, а производные, и пересобираются одной командой.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng } from "./png.mjs";
import { crop, downscale } from "./image.mjs";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const IMG=join(ROOT,"docs/assets/images");
const SIZE=32;

// [категория, файл-источник, сетка кадров, какой кадр брать]
const ICONS=[
  ["antidote",   "projectiles/potion.png",       [1,1], [0,0]],
  ["toxic",      "projectiles/vial_toxic.png",   [1,1], [0,0]],
  ["incendiary", "projectiles/vial_fire.png",    [1,1], [0,0]],
  // Новый ствол — герб игры: скрещённые склянки, то есть буквально «ещё одна
  // склянка в наборе»
  ["weapon",     "ui/emblem.png",                [1,1], [0,0]],
  // Эволюция — самый крупный кристалл из листа опыта: единственный предмет в
  // игре, который читается как «это редкое»
  ["evolution",  "drops/drop_crystal.png",       [4,1], [3,0]],
  ["extract",    "drops/drop_antidote.png",      [1,1], [0,0]],
  // Мутация — сам заражённый: карточка продаёт силу за то, чтобы стать им
  ["mutation",   "enemies/spore_bearer.png",     [4,1], [0,0]],
  ["gear",       "drops/drop_potion.png",        [1,1], [0,0]],
  ["burst",      "ui/icon_spore.png",            [1,1], [0,0]]
];

let n=0;
for(const [cat,src,[gc,gr],[cx,cy]] of ICONS){
  const p=join(IMG,src);
  if(!existsSync(p)){ console.error("нет источника: "+src); continue; }
  const img=decodePng(readFileSync(p));
  const fw=Math.round(img.width/gc), fh=Math.round(img.height/gr);
  const frame=(gc===1&&gr===1)?img:crop(img,cx*fw,cy*fh,fw,fh);
  // Квадратим по большей стороне, чтобы иконки не разъезжались по высоте:
  // источники бывают и 66x96, и 512x512
  const side=Math.max(frame.width,frame.height);
  const pad={width:side,height:side,data:Buffer.alloc(side*side*4)};
  const ox=(side-frame.width)>>1, oy=(side-frame.height)>>1;
  for(let y=0;y<frame.height;y++){
    frame.data.copy(pad.data,((y+oy)*side+ox)*4,y*frame.width*4,(y+1)*frame.width*4);
  }
  writeFileSync(join(IMG,"ui/icon_up_"+cat+".png"),encodePng(downscale(pad,SIZE,SIZE)));
  n++;
}
console.log("иконок собрано: "+n+" (docs/assets/images/ui/icon_up_*.png)");
