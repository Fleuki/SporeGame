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
import { RAMPS } from "./palette.mjs";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const RAW=join(ROOT,"assets-raw");
const API="https://api.pixellab.ai/v2";

// СТИЛЕВОЙ ХВОСТ. Приклеивается к каждому промпту, чтобы «одинаковый стиль»
// не зависел от того, что человек вспомнил написать в этот раз. Ровно та же
// формулировка лежит в ASSET_PROMPTS.md — при правке менять оба места.
const STYLE=
  "16-bit pixel art, dark bioluminescent fungal forest, muted desaturated "+
  "palette of deep greens teals and fungal purples, single soft light source "+
  "from above, clear readable silhouette, flat colours with hard edges, "+
  "no outline glow, no drop shadow under the subject, no ground, no scenery";

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
  // Прозрачный фон просим у API, а не вырезаем потом по цветности: у
  // генераторов «прозрачный фон» в ПРОМПТЕ обычно оборачивается нарисованной
  // серой шахматкой (об этом отдельный раздел в ASSET_PROMPTS.md), а вот
  // отдельным параметром это уже настоящий альфа-канал.
  no_background: !flag("bg",false)
};
// Палитра игры отдаётся модели сразу: нормализация всё равно сведёт цвета к
// ней, но если модель рисует уже в этих тонах, то и светотень она кладёт по
// ним — а не «как получится, потом ужмут».
if(!flag("no-palette",false)) body.forced_palette=Object.values(RAMPS).flat();
if(flag("ref")){
  const p=join(RAW,flag("ref"));
  body.init_image={ type:"base64", base64:readFileSync(p).toString("base64") };
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
