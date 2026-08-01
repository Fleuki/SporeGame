import { rand } from "../utils/math.js";
export class ParticleSystem {
  constructor(){ this.particles=[]; this.sporeClouds=[]; }
  emit(x,y,color,count=8,smin=1,smax=4,rmin=2,rmax=5){
    for(let i=0;i<count;i++){
      const a=rand(0,Math.PI*2), s=rand(smin,smax);
      this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,radius:rand(rmin,rmax),life:30+rand(0,20),maxLife:50,color,type:"burst"});
    }
  }
  emitSporeCloud(x,y,r,color="#6b2d5c"){ this.sporeClouds.push({x,y,radius:r,color,life:120,maxLife:120}); }
  emitToxicTrail(x,y){ this.particles.push({x,y,vx:rand(-0.3,0.3),vy:rand(-0.3,0.3),radius:rand(3,7),life:40,maxLife:40,color:"#c4a000",type:"trail"}); }
  update(){
    for(let i=this.particles.length-1;i>=0;i--){ const p=this.particles[i]; p.x+=p.vx; p.y+=p.vy; p.vx*=0.96; p.vy*=0.96; p.life--; if(p.life<=0) this.particles.splice(i,1); }
    for(let i=this.sporeClouds.length-1;i>=0;i--){ const c=this.sporeClouds[i]; c.life--; if(c.life<=0) this.sporeClouds.splice(i,1); }
  }
  draw(renderer){
    for(const c of this.sporeClouds){ const a=(c.life/c.maxLife)*0.3; renderer.ctx.globalAlpha=a; renderer.ctx.beginPath(); renderer.ctx.arc(c.x,c.y,c.radius,0,Math.PI*2); renderer.ctx.fillStyle=c.color; renderer.ctx.fill(); }
    renderer.ctx.globalAlpha=1;
    for(const p of this.particles){ const a=p.life/p.maxLife; renderer.ctx.globalAlpha=a; renderer.drawCircle(p.x,p.y,p.radius*a,p.color); }
    renderer.ctx.globalAlpha=1;
  }
}