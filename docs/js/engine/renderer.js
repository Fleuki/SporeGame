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
