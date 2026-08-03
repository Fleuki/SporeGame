import { CONFIG } from "../config.js";
export class Renderer {
  constructor(canvas){ this.canvas=canvas; this.ctx=canvas.getContext("2d"); this.loader=null; this.playerX=0; this.playerY=0; }
  clear(){ this.ctx.fillStyle=CONFIG.colors.grass; this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height); }
  drawMyceliumVeins(w,h){
    this.ctx.strokeStyle="rgba(107,45,92,0.15)"; this.ctx.lineWidth=1.5;
    for(let i=0;i<40;i++){
      const x=((i*9301+49297)%w), y=((i*49297+9301)%h);
      this.ctx.beginPath(); this.ctx.moveTo(x,y); this.ctx.lineTo(x+30,y+20); this.ctx.lineTo(x+10,y+50); this.ctx.stroke();
    }
  }
  drawGrid(w,h,step=60){
    this.ctx.strokeStyle="rgba(0,212,170,0.06)"; this.ctx.lineWidth=1;
    for(let x=0;x<w;x+=step){ this.ctx.beginPath(); this.ctx.moveTo(x,0); this.ctx.lineTo(x,h); this.ctx.stroke(); }
    for(let y=0;y<h;y+=step){ this.ctx.beginPath(); this.ctx.moveTo(0,y); this.ctx.lineTo(w,y); this.ctx.stroke(); }
  }
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
    this.ctx.font=opts.font||"14px monospace"; this.ctx.fillStyle=opts.color||"#aaa"; this.ctx.textAlign=opts.align||"left"; this.ctx.fillText(text,x,y);
  }
  drawSprite(img,x,y,w,h,angle=0){
    if(!img) return; this.ctx.save(); this.ctx.translate(x,y); this.ctx.rotate(angle); this.ctx.drawImage(img,-w/2,-h/2,w,h); this.ctx.restore();
  }
  // === НОВОЕ: анимированный спрайт-лист ===
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