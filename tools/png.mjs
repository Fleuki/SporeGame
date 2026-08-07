// Чтение и запись PNG на голом Node — без единой зависимости.
//
// Почему не sharp и не pngjs. У игры нет ни сборки, ни node_modules, и это
// осознанное свойство: она открывается как статическая страница. Тащить
// npm-дерево ради инструмента, который трогает картинки раз в месяц, — значит
// заводить в проекте вторую жизнь с обновлениями и уязвимостями. Всё, что тут
// нужно, — распаковать zlib (он в Node встроен) и снять фильтры строк.
//
// Поддерживается ровно то, что лежит в репозитории: 8 бит на канал, цветовые
// типы 0/2/4/6, без чересстрочности. Наткнётесь на другое — код честно
// упадёт с внятной ошибкой, а не молча испортит картинку.

import { inflateSync, deflateSync } from "node:zlib";

const CRC=(()=>{
  const t=new Int32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1;
    t[n]=c;
  }
  return t;
})();

function crc32(buf){
  let c=0xffffffff;
  for(let i=0;i<buf.length;i++) c=CRC[(c^buf[i])&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}

// Байт на пиксель по цветовому типу — он же шаг фильтра «слева»
const CHANNELS={0:1,2:3,4:2,6:4};

export function decodePng(buf){
  if(buf.readUInt32BE(0)!==0x89504e47) throw new Error("не PNG");
  let pos=8, ihdr=null;
  const idat=[];
  while(pos<buf.length){
    const len=buf.readUInt32BE(pos);
    const type=buf.toString("ascii",pos+4,pos+8);
    const data=buf.subarray(pos+8,pos+8+len);
    if(type==="IHDR"){
      ihdr={ width:data.readUInt32BE(0), height:data.readUInt32BE(4),
             depth:data[8], color:data[9], interlace:data[12] };
    } else if(type==="IDAT") idat.push(data);
    else if(type==="IEND") break;
    pos+=12+len;
  }
  if(!ihdr) throw new Error("нет IHDR");
  if(ihdr.depth!==8) throw new Error("поддерживается только 8 бит на канал, здесь "+ihdr.depth);
  if(ihdr.interlace) throw new Error("чересстрочный PNG не поддерживается");
  const ch=CHANNELS[ihdr.color];
  if(!ch) throw new Error("цветовой тип "+ihdr.color+" не поддерживается");

  const raw=inflateSync(Buffer.concat(idat));
  const {width:w,height:h}=ihdr;
  const stride=w*ch;
  const out=Buffer.alloc(stride*h);
  let prev=Buffer.alloc(stride);

  // Снятие фильтров. Порядок строк важен: каждая опирается на предыдущую
  // УЖЕ восстановленную, а не на сырую.
  for(let y=0;y<h;y++){
    const ft=raw[y*(stride+1)];
    const line=raw.subarray(y*(stride+1)+1,y*(stride+1)+1+stride);
    const cur=out.subarray(y*stride,(y+1)*stride);
    for(let i=0;i<stride;i++){
      const a=i>=ch?cur[i-ch]:0, b=prev[i], c=i>=ch?prev[i-ch]:0;
      let v=line[i];
      if(ft===1) v+=a;
      else if(ft===2) v+=b;
      else if(ft===3) v+=(a+b)>>1;
      else if(ft===4){
        const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);
        v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c);
      } else if(ft!==0) throw new Error("неизвестный фильтр строки "+ft);
      cur[i]=v&0xff;
    }
    prev=cur;
  }

  // Наружу всегда отдаём RGBA: остальному коду не должно быть дела до того,
  // в каком виде картинка лежала на диске
  const px=Buffer.alloc(w*h*4);
  for(let i=0,j=0;i<w*h;i++,j+=4){
    if(ihdr.color===6){ out.copy(px,j,i*4,i*4+4); }
    else if(ihdr.color===2){ px[j]=out[i*3]; px[j+1]=out[i*3+1]; px[j+2]=out[i*3+2]; px[j+3]=255; }
    else if(ihdr.color===0){ px[j]=px[j+1]=px[j+2]=out[i]; px[j+3]=255; }
    else if(ihdr.color===4){ px[j]=px[j+1]=px[j+2]=out[i*2]; px[j+3]=out[i*2+1]; }
  }
  return { width:w, height:h, data:px };
}

function chunk(type,data){
  const out=Buffer.alloc(12+data.length);
  out.writeUInt32BE(data.length,0);
  out.write(type,4,"ascii");
  data.copy(out,8);
  out.writeUInt32BE(crc32(out.subarray(4,8+data.length)),8+data.length);
  return out;
}

// Пишем всегда RGBA (тип 6) и фильтр 0. Пиксель-арт после квантования — это
// большие плоские заливки, их zlib и так жмёт до предела; подбирать фильтр
// построчно ради лишнего процента смысла нет.
export function encodePng({width,height,data}){
  const raw=Buffer.alloc((width*4+1)*height);
  for(let y=0;y<height;y++){
    raw[y*(width*4+1)]=0;
    data.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    chunk("IHDR",ihdr),
    chunk("IDAT",deflateSync(raw,{level:9})),
    chunk("IEND",Buffer.alloc(0))
  ]);
}
