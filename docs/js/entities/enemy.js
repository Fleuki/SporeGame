import { angleTo } from "../utils/math.js";
import { CONFIG } from "../config.js";
import { Entity } from "./entity.js";
import { SpriteAnim } from "../engine/sprite.js";

export class Enemy extends Entity {
  constructor(x,y,typeKey,isMutated=false){
    const t=CONFIG.enemies.types[typeKey]||CONFIG.enemies.types.spore_bearer;
    super(x,y,t.radius);
    this.def=t; this.typeKey=typeKey;
    this.maxHp=t.hp*(isMutated?1.5:1); this.hp=this.maxHp;
    this.baseSpeed=t.speed; this.speed=this.baseSpeed;
    this.damage=t.damage*(isMutated?1.3:1);
    this.xpReward=t.xpReward*(isMutated?1.5:1);
    this.color=t.color; this.isMutated=isMutated;
    this.anim=new SpriteAnim(t.sprite); this.moveAngle=0;
    this.abilities=t.abilities||[];
    this.trailTimer=0; this.emergeTimer=t.emergeDelay||0;
    this.grabTimer=0; this.zigzagOffset=0; this.zigzagDir=1;
  }

  update(dt,ctx){
    this.life++; if(this.dead) return;
    const {player,particles,sporeLevel}=ctx;
    const sm=sporeLevel>=75?1.5:sporeLevel>=50?1.25:sporeLevel>=25?1.1:1;
    this.speed=this.baseSpeed*sm;

    if(this.abilities.includes("emerge_from_ground")){ this.emergeTimer--; if(this.emergeTimer>0) return; }
    if(this.grabTimer>0){ this.grabTimer--; player.isGrabbed=this.grabTimer>0; return; }

    const a=angleTo(this.x,this.y,player.x,player.y);
    this.moveAngle=a; this.anim.step(a);
    if(this.abilities.includes("zigzag_flight")){
      this.zigzagOffset+=this.zigzagDir*0.15; if(Math.abs(this.zigzagOffset)>1) this.zigzagDir*=-1;
      const perp=a+Math.PI/2, amp=CONFIG.enemies.types.spore_bat.zigzagAmp;
      this.x+=Math.cos(a)*this.speed+Math.cos(perp)*this.zigzagOffset*amp;
      this.y+=Math.sin(a)*this.speed+Math.sin(perp)*this.zigzagOffset*amp;
    } else {
      this.x+=Math.cos(a)*this.speed; this.y+=Math.sin(a)*this.speed;
    }

    // След оставляет сам враг — раньше это делал главный цикл, залезая
    // руками в e.trailTimer и подставляя интервалы чужих типов врагов.
    this.updateTrail(particles);

    if(this.overlaps(player)){
      if(this.abilities.includes("grab_player")){
        this.grabTimer=CONFIG.enemies.types.mycelium_tentacle.grabDuration; player.isGrabbed=true;
      }
      player.takeDamage(this.damage*0.3); this.hp-=3;
      const push=Math.atan2(this.y-player.y,this.x-player.x);
      this.x+=Math.cos(push)*6; this.y+=Math.sin(push)*6;
    }
  }

  updateTrail(particles){
    if(!particles) return;
    const spore=this.abilities.includes("spore_trail");
    const toxic=this.abilities.includes("toxic_trail");
    if(!spore&&!toxic) return;
    this.trailTimer--;
    if(this.trailTimer>0) return;
    if(spore){ particles.emitSporeCloud(this.x,this.y,25,"#6b2d5c"); }
    if(toxic){ particles.emitToxicTrail(this.x,this.y); }
    this.trailTimer=this.def.trailInterval||8;
  }

  draw(renderer){
    if(this.dead) return;
    if(this.abilities.includes("emerge_from_ground")&&this.emergeTimer>0){
      renderer.ctx.strokeStyle="#6b2d5c"; renderer.ctx.lineWidth=2; renderer.ctx.beginPath();
      renderer.ctx.arc(this.x,this.y,10+(45-this.emergeTimer)*0.5,0,Math.PI*2); renderer.ctx.stroke(); return;
    }

    // Мутанты подсвечиваются золотой аурой независимо от способа отрисовки
    if(this.isMutated) renderer.drawGlowCircle(this.x,this.y,this.radius+4,"#c4a000",10);

    if(!this.anim.draw(renderer,this.x,this.y)){
      // Запасная отрисовка примитивами для типов без спрайта
      renderer.drawGradientCircle(this.x,this.y,this.radius,this.color?.body||["#8a8a8a","#6b2d5c"]);
      const ang=angleTo(this.x,this.y,renderer.playerX||0,renderer.playerY||0);
      for(let side=-1;side<=1;side+=2){
        const ex=this.x+Math.cos(ang+side*0.4)*this.radius*0.4, ey=this.y+Math.sin(ang+side*0.4)*this.radius*0.4;
        renderer.drawCircle(ex,ey,this.radius*0.2,"#00d4aa");
        renderer.drawCircle(ex+Math.cos(ang)*1.5,ey+Math.sin(ang)*1.5,this.radius*0.08,"#000");
      }
    }
    this.drawHpBar(renderer);
  }

  drawHpBar(renderer){
    const pct=this.hp/this.maxHp;
    renderer.ctx.fillStyle="#1a1a1a";
    renderer.ctx.fillRect(this.x-this.radius,this.y-this.radius-10,this.radius*2,4);
    renderer.ctx.fillStyle=pct>0.5?"#00d4aa":pct>0.25?"#c4a000":"#ff3333";
    renderer.ctx.fillRect(this.x-this.radius,this.y-this.radius-10,this.radius*2*pct,4);
  }
}
