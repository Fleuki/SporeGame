// Общие операции над картинками: то, что нужно и нормализации, и сборке
// спрайтовых листов. Формат везде один — {width, height, data} с RGBA в
// Buffer, ровно как отдаёт png.mjs.

// Уменьшение усреднением, с учётом прозрачности. Складывать цвет прозрачных
// пикселей наравне с непрозрачными нельзя: у сгенерированных картинок под
// прозрачностью лежит чёрный, и края спрайта уползали бы в грязь.
export function downscale(img,w,h){
  const out=Buffer.alloc(w*h*4);
  const sx=img.width/w, sy=img.height/h;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const x0=Math.floor(x*sx), x1=Math.max(x0+1,Math.floor((x+1)*sx));
      const y0=Math.floor(y*sy), y1=Math.max(y0+1,Math.floor((y+1)*sy));
      let r=0,g=0,b=0,a=0,n=0;
      for(let yy=y0;yy<y1;yy++){
        for(let xx=x0;xx<x1;xx++){
          const i=(yy*img.width+xx)*4, al=img.data[i+3]/255;
          r+=img.data[i]*al; g+=img.data[i+1]*al; b+=img.data[i+2]*al;
          a+=img.data[i+3]; n++;
        }
      }
      const j=(y*w+x)*4, aw=a/255;
      out[j]  = aw>0?Math.round(r/aw):0;
      out[j+1]= aw>0?Math.round(g/aw):0;
      out[j+2]= aw>0?Math.round(b/aw):0;
      out[j+3]= Math.round(a/n);
    }
  }
  return {width:w,height:h,data:out};
}

// Увеличение «ближайшим соседом»: пиксель-арт нельзя интерполировать, иначе
// вся затея с квантованием палитры теряет смысл на первом же растяжении.
export function upscale(img,w,h){
  const out=Buffer.alloc(w*h*4);
  const sx=img.width/w, sy=img.height/h;
  for(let y=0;y<h;y++){
    const yy=Math.min(img.height-1,Math.floor(y*sy));
    for(let x=0;x<w;x++){
      const xx=Math.min(img.width-1,Math.floor(x*sx));
      out.set(img.data.subarray((yy*img.width+xx)*4,(yy*img.width+xx)*4+4),(y*w+x)*4);
    }
  }
  return {width:w,height:h,data:out};
}

export function crop(img,x0,y0,w,h){
  const out=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++){
    const src=((y0+y)*img.width+x0)*4;
    img.data.copy(out,y*w*4,src,src+w*4);
  }
  return {width:w,height:h,data:out};
}

// Сборка листа из готовых кадров. frames — массив рядов, каждый ряд массив
// кадров одинакового размера. Недостающие места остаются прозрачными: лист с
// дыркой лучше, чем лист, съехавший на кадр, — дырку видно сразу.
export function compose(rows,fw,fh){
  const cols=Math.max(...rows.map(r=>r.length));
  const out={width:cols*fw,height:rows.length*fh,
             data:Buffer.alloc(cols*fw*rows.length*fh*4)};
  rows.forEach((row,ry)=>row.forEach((img,cx)=>{
    if(!img) return;
    const src=(img.width===fw&&img.height===fh)?img:downscale(img,fw,fh);
    for(let y=0;y<fh;y++){
      src.data.copy(out.data,((ry*fh+y)*out.width+cx*fw)*4,y*fw*4,(y+1)*fw*4);
    }
  }));
  return out;
}
