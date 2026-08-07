// ГЕНЕРАЦИЯ КАРТИНОК ЧЕРЕЗ PIXELLAB.
//
// Почему скриптом, а не коннектором. Коннекторы на claude.ai — закрытый
// список готовых интеграций, добавить туда свой сервис нельзя. У PixelLab
// есть свой MCP-сервер, но и он ничего не меняет по существу: картинка всё
// равно возвращается файлом, который надо положить в assets-raw и прогнать
// через нормализацию. Скрипт делает обе половины сразу и, в отличие от
// диалога, повторяется дословно: тот же промпт с тем же seed даёт тот же
// файл, а история запросов остаётся в git вместе с результатом.
//
// ТОКЕН берётся из переменной окружения PIXELLAB_TOKEN (или из файла
// tools/.pixellab-token — он в .gitignore). В репозиторий он не попадает
// ни при каком раскладе: это ключ от платного счёта.
//
//   export PIXELLAB_TOKEN=...
//   node tools/pixellab.mjs --out=enemies/spore_bat.png --size=64 \
//        "a bat made of fungus, wings spread, seen from above"
//
//   --out=<путь>     куда в assets-raw положить (обязательно)
//   --size=64        сторона в пикселях (или 96x64). Потолок API — 400x400
//   --ref=<путь>     картинка-образец из assets-raw: стиль берётся с неё
//   --no-palette     не навязывать палитру игры (по умолчанию навязывается)
//   --bg             оставить фон (по умолчанию просим прозрачный)
//   --dry            показать, что будет отправлено, и выйти
//
// После записи файла скрипт САМ зовёт нормализацию по этому пути: между
// «сгенерировалось» и «лежит в игре в общей палитре» не должно быть шага,
// который можно забыть.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { PALETTE } from "./palette.mjs";
import { decodePng, encodePng } from "./png.mjs";
import { downscale } from "./image.mjs";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const RAW=join(ROOT,"assets-raw");
const API="https://api.pixellab.ai/v2";

// СТИЛЕВОЙ ХВОСТ. Приклеивается к каждому промпту, чтобы «одинаковый стиль»
// не зависел от того, что человек вспомнил написать в этот раз. Ровно та же
// формулировка лежит в ASSET_PROMPTS.md — при правке менять оба места.
const STYLE=
  "dark bioluminescent fungal forest, muted desaturated palette of deep "+
  "greens teals and fungal purples, single soft light source from above, "+
  "clear readable silhouette, no drop shadow under the subject, "+
  "no ground, no scenery";

// СТИЛЕВЫЕ ЗАМКИ — не словами, а параметрами. Словам модель следует «примерно»
// и каждый раз по-разному; эти четыре поля она понимает однозначно, и именно
// они держат набор одним набором.
//   view: high top-down — камера игры смотрит сверху, и вид сбоку в неё
//     просто не встаёт: ровно поэтому старые декорации выглядели наклейками;
//   outline: selective — чёрный контур по всему силуэту на тёмной арене
//     превращает фигуру в дырку, а без контура вовсе она в ней тонет;
//   shading: basic — плоские заливки с одной ступенью тени. «Detailed» даёт
//     градиенты, которые квантование всё равно срежет, но силуэт успеет
//     размыться;
//   detail: low — на 64 пикселях подробности не читаются, а место занимают.
const LOCKS={ view:"high top-down", outline:"selective outline",
              shading:"basic shading", detail:"low detail" };

// ПАЛИТРА ОТДАЁТСЯ КАРТИНКОЙ. У API нет поля со списком цветов: он принимает
// color_image — картинку, из которой берёт палитру. Собираем её прямо здесь
// из tools/palette.mjs, чтобы источник правды остался один.
function paletteImage(){
  const n=PALETTE.length;
  const data=Buffer.alloc(n*4);
  PALETTE.forEach((c,i)=>{ data[i*4]=c.r; data[i*4+1]=c.g; data[i*4+2]=c.b; data[i*4+3]=255; });
  return encodePng({width:n,height:1,data}).toString("base64");
}

function token(){
  const env=process.env.PIXELLAB_TOKEN;
  if(env) return env.trim();
  const file=join(ROOT,"tools/.pixellab-token");
  if(existsSync(file)) return readFileSync(file,"utf8").trim();
  console.error(
    "Нет токена. Возьмите его на pixellab.ai/account и либо\n"+
    "  export PIXELLAB_TOKEN=...\n"+
    "либо положите в tools/.pixellab-token (файл в .gitignore).");
  process.exit(1);
}

