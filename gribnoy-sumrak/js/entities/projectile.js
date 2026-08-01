import { CONFIG } from "../config.js";
export class Projectile {
  constructor(x,y,angle,damage,type="antidote"){
    this.x=x; this.y=y; this.vx=Math.cos(angle)*7; this.vy=Math.sin(angle)*7;
    this.radius=type==="antidote"?5:6; this.damage=damage; this.life=100; this.type=type;
  }
  update(){ this.x+=this.vx; this.y+=this.vy; this.life--; }
  isOffScreen(w,h){ return this.x<-30||this.x>w+30||this.y<-30||this.y>h+30; }
  draw(renderer){
    if(this.type==="antidote"){ renderer.drawGlowCircle(this.x,this.y,this.radius,"#00d4aa",12); renderer.drawCircle(this.x,this.y,this.radius,"#aaffff"); }
    else { renderer.drawGlowCircle(this.x,this.y,this.radius,"#39ff14",12); renderer.drawCircle(this.x,this.y,this.radius,"#39ff14"); }
  }
}