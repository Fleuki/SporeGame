import { angleTo, dist, rand, clamp } from "../utils/math.js";
import { CONFIG } from "../config.js";
export class Enemy {
  constructor(x,y,typeKey,isMutated=false){
    const t=CONFIG.enemies.types[typeKey]||CONFIG.enemies.types.spore_bearer;
    this.x=x; this.y=y; this.typeKey=typeKey; this.radius=t.radius; this.maxHp=t.hp*(isMutated?1.5:1);
    this.hp=this.maxHp; this.baseSpeed=t.speed; this.speed=this.baseSpeed; this.damage=t.damage*(isMutated?1.3:1);
    this.xpReward=t.xpReward*(isMutated?1.5:1); this.color=t.color; this.spriteKey=t.sprite;
    this.abilities=t.abilities||[]; this.isMutated=isMutated; this.dead=false; this.life=0;
    this.trailTimer=0; this.emergeTimer=t.emergeDelay||0; this.grabTimer=0; this.zigzagOffset=0; this.zigzagDir=1;
  }
  update(player,dt,sporeLevel){
    this.life++; if(this.dead) return;
    const sm=sporeLevel>=75?1.5:sporeLevel>=50?1.25:sporeLevel>=25?1.1:1;
    this.speed=this.baseSpeed*sm;
    if(this.abilities.includes("emerge_from_ground")){ this.emergeTimer--; if(this.emergeTimer>0) return; }
    if(this.grabTimer>0){ this.grabTimer--; player.isGrabbed=this.grabTimer>0; return; }
    const a=angleTo(this.x,this.y,player.x,player.y);
    if(this.abilities.includes("zigzag_flight")){
      this.zigzagOffset+=this.zigzagDir*0.15; if(Math.abs(this.zigzagOffset)>1) this.zigzagDir*=-1;
      const perp=a+Math.PI/2; const amp=CONFIG.enemies.types.spore_bat.zigzagAmp;
      this.x+=Math.cos(a)*this.speed+Math.cos(perp)*this.zigzagOffset*amp;
      this.y+=Math.sin(a)*this.speed+Math.sin(perp)*this.zigzagOffset*amp;
    } else {
      this.x+=Math.cos(a)*this.speed; this.y+=Math.sin(a)*this.speed;
    }
    if(this.abilities.includes("spore_trail")||this.abilities.includes("toxic_trail")) this.trailTimer--;
    const d=dist(this.x,this.y,player.x,player.y);
    if(d<this.radius+player.radius){
      if(this.abilities.includes("grab_player")){ this.grabTimer=CONFIG.enemies.types.mycelium_tentacle.grabDuration; player.isGrabbed=true; }
      player.takeDamage(this.damage*0.3); this.hp-=3;
      const push=Math.atan2(this.y-player.y,this.x-player.x);
      this.x+=Math.cos(push)*6; this.y+=Math.sin(push)*6;
    }
  }
  takeDamage(a){ this.hp-=a; return this.hp<=0; }
  draw(renderer){
    if(this.dead) return;
    if(this.abilities.includes("emerge_from_ground")&&this.emergeTimer>0){
      renderer.ctx.strokeStyle="#6b2d5c"; renderer.ctx.lineWidth=2; renderer.ctx.beginPath();
      renderer.ctx.arc(this.x,this.y,10+(45-this.emergeTimer)*0.5,0,Math.PI*2); renderer.ctx.stroke(); return;
    }
    const img=this.spriteKey?renderer.loader?.getImage(this.spriteKey):null;
    if(img){ renderer.drawSprite(img,this.x,this.y,this.radius*2.5,this.radius*2.5); }
    else {
      if(this.isMutated) renderer.drawGlowCircle(this.x,this.y,this.radius+4,"#c4a000",10);
      renderer.drawGradientCircle(this.x,this.y,this.radius,this.color?.body||["#8a8a8a","#6b2d5c"]);
    }
    const ang=angleTo(this.x,this.y,renderer.playerX||0,renderer.playerY||0);
    for(let side=-1;side<=1;side+=2){
      const ex=this.x+Math.cos(ang+side*0.4)*this.radius*0.4, ey=this.y+Math.sin(ang+side*0.4)*this.radius*0.4;
      renderer.drawCircle(ex,ey,this.radius*0.2,"#00d4aa"); renderer.drawCircle(ex+Math.cos(ang)*1.5,ey+Math.sin(ang)*1.5,this.radius*0.08,"#000");
    }
    const hpPct=this.hp/this.maxHp;
    renderer.ctx.fillStyle="#1a1a1a"; renderer.ctx.fillRect(this.x-this.radius,this.y-this.radius-10,this.radius*2,4);
    renderer.ctx.fillStyle=hpPct>0.5?"#00d4aa":hpPct>0.25?"#c4a000":"#ff3333";
    renderer.ctx.fillRect(this.x-this.radius,this.y-this.radius-10,this.radius*2*hpPct,4);
  }
}