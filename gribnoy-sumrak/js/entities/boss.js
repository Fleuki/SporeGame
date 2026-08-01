import { dist } from "../utils/math.js";
import { CONFIG } from "../config.js";
export class Boss {
  constructor(x,y,typeKey){
    const c=CONFIG.bosses[typeKey]; this.x=x; this.y=y; this.typeKey=typeKey; this.name=c.name;
    this.radius=c.radius; this.maxHp=c.hp; this.hp=this.maxHp; this.damage=c.damage; this.xpReward=c.xpReward;
    this.color=c.color; this.abilities=c.abilities||[]; this.dead=false; this.timer=0;
    this.sneezeTimer=0; this.isStunned=false; this.stunTimer=0; this.tentacleTimer=0; this.pulseTimer=0;
  }
  update(player,enemies,sporeLevel){
    if(this.dead) return null; this.timer++;
    if(this.typeKey==="mother_cap"){
      if(this.isStunned){ this.stunTimer--; if(this.stunTimer<=0) this.isStunned=false; return null; }
      this.sneezeTimer++; if(this.sneezeTimer>=CONFIG.bosses.mother_cap.sneezeInterval){ this.isStunned=true; this.stunTimer=CONFIG.bosses.mother_cap.sneezeCooldown; this.sneezeTimer=0; return "sneeze"; }
      if(this.timer%120===0) return "spawn_minions";
    }
    if(this.typeKey==="mycelium_heart"){
      this.tentacleTimer++; this.pulseTimer++;
      if(this.tentacleTimer>=CONFIG.bosses.mycelium_heart.tentacleInterval){ this.tentacleTimer=0; return "summon_tentacle"; }
      if(this.pulseTimer>=CONFIG.bosses.mycelium_heart.pulseInterval){ this.pulseTimer=0; return "pulse"; }
    }
    const d=dist(this.x,this.y,player.x,player.y);
    if(d<this.radius+player.radius) player.takeDamage(this.damage*0.2);
    return null;
  }
  takeDamage(a){ this.hp-=a; return this.hp<=0; }
  draw(renderer){
    if(this.dead) return;
    renderer.drawGlowCircle(this.x,this.y,this.radius+10,this.color.body[0],25);
    const img=renderer.loader?.getImage("boss_"+this.typeKey);
    if(img){ renderer.drawSprite(img,this.x,this.y,this.radius*2.8,this.radius*2.8); }
    else {
      renderer.drawGradientCircle(this.x,this.y,this.radius,this.color.body);
      renderer.ctx.beginPath(); renderer.ctx.arc(this.x,this.y-this.radius*0.3,this.radius*0.8,Math.PI,0);
      renderer.ctx.fillStyle=this.color.body[1]; renderer.ctx.fill();
    }
    if(this.isStunned) renderer.drawText("💫",this.x-6,this.y-this.radius-15,{font:"16px monospace",color:"#ff0"});
    renderer.drawText(this.name,this.x,this.y-this.radius-20,{font:"12px monospace",color:"#00d4aa",align:"center"});
    const bw=100,bh=6; renderer.ctx.fillStyle="#1a1a1a"; renderer.ctx.fillRect(this.x-bw/2,this.y-this.radius-14,bw,bh);
    renderer.ctx.fillStyle=this.hp/this.maxHp>0.5?"#ff3333":"#c4a000"; renderer.ctx.fillRect(this.x-bw/2,this.y-this.radius-14,bw*(this.hp/this.maxHp),bh);
  }
}