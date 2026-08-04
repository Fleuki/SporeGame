import { CONFIG } from "../config.js";

export class Renderer {
  constructor(canvas){
    this.canvas=canvas; this.ctx=canvas.getContext("2d");
    this.loader=null; this.camera=null;
    this.playerX=0; this.playerY=0;
  }

  clear(){ this.ctx.fillStyle=CONFIG.colors.grass; this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height); }

  // Всё между begin/end рисуется в мировых координатах
  begin(){ this.camera?.begin(this.ctx); }
  end(){ this.camera?.end(this.ctx); }

  // --- фон -----------------------------------------------------------
  // Фон раньше рисовался по размеру холста и вместе с ним стоял на месте.
  // Теперь оба слоя строятся по видимому куску мира, поэтому земля
  // прокручивается под игроком и мир выглядит бесконечным.

  drawGrid(step=60){
    const c=this.camera; if(!c) return;
    const x0=Math.floor(c.x/step)*step, y0=Math.floor(c.y/step)*step;
    this.ctx.strokeStyle="rgba(0,212,170,0.06)"; this.ctx.lineWidth=1;
    for(let x=x0;x<=c.x+c.w;x+=step){
      this.ctx.beginPath(); this.ctx.moveTo(x,c.y); this.ctx.lineTo(x,c.y+c.h); this.ctx.stroke();
    }
    for(let y=y0;y<=c.y+c.h;y+=step){
      this.ctx.beginPath(); this.ctx.moveTo(c.x,y); this.ctx.lineTo(c.x+c.w,y); this.ctx.stroke();
    }
  }

  drawMyceliumVeins(tile=180){
    const c=this.camera; if(!c) return;
    this.ctx.strokeStyle="rgba(107,45,92,0.15)"; this.ctx.lineWidth=1.5;
    const tx0=Math.floor(c.x/tile), tx1=Math.floor((c.x+c.w)/tile);
    const ty0=Math.floor(c.y/tile), ty1=Math.floor((c.y+c.h)/tile);
    for(let tx=tx0;tx<=tx1;tx++){
      for(let ty=ty0;ty<=ty1;ty++){
        // Детерминированный «шум» по индексам клетки: узор привязан к миру
        // и не перерисовывается каждый кадр в новом месте.
        const h=(tx*73856093^ty*19349663)>>>0;
        const ox=(h%100)/100*tile, oy=((h>>7)%100)/100*tile;
        const x=tx*tile+ox, y=ty*tile+oy;
        this.ctx.beginPath();
        this.ctx.moveTo(x,y); this.ctx.lineTo(x+30,y+20); this.ctx.lineTo(x+10,y+50);
        this.ctx.stroke();
      }
    }
  }

  // Затемнение по краям экрана: рисуется в экранном слое, после end()
  drawVignette(strength=0.5){
    if(strength<=0) return;
    const w=this.canvas.width, h=this.canvas.height;
    const grad=this.ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.35,w/2,h/2,Math.max(w,h)*0.72);
    grad.addColorStop(0,"rgba(0,0,0,0)"); grad.addColorStop(1,`rgba(0,0,0,${strength})`);
    this.ctx.fillStyle=grad; this.ctx.fillRect(0,0,w,h);
  }

  // --- декорации карты -----------------------------------------------
  // shadowBlur считается заново на каждый вызов и заметно проседает по FPS,
  // поэтому светящийся вариант спрайта один раз готовится в offscreen-канвасе.
  glowSprite(img,key,color,blur){
    if(!this._glowCache) this._glowCache=new Map();
    let g=this._glowCache.get(key);
    if(!g){
      const pad=Math.ceil(blur*1.5);
      const cv=document.createElement("canvas");
      cv.width=img.width+pad*2; cv.height=img.height+pad*2;
      const gc=cv.getContext("2d");
      gc.shadowBlur=blur; gc.shadowColor=color;
      gc.drawImage(img,pad,pad);
      gc.drawImage(img,pad,pad); // второй проход — свечение плотнее
      g={canvas:cv,pad}; this._glowCache.set(key,g);
    }
    return g;
  }

  // Декорация стоит на земле: (x,y) — точка опоры, низ по центру спрайта.
  // opts.flat — объект лежит на земле (лужа): рисуется по центру и без тени.
  // opts.frames/opts.frame — кадр из листа, кадры идут в один ряд.
  drawProp(key,x,y,w,h,opts={}){
    const img=this.loader?.getImage(key);
    if(!img||!img.width) return;
    const ctx=this.ctx;
    ctx.save();
    if(!opts.flat){
      ctx.beginPath();
      ctx.ellipse(x,y-h*0.03,w*0.36,h*0.09,0,0,Math.PI*2);
      ctx.fillStyle="rgba(0,0,0,0.35)"; ctx.fill();
    }
    ctx.translate(x,opts.flat?y-h/2:y-h);
    if(opts.flip) ctx.scale(-1,1);
    if(opts.frames){
      const fw=img.width/opts.frames;
      ctx.drawImage(img,(opts.frame||0)*fw,0,fw,img.height,-w/2,0,w,h);
    }else if(opts.glow){
      const g=this.glowSprite(img,key,opts.glow,opts.glowBlur||20);
      const px=g.pad*(w/img.width), py=g.pad*(h/img.height);
      ctx.drawImage(g.canvas,-w/2-px,-py,w+px*2,h+py*2);
    }else{
      ctx.drawImage(img,-w/2,0,w,h);
    }
    ctx.restore();
  }

  // Контактная тень под существом. Земля здесь очень «шумная» — мох, грибы,
  // жилы мицелия, — и тёмные силуэты врагов на ней просто терялись. Тень
  // отделяет фигуру от фона и заодно показывает, где существо стоит.
  drawShadow(x,y,rx,ry,alpha=0.4){
    const ctx=this.ctx;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
    ctx.fillStyle=`rgba(0,0,0,${alpha})`;
    ctx.filter="blur(2px)";
    ctx.fill();
    ctx.restore();
  }

  // --- вспышка попадания ----------------------------------------------
  // Белый (или красный) силуэт спрайта, который кладётся поверх кадра на
  // несколько кадров после урона. Перекрашивать спрайт фильтром на каждом
  // кадре дорого, поэтому силуэт всего листа готовится один раз и кэшируется.
  silhouette(img,key,color){
    if(!this._tintCache) this._tintCache=new Map();
    const id=key+"|"+color;
    let cv=this._tintCache.get(id);
    if(!cv){
      cv=document.createElement("canvas");
      cv.width=img.width; cv.height=img.height;
      const c=cv.getContext("2d");
      c.drawImage(img,0,0);
      c.globalCompositeOperation="source-in";   // красим только непрозрачное
      c.fillStyle=color; c.fillRect(0,0,cv.width,cv.height);
      this._tintCache.set(id,cv);
    }
    return cv;
  }

  // Тот же кадр листа, что и drawSpriteSheet, но одним цветом и с прозрачностью
  drawFlash(img,key,x,y,frameW,frameH,col,row,displaySize,flip=false,alpha=0.75,color="#ffffff"){
    if(!img||!img.width||alpha<=0) return;
    const sil=this.silhouette(img,key,color);
    this.ctx.save();
    this.ctx.globalAlpha=Math.min(1,alpha);
    this.ctx.translate(x,y);
    if(flip) this.ctx.scale(-1,1);
    this.ctx.drawImage(sil,col*frameW,row*frameH,frameW,frameH,
                       -displaySize/2,-displaySize/2,displaySize,displaySize);
    this.ctx.restore();
  }

  // --- примитивы -----------------------------------------------------
  drawGradientCircle(x,y,r,colors){
    if(!colors||colors.length<2) colors=["#fff","#000"];
    const grad=this.ctx.createRadialGradient(x-3,y-3,1,x,y,r);
    colors.forEach((c,i)=>grad.addColorStop(i/(colors.length-1),c));
    this.ctx.beginPath(); this.ctx.arc(x,y,r,0,Math.PI*2); this.ctx.fillStyle=grad; this.ctx.fill();
  }
  drawCircle(x,y,r,fill,stroke=null,lw=2){
    this.ctx.beginPath(); this.ctx.arc(x,y,r,0,Math.PI*2);
    if(fill){ this.ctx.fillStyle=fill; this.ctx.fill(); }
    if(stroke){ this.ctx.strokeStyle=stroke; this.ctx.lineWidth=lw; this.ctx.stroke(); }
  }
  drawGlowCircle(x,y,r,color,blur=15){
    this.ctx.save(); this.ctx.shadowBlur=blur; this.ctx.shadowColor=color;
    this.ctx.beginPath(); this.ctx.arc(x,y,r,0,Math.PI*2); this.ctx.fillStyle=color; this.ctx.fill(); this.ctx.restore();
  }
  drawText(text,x,y,opts={}){
    this.ctx.font=opts.font||"14px monospace"; this.ctx.fillStyle=opts.color||"#aaa";
    this.ctx.textAlign=opts.align||"left"; this.ctx.fillText(text,x,y);
  }
  drawSprite(img,x,y,w,h,angle=0){
    if(!img) return; this.ctx.save(); this.ctx.translate(x,y); this.ctx.rotate(angle);
    this.ctx.drawImage(img,-w/2,-h/2,w,h); this.ctx.restore();
  }

  // angle вращает кадр (для снарядов), flip зеркалит его по горизонтали
  // (для персонажа: направление задаётся рядом листа, вращать его нельзя).
  drawSpriteSheet(img,x,y,frameW,frameH,col,row,displaySize,angle=0,flip=false){
    if(!img) return;
    this.ctx.save();
    this.ctx.translate(x,y);
    if(angle) this.ctx.rotate(angle);
    if(flip) this.ctx.scale(-1,1);
    this.ctx.drawImage(img, col*frameW, row*frameH, frameW, frameH, -displaySize/2, -displaySize/2, displaySize, displaySize);
    this.ctx.restore();
  }

  drawOverlay(alpha){ this.ctx.fillStyle=`rgba(13,31,21,${alpha})`; this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height); }
}
