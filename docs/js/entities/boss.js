import { CONFIG } from "../config.js";
import { Enemy, rimAlphaAt } from "./enemy.js";
import { SpriteAnim } from "../engine/sprite.js";

// Босс — тот же враг, но со сценарием способностей. Наследование от Enemy
// даёт единый update(dt,ctx) для главного цикла; instanceof Boss остаётся
// нужен только там, где правила действительно отличаются.
export class Boss extends Enemy {
  constructor(x,y,typeKey){
    // Enemy читает типы из CONFIG.enemies.types, у боссов свой раздел
    super(x,y,"spore_bearer");
    const c=CONFIG.bosses[typeKey];
    this.def=c; this.typeKey=typeKey; this.name=c.name;
    this.radius=c.radius; this.maxHp=c.hp; this.hp=this.maxHp;
    this.damage=c.damage; this.xpReward=c.xpReward;
    this.baseSpeed=0; this.speed=0;
    this.color=c.color; this.abilities=c.abilities||[];
    this.anim=new SpriteAnim(c.sprite); this.phase=0;
    this.timer=0; this.sneezeTimer=0; this.isStunned=false; this.stunTimer=0;
    this.tentacleTimer=0; this.pulseTimer=0;
  }

  // Фаза = сколько HP уже снято, в рядах спрайт-листа. Для Сердцевины ряды
  // листа и есть стадии сердцебиения, так что босс визуально звереет.
  updatePhase(){
    const rows=this.anim.def?.rows||1;
    this.phase=Math.min(rows-1,Math.floor((1-Math.max(0,this.hp)/this.maxHp)*rows));
    this.anim.step(0,!this.isStunned,this.phase);
  }

  update(dt,ctx){
    if(this.dead) return;
    this.life++; this.timer++;
    // Босс не проходит через Enemy.update, поэтому вспышку и отдачу гасим сами.
    // Без этого flash после первого же попадания оставался бы навсегда, и босс
    // светился белым до конца боя.
    this.stepImpact();
    this.updatePhase();
    const {player,events}=ctx;

    if(this.typeKey==="mother_cap"){
      if(this.isStunned){
        this.stunTimer--; if(this.stunTimer<=0) this.isStunned=false;
        return;
      }
      this.sneezeTimer++;
      if(this.sneezeTimer>=CONFIG.bosses.mother_cap.sneezeInterval){
        this.isStunned=true; this.stunTimer=CONFIG.bosses.mother_cap.sneezeCooldown;
        this.sneezeTimer=0; events.push({type:"sneeze",boss:this}); return;
      }
      if(this.timer%120===0) events.push({type:"spawn_minions",boss:this});
    }

    if(this.typeKey==="mycelium_heart"){
      this.tentacleTimer++; this.pulseTimer++;
      if(this.tentacleTimer>=CONFIG.bosses.mycelium_heart.tentacleInterval){
        this.tentacleTimer=0; events.push({type:"summon_tentacle",boss:this});
      }
      if(this.pulseTimer>=CONFIG.bosses.mycelium_heart.pulseInterval){
        this.pulseTimer=0; events.push({type:"pulse",boss:this});
      }
    }

    // Урон больше не сыпется каждый кадр — неуязвимость игрока сама разводит
    // удары по времени, поэтому и делить его на пять больше не нужно
    if(this.overlaps(player)) player.takeDamage(this.damage);
  }

  draw(renderer){
    if(this.dead) return;
    // Свечение — сплошной диск, поверх него спрайт не читается.
    // Со спрайтом рисуем только мягкую тень под боссом.
    const flashAlpha=this.flash>0?this.flash/CONFIG.feel.hitFlash*0.75:0;
    if(this.anim.ready(renderer)){
      renderer.ctx.save();
      renderer.ctx.globalAlpha=0.25;
      renderer.drawGlowCircle(this.x,this.y+this.radius*0.55,this.radius*0.7,this.color.body[0],30);
      renderer.ctx.restore();
      // Тот же контур и то же затухание вблизи, что у рядовых врагов: босс
      // нарисован тёмным и на тёмной арене сливался с землёй ничуть не
      // меньше остальных. Вблизи контур не нужен — у босса есть имя и полоса
      // здоровья над головой, потерять его невозможно.
      this.anim.outline(renderer,this.x,this.y,this.color.body[1],
                        CONFIG.enemies.rimWidth+1,rimAlphaAt(renderer,this.x,this.y));
      this.anim.draw(renderer,this.x,this.y);
      if(flashAlpha) this.anim.flash(renderer,this.x,this.y,flashAlpha);
    } else {
      renderer.drawGlowCircle(this.x,this.y,this.radius+10,this.color.body[0],25);
      renderer.drawGradientCircle(this.x,this.y,this.radius,this.color.body);
      renderer.ctx.beginPath(); renderer.ctx.arc(this.x,this.y-this.radius*0.3,this.radius*0.8,Math.PI,0);
      renderer.ctx.fillStyle=this.color.body[1]; renderer.ctx.fill();
      if(flashAlpha){
        renderer.ctx.save(); renderer.ctx.globalAlpha=flashAlpha;
        renderer.drawCircle(this.x,this.y,this.radius,"#ffffff"); renderer.ctx.restore();
      }
    }

    // Оглушение раньше показывалось эмодзи «💫» — системный шрифт поверх
    // пиксель-арта выглядит инородно и на разных платформах рисуется
    // по-разному. Теперь это три искры, кружащие над боссом.
    if(this.isStunned){
      for(let i=0;i<3;i++){
        const a=this.life*0.12+i*Math.PI*2/3;
        renderer.drawGlowCircle(this.x+Math.cos(a)*this.radius*0.62,
                                this.y-this.radius-10+Math.sin(a)*4,
                                2.6,"#ffd24a",8);
      }
    }
    renderer.drawText(this.name,this.x,this.y-this.radius-20,{font:"12px "+CONFIG.fontFamily,color:"#00d4aa",align:"center"});
    const bw=100,bh=6;
    renderer.ctx.fillStyle="#1a1a1a"; renderer.ctx.fillRect(this.x-bw/2,this.y-this.radius-14,bw,bh);
    renderer.ctx.fillStyle=this.hp/this.maxHp>0.5?"#ff3333":"#c4a000";
    renderer.ctx.fillRect(this.x-bw/2,this.y-this.radius-14,bw*(this.hp/this.maxHp),bh);
  }
}
