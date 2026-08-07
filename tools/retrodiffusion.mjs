// ГЕНЕРАЦИЯ ЧЕРЕЗ RETRO DIFFUSION — второй поставщик картинок, рядом с
// tools/pixellab.mjs и по тем же правилам: результат кладётся в assets-raw и
// сразу прогоняется нормализацией.
//
// Зачем второй. У них разные сильные места, и выбирать стоит по задаче:
//   * PixelLab умеет ПОВОРОТЫ и АНИМАЦИЮ из одного кадра — на нём собраны
//     листы ходьбы и все многокадровые враги (tools/pixellab-sheet.mjs);
//   * Retro Diffusion умеет БЕСШОВНЫЕ тайлы (tile_x/tile_y) и принимает
//     палитру картинкой, а платится за штуку и без подписки.
//
// ТОКЕН: RD_TOKEN в окружении или tools/.rd-token (файл в .gitignore).
// Берётся на retrodiffusion.ai -> Developer Tools -> Create API Key.
//
//   node tools/retrodiffusion.mjs --out=props/prop_rock.png --size=96 "a mossy boulder"
//
//   --out=<путь>    куда в assets-raw положить (обязательно)
//   --size=64       сторона (или 96x64). МИНИМУМ 64: на 32 сервис отвечает
//                   «inference_failed» без объяснений — проверено запросом
//   --fit=32        уменьшить полученную картинку до этой стороны перед
//                   записью. Нужно ровно из-за минимума выше: иконка на 32
//                   заказывается как 64 и ужимается здесь
//   --style=<id>    стиль модели, по умолчанию rd_plus__default
//   --ref=<путь>    образец из assets-raw (img2img)
//   --strength=0.7  насколько сильно уходить от образца (0..1)
//   --tile          бесшовно по обеим осям — для тайлов земли
//   --key           вырезать сплошной фон заливкой от краёв. Прозрачного фона
//                   сервис не отдаёт вовсе, а предметные стили рисуют объект
//                   на ровной подложке — её и снимаем
//   --seed=42       повторяемость
//   --no-palette    не навязывать палитру игры
//   --credits       показать остаток и выйти
//   --dry           показать запрос и выйти

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { PALETTE } from "./palette.mjs";
import { decodePng, encodePng } from "./png.mjs";
import { downscale, cutBorder } from "./image.mjs";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const RAW=join(ROOT,"assets-raw");
const API="https://api.retrodiffusion.ai/v1";

// Тот же стилевой хвост, что у второго поставщика. Он обязан быть общим:
// иначе картинки от двух сервисов разойдутся ровно так же, как когда-то
// разошлись картинки от двух запусков одного.
const STYLE=
  "dark bioluminescent fungal forest, muted desaturated palette of deep "+
  "greens teals and fungal purples, single soft light source from above, "+
  "clear readable silhouette, flat colours, no drop shadow under the subject, "+
  "no ground, no scenery";

function token(){
  const env=process.env.RD_TOKEN;
  if(env) return env.trim();
  const f=join(ROOT,"tools/.rd-token");
  if(existsSync(f)) return readFileSync(f,"utf8").trim();
  console.error(
    "Нет токена. Возьмите его на retrodiffusion.ai -> Developer Tools ->\n"+
    "Create API Key и либо\n  export RD_TOKEN=...\n"+
    "либо положите в tools/.rd-token (файл в .gitignore).");
  process.exit(1);
}

const args=process.argv.slice(2);
const flag=(n,d=null)=>{
  const a=args.find(x=>x.startsWith("--"+n+"="));
  return a?a.slice(n.length+3):(args.includes("--"+n)?true:d);
};

const head=()=>({ "X-RD-Token":token(), "Content-Type":"application/json" });

if(flag("credits")){
  const r=await fetch(API+"/inferences/credits",{headers:head()});
  console.log(await r.text());
  process.exit(0);
}

const prompt=args.filter(a=>!a.startsWith("--")).join(" ");
const out=flag("out");
if(!prompt||!out){ console.error("Нужны описание и --out=<путь внутри assets-raw>"); process.exit(1); }

const sizeArg=String(flag("size","64"));
const [w,h]=sizeArg.includes("x")?sizeArg.split("x").map(Number):[+sizeArg,+sizeArg];

// Палитра уходит картинкой — как и у второго поставщика. Источник правды один
// на всё: tools/palette.mjs.
function paletteImage(){
  const n=PALETTE.length;
  const data=Buffer.alloc(n*4);
  PALETTE.forEach((c,i)=>{ data[i*4]=c.r; data[i*4+1]=c.g; data[i*4+2]=c.b; data[i*4+3]=255; });
  return encodePng({width:n,height:1,data}).toString("base64");
}

const body={
  prompt: prompt+". "+STYLE,
  prompt_style: flag("style","rd_plus__default"),
  width:w, height:h, num_images:1
};
if(flag("seed")) body.seed=+flag("seed");
if(!flag("no-palette",false)) body.input_palette=paletteImage();
// Бесшовность — то, ради чего этот поставщик здесь вообще нужен: у тайла
// правый край обязан сходиться с левым, иначе по всей арене идёт решётка
if(flag("tile")){ body.tile_x=true; body.tile_y=true; }
if(flag("ref")){
  const src=decodePng(readFileSync(join(RAW,flag("ref"))));
  const fit=(src.width===w&&src.height===h)?src:downscale(src,w,h);
  body.input_image=encodePng(fit).toString("base64");
  body.strength=+flag("strength","0.7");
}

if(flag("dry")){
  console.log(JSON.stringify({...body,input_palette:body.input_palette?"<...>":undefined,
                              input_image:body.input_image?"<...>":undefined},null,1));
  process.exit(0);
}

const res=await fetch(API+"/inferences",{method:"POST",headers:head(),body:JSON.stringify(body)});
const text=await res.text();
if(!res.ok){
  // Тело ошибки печатаем целиком: там написано, кончились ли кредиты, велик
  // ли размер, неизвестен ли стиль
  console.error("Retro Diffusion ответил "+res.status+":\n"+text);
  process.exit(1);
}
const data=JSON.parse(text);
const b64=data.base64_images?.[0];
if(!b64){ console.error("В ответе нет картинки:\n"+text.slice(0,600)); process.exit(1); }

let img=decodePng(Buffer.from(b64,"base64"));
// Фон снимаем ДО уменьшения: после ужатия край подложки смешивается с
// краем предмета, и заливка либо не доходит, либо выедает контур
if(flag("key")) cutBorder(img,+(flag("key")===true?10:flag("key")));
if(flag("fit")){
  const f=String(flag("fit"));
  const [fw,fh]=f.includes("x")?f.split("x").map(Number):[+f,+f];
  img=downscale(img,fw,fh);
}
const dst=join(RAW,out);
mkdirSync(dirname(dst),{recursive:true});
writeFileSync(dst,encodePng(img));
console.log("assets-raw/"+out+"  ("+img.width+"x"+img.height+")"+
  (data.balance_cost!=null?"  списано "+data.balance_cost:"")+
  (data.remaining_balance!=null?", осталось "+data.remaining_balance:""));

execFileSync(process.execPath,[join(ROOT,"tools/normalize.mjs"),out],{stdio:"inherit"});
