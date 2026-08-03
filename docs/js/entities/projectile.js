import { CONFIG } from "../config.js";

export class Projectile {
  constructor(x,y,angle,damage,type="antidote"){
    this.x=x; this.y=y;
    this.vx=Math.cos(angle)*7; this.vy=Math.sin(angle)*7;
    this.radius=type==="antidote"?5:6;
    this.damage=damage; this.life=100; this.type=type;
    this.angle=angle;
    // === НОВОЕ: анимация снаряда ===
    this.animFrame=0;
    this.animTimer=0;
  }

  update(){
    this.x+=this.vx; this.y+=this.vy; this.life--;
    // === НОВОЕ: крутим анимацию склянки ===
    this.animTimer++;
    if(this.animTimer>=CONFIG.projectile.animSpeed){
      this.animTimer=0;
      this.animFrame=(this.animFrame+1)%CONFIG.projectile.cols;
    }
  }

  isOffScreen(w,h){ return this.x<-30||this.x>w+30||this.y<-30||this.y>h+30; }

  draw(renderer){
    // Ключ загрузчика из CONFIG.assets.images, а не путь к файлу.
    const img=renderer.loader?.getImage("projectile");
    if(img){
      renderer.drawSpriteSheet(
        img, this.x, this.y,
        CONFIG.projectile.frameW, CONFIG.projectile.frameH,
        this.animFrame, 0,
        CONFIG.projectile.displaySize,
        this.angle
      );
    } else {
      // Fallback
      if(this.type==="antidote"){
        renderer.drawGlowCircle(this.x,this.y,this.radius,"#00d4aa",12);
        renderer.drawCircle(this.x,this.y,this.radius,"#aaffff");
      } else {
        renderer.drawGlowCircle(this.x,this.y,this.radius,"#39ff14",12);
        renderer.drawCircle(this.x,this.y,this.radius,"#39ff14");
      }
    }
  }
}
