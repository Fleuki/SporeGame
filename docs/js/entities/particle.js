import { rand } from "../utils/math.js";
// Сколько цифр урона держим на экране одновременно. Три ствола по толпе
// выдают их сотнями, а читаются всё равно только последние.
const MAX_FLOATERS = 48;

export class ParticleSystem {
  constructor(){ this.particles=[]; this.sporeClouds=[]; this.floaters=[]; }

  // Всплывающий текст: урон по врагу, «КРИТ», потеря HP игроком
  emitText(x,y,text,color="#ffffff",size=13){
    if(this.floaters.length>=MAX_FLOATERS) this.floaters.shift();
    this.floaters.push({
      x:x+(Math.random()*10-5), y, text, color, size,
      vy:-1.15, life:38, maxLife:38
    });
  }
  emit(x,y,color,count=8,smin=1,smax=4,rmin=2,rmax=5){
    for(let i=0;i<count;i++){
      const a=rand(0,Math.PI*2), s=rand(smin,smax);
      this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,radius:rand(rmin,rmax),life:30+rand(0,20),maxLife:50,color,type:"burst"});
    }
  }
  // Вспышка у ствола. Заменяет анимацию броска: показать, что выстрел
  // произошёл, дешевле искрами в точке вылета, чем позой всего персонажа —
  // тем более что стреляем мы три раза в секунду и позу всё равно не разглядеть.
  emitMuzzle(x,y,angle,color="#00d4aa"){
    for(let i=0;i<5;i++){
      const a=angle+rand(-0.45,0.45), s=rand(1.6,3.4);
      this.particles.push({
        x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
        radius:rand(1.5,3.2),life:9+rand(0,5),maxLife:14,color,type:"burst"
      });
    }
  }

  emitSporeCloud(x,y,r,color="#6b2d5c"){ this.sporeClouds.push({x,y,radius:r,color,life:120,maxLife:120}); }
  emitToxicTrail(x,y){ this.particles.push({x,y,vx:rand(-0.3,0.3),vy:rand(-0.3,0.3),radius:rand(3,7),life:40,maxLife:40,color:"#c4a000",type:"trail"}); }
  update(){
    for(let i=this.particles.length-1;i>=0;i--){ const p=this.particles[i]; p.x+=p.vx; p.y+=p.vy; p.vx*=0.96; p.vy*=0.96; p.life--; if(p.life<=0) this.particles.splice(i,1); }
    for(let i=this.sporeClouds.length-1;i>=0;i--){ const c=this.sporeClouds[i]; c.life--; if(c.life<=0) this.sporeClouds.splice(i,1); }
    for(let i=this.floaters.length-1;i>=0;i--){
      const f=this.floaters[i];
      f.y+=f.vy; f.vy*=0.93; f.life--;
      if(f.life<=0) this.floaters.splice(i,1);
    }
  }

  reset(){ this.particles.length=0; this.sporeClouds.length=0; this.floaters.length=0; }
  draw(renderer){
    for(const c of this.sporeClouds){ const a=(c.life/c.maxLife)*0.3; renderer.ctx.globalAlpha=a; renderer.ctx.beginPath(); renderer.ctx.arc(c.x,c.y,c.radius,0,Math.PI*2); renderer.ctx.fillStyle=c.color; renderer.ctx.fill(); }
    renderer.ctx.globalAlpha=1;
    for(const p of this.particles){ const a=p.life/p.maxLife; renderer.ctx.globalAlpha=a; renderer.drawCircle(p.x,p.y,p.radius*a,p.color); }
    renderer.ctx.globalAlpha=1;
    // Цифры урона рисуются последними и с обводкой — иначе они теряются
    // на пёстрой земле
    const ctx=renderer.ctx;
    ctx.textAlign="center"; ctx.lineJoin="round";
    for(const f of this.floaters){
      ctx.globalAlpha=Math.min(1,f.life/f.maxLife*1.6);
      ctx.font="bold "+f.size+"px monospace";
      ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.85)";
      ctx.strokeText(f.text,f.x,f.y);
      ctx.fillStyle=f.color; ctx.fillText(f.text,f.x,f.y);
    }
    ctx.globalAlpha=1; ctx.textAlign="left";
  }
}