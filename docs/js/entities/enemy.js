import { angleTo } from "../utils/math.js";
import { CONFIG } from "../config.js";
import { Entity } from "./entity.js";
import { SpriteAnim } from "../engine/sprite.js";

export class Enemy extends Entity {
  // scale — множители сложности от номера волны, см. WaveSystem.scale()
  constructor(x,y,typeKey,isMutated=false,scale=null){
    const t=CONFIG.enemies.types[typeKey]||CONFIG.enemies.types.spore_bearer;
    super(x,y,t.radius);
    const s=scale||{hp:1,damage:1,speed:1};
    this.def=t; this.typeKey=typeKey;
    this.maxHp=t.hp*(isMutated?1.5:1)*s.hp; this.hp=this.maxHp;
    this.baseSpeed=t.speed*s.speed; this.speed=this.baseSpeed;
    this.damage=t.damage*(isMutated?1.3:1)*s.damage;
    // Опыт растёт медленнее HP, иначе поздние волны разгоняют уровень быстрее,
    // чем растёт сложность, и прокачка снова обгоняет врагов.
    this.xpReward=t.xpReward*(isMutated?1.5:1)*(1+(s.hp-1)*0.45);
    this.color=t.color; this.isMutated=isMutated;
    this.anim=new SpriteAnim(t.sprite); this.moveAngle=0;
    this.abilities=t.abilities||[];
    this.trailTimer=0; this.emergeTimer=t.emergeDelay||0;
    this.grabTimer=0; this.zigzagOffset=0; this.zigzagDir=1;
    this.dotTime=0; this.dotDps=0;   // урон по времени от токсичной склянки
    this.touchCd=0;                  // перезарядка контактного удара
  }

  // Урон по времени не складывается стопками, а обновляет длительность
  // и берёт большую силу — иначе облака перекрывались бы в мгновенную смерть
  applyDot(dps,time){
    this.dotDps=Math.max(this.dotDps,dps);
    this.dotTime=Math.max(this.dotTime,time);
  }

  update(dt,ctx){
    this.life++; if(this.dead) return;
    const {player,particles,sporeLevel}=ctx;
    this.stepImpact();               // отдача от попаданий и затухание вспышки
    if(this.touchCd>0) this.touchCd--;

    if(this.dotTime>0){
      this.dotTime--;
      this.hp-=this.dotDps*dt;
      if(this.dotTime<=0) this.dotDps=0;
      else if(this.life%9===0&&particles) particles.emitToxicTrail(this.x,this.y);
    }
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
      // Удар не каждый кадр, а раз в touchInterval. Раньше урон шёл 60 раз в
      // секунду — волк снимал всё здоровье за секунду касания, и игрок не
      // успевал понять, обо что умер.
      if(this.touchCd<=0){
        player.takeDamage(this.damage);
        this.touchCd=CONFIG.enemies.touchInterval;
      }
      const push=Math.atan2(this.y-player.y,this.x-player.x);
      this.x+=Math.cos(push)*6; this.y+=Math.sin(push)*6;
    }
  }

  // Мягкое расталкивание соседей: толпа перестаёт слипаться в одно пятно.
  // Вызывается боевой системой после того, как все враги уже сдвинулись.
  separateFrom(o){
    const dx=this.x-o.x, dy=this.y-o.y;
    const min=this.radius+o.radius;
    const d=Math.hypot(dx,dy);
    if(d>=min) return;
    // Точное совпадение координат — расталкиваем в случайную сторону
    const a=d>0.001?Math.atan2(dy,dx):Math.random()*Math.PI*2;
    const push=(min-d)*CONFIG.feel.separation*0.5;
    this.x+=Math.cos(a)*push; this.y+=Math.sin(a)*push;
    o.x-=Math.cos(a)*push;   o.y-=Math.sin(a)*push;
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

    // Тень рисуется до спрайта — иначе она легла бы поверх ног
    renderer.drawShadow(this.x,this.y+this.radius*0.72,this.radius*0.82,this.radius*0.3,0.42);

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
      if(this.flash>0){
        renderer.ctx.save();
        renderer.ctx.globalAlpha=this.flash/CONFIG.feel.hitFlash*0.8;
        renderer.drawCircle(this.x,this.y,this.radius,"#ffffff");
        renderer.ctx.restore();
      }
    } else if(this.flash>0){
      this.anim.flash(renderer,this.x,this.y,this.flash/CONFIG.feel.hitFlash*0.85);
    }
    this.drawHpBar(renderer);
  }

  drawHpBar(renderer){
    const pct=this.hp/this.maxHp;
    // Полоска только у раненых: над полной толпой это тридцать одинаковых
    // зелёных чёрточек, которые перекрывают самих врагов.
    if(pct>=0.999) return;
    renderer.ctx.fillStyle="#1a1a1a";
    renderer.ctx.fillRect(this.x-this.radius,this.y-this.radius-10,this.radius*2,4);
    renderer.ctx.fillStyle=pct>0.5?"#00d4aa":pct>0.25?"#c4a000":"#ff3333";
    renderer.ctx.fillRect(this.x-this.radius,this.y-this.radius-10,this.radius*2*pct,4);
  }
}