const args=process.argv.slice(2);
const flag=(name,def=null)=>{
  const a=args.find(x=>x.startsWith("--"+name+"="));
  if(a) return a.slice(name.length+3);
  return args.includes("--"+name)?true:def;
};
const prompt=args.filter(a=>!a.startsWith("--")).join(" ");
const out=flag("out");
if(!prompt||!out){
  console.error("Нужны описание и --out=<путь внутри assets-raw>");
  process.exit(1);
}
const sizeArg=String(flag("size","64"));
const [w,h]=sizeArg.includes("x")?sizeArg.split("x").map(Number):[+sizeArg,+sizeArg];

const body={
  description: prompt+". "+STYLE,
  image_size: { width:w, height:h },
  ...LOCKS,
  // Прозрачный фон просим у API, а не вырезаем потом по цветности: у
  // генераторов «прозрачный фон» в ПРОМПТЕ обычно оборачивается нарисованной
  // серой шахматкой (об этом отдельный раздел в ASSET_PROMPTS.md), а вот
  // отдельным параметром это уже настоящий альфа-канал.
  no_background: !flag("bg",false)
};
// Вид можно переопределить: тайлы земли и лежащие на земле пятна снимаются
// строго сверху, а не «высоко сверху»
if(flag("view")) body.view=flag("view");
if(flag("direction")) body.direction=flag("direction");
// Иногда no_background не срабатывает и модель рисует целую сцену — так вышло
// с волком в лоб: пень, трава, грибы вокруг. Тогда просим ОТДЕЛЬНУЮ операцию
// снятия фона: она чистит уже нарисованное, а не просит не рисовать.
if(flag("rm-bg")) body.background_removal_task=
  flag("rm-bg")===true?"remove_complex_background":flag("rm-bg");
if(flag("seed")) body.seed=+flag("seed");
// Палитра игры отдаётся модели сразу: нормализация всё равно сведёт цвета к
// ней, но если модель рисует уже в этих тонах, то и светотень она кладёт по
// ним — а не «как получится, потом ужмут».
if(!flag("no-palette",false)) body.color_image={ type:"base64", base64:paletteImage() };
if(flag("ref")){
  // Образец обязан быть РОВНО того же размера, что заказанная картинка:
  // иначе API отвечает 422. Ужимаем сами — иначе пришлось бы держать рядом с
  // каждым промптом заранее уменьшенную копию, и они разъехались бы с
  // оригиналами на первой же перерисовке.
  const src=decodePng(readFileSync(join(RAW,flag("ref"))));
  const fit=(src.width===w&&src.height===h)?src:downscale(src,w,h);
  body.init_image={ type:"base64", base64:encodePng(fit).toString("base64") };
  if(flag("ref-strength")) body.init_image_strength=+flag("ref-strength");
}

if(flag("dry")){
  console.log(JSON.stringify({...body,init_image:body.init_image?"<...>":undefined},null,1));
  process.exit(0);
}

const res=await fetch(API+"/create-image-pixflux",{
  method:"POST",
  headers:{ "Authorization":"Bearer "+token(), "Content-Type":"application/json" },
  body:JSON.stringify(body)
});
const text=await res.text();
if(!res.ok){
  // Тело ошибки печатаем целиком: у платного API в нём написано, что именно
  // не так — кончились деньги, велик размер, не та палитра
  console.error("PixelLab ответил "+res.status+":\n"+text);
  process.exit(1);
}
let data=JSON.parse(text);

// Часть ручек отвечает сразу картинкой, часть — фоновой задачей. Разбираем оба
// случая, чтобы скрипт не разваливался от смены ручки в будущем.
if(!data.image&&data.background_job_id){
  const id=data.background_job_id;
  process.stdout.write("задача "+id+" ");
  for(let i=0;i<120;i++){
    await new Promise(r=>setTimeout(r,2000));
    const j=await (await fetch(API+"/background-jobs/"+id,
      {headers:{"Authorization":"Bearer "+token()}})).json();
    if(j.status==="completed"){ data=j.last_response; break; }
    if(j.status==="failed") { console.error("\nзадача провалилась: "+JSON.stringify(j)); process.exit(1); }
    process.stdout.write(".");
  }
  console.log("");
}
const b64=data.image?.base64;
if(!b64){ console.error("В ответе нет картинки:\n"+JSON.stringify(data).slice(0,600)); process.exit(1); }

const dst=join(RAW,out);
mkdirSync(dirname(dst),{recursive:true});
writeFileSync(dst,Buffer.from(b64.replace(/^data:image\/\w+;base64,/,""),"base64"));
console.log("assets-raw/"+out+"  ("+w+"x"+h+")"+
  (data.usage?.usd?"  $"+data.usage.usd.toFixed(3):""));

// Сразу собираем игровой вариант: иначе «сгенерировал и забыл прогнать»
execFileSync(process.execPath,[join(ROOT,"tools/normalize.mjs"),out],{stdio:"inherit"});
