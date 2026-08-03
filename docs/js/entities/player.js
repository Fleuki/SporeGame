import { clamp, angleTo } from "../utils/math.js";
import { CONFIG } from "../config.js";
import { Projectile } from "./projectile.js";

function angleToRow(angle){
  if(angle>=-Math.PI/4 && angle<Math.PI/4) return 2;
  if(angle>=Math.PI/4 && angle<3*Math.PI/4) return 0;
  if(angle>=-3*Math.PI/4 && angle<-Math.PI/4) return 3;
  return 1;
}

export class Player {
  constructor(x,y){
    this.x=x; this.y=y; this.radius=CONFIG.player.radius; this.speed=CONFIG.player.speed;
    this.maxHp=CONFIG.player.maxHp; this.hp=this.maxHp; this.xp=0; this.level=1; this.xpToNext=10;
    this.damage=CONFIG.player.damage; this.attackCooldown=0; this.attackRate=CONFIG.player.attackRate;
    this.angle=0; this.color=CONFIG.player.color; this.sporeLevel=0; this.isGrabbed=false;
    this.shieldActive=false; this.shieldTimer=0; this.dashCooldown=0; this.projectileType="antidote";
    this.ricochet=false; this.explosive=false; this.poison=false; this.autoLoot=false; this.lootRadius=40;
    this.canDash=false; this.regen=0; this.xpMult=1; this.lastKeyTime={w:0,a:0,s:0,d:0}; this.lastKey="";
    this.animTimer=0; this.animFrame=0; this.animSpeed=8; this.isMoving=false;
    // === НОВОЕ: анимация броска ===
    this.attackAnimTimer=0;
    this.attackAnimFrame=0;
    this.isAttacking=false;
    // Анимация броска обязана доигрывать быстрее, чем перезаряжается атака.
    // Иначе isAttacking больше никогда не сбрасывается и игрок навсегда
    // остаётся в кадре броска.
    this.attackAnimSpeed=Math.max(1,Math.min(
      CONFIG.player.attackAnimSpeed,
      Math.floor((CONFIG.player.attackRate-1)/CONFIG.player.attackCols)
    ));
  }

  update(input,w,h,dt,enemies){
    if(this.isGrabbed) return;
    let dx=0,dy=0;
    if(input.keys.w) dy=-1; if(input.keys.s) dy=1; if(input.keys.a) dx=-1; if(input.keys.d) dx=1;
    if(dx!==0&&dy!==0){ dx*=0.707; dy*=0.707; }

    if(this.canDash){
      for(const k of ["w","a","s","d"]){
        if(input.keys[k]){
          const now=Date.now();
          if(this.lastKey===k && now-this.lastKeyTime[k]<250){ this.x+=dx*40; this.y+=dy*40; }
          this.lastKey=k; this.lastKeyTime[k]=now;
        }
      }
    }

    this.x+=dx*this.speed; this.y+=dy*this.speed;
    this.x=clamp(this.x,this.radius,w-this.radius);
    this.y=clamp(this.y,this.radius,h-this.radius);

    const autoAim=input.getAutoAimAngle(this,enemies);
    if(autoAim!==null) this.angle=autoAim;
    else this.angle=angleTo(this.x,this.y,input.mouse.x,input.mouse.y);

    if(this.attackCooldown>0) this.attackCooldown--;
    if(this.shieldTimer>0) this.shieldTimer--;
    if(this.dashCooldown>0) this.dashCooldown--;
    if(this.regen>0 && this.hp<this.maxHp && this.life%60===0) this.hp+=this.regen;
    if(this.sporeLevel>=75) this.hp-=CONFIG.sporeSystem.effects.critical.hpDrain*dt;

    // === НОВОЕ: обновление анимации атаки ===
    if(this.isAttacking){
      this.attackAnimTimer++;
      if(this.attackAnimTimer>=this.attackAnimSpeed){
        this.attackAnimTimer=0;
        if(this.attackAnimFrame<CONFIG.player.attackCols-1) this.attackAnimFrame++;
      }
      // Анимация доиграла — держим последний кадр до конца перезарядки.
      // Возвращаться к спрайту ходьбы на пару кадров нельзя: стрельба
      // автоматическая, и спрайт бы дёргался туда-сюда каждый выстрел.
      if(this.attackCooldown<=0 && this.attackAnimFrame>=CONFIG.player.attackCols-1){
        this.isAttacking=false;
        this.attackAnimFrame=0;
      }
    }

    // Анимация ходьбы — крутится только когда игрок реально идёт
    this.isMoving=(dx!==0||dy!==0);
    if(this.isMoving){
      this.animTimer++;
      if(this.animTimer>=this.animSpeed){
        this.animTimer=0;
        this.animFrame=(this.animFrame+1)%CONFIG.player.spriteCols;
      }
    } else {
      this.animTimer=0; this.animFrame=0;
    }
  }

  tryShoot(){
    if(this.attackCooldown<=0){
      this.attackCooldown=this.attackRate;
      // === НОВОЕ: запуск анимации броска ===
      this.isAttacking=true;
      this.attackAnimFrame=0;
      this.attackAnimTimer=0;
      return new Projectile(
        this.x+Math.cos(this.angle)*(this.radius+6),
        this.y+Math.sin(this.angle)*(this.radius+6),
        this.angle,this.damage,this.projectileType
      );
    }
    return null;
  }

  takeDamage(a){
    if(this.shieldActive&&this.shieldTimer>0){ this.shieldActive=false; this.shieldTimer=0; return false; }
    this.hp-=a; this.sporeLevel+=CONFIG.player.sporeGrowthOnHit; return this.hp<=0;
  }

  addXp(a){
    this.xp+=a; let leveledUp=false;
    while(this.xp>=this.xpToNext){
      this.xp-=this.xpToNext; this.level++;
      this.xpToNext=Math.floor(this.xpToNext*1.35)+5;
      this.damage+=2; this.maxHp+=8;
      this.hp=Math.min(this.hp+15,this.maxHp);
      leveledUp=true;
    }
    return leveledUp;
  }

  reduceSpore(a){ this.sporeLevel=Math.max(0,this.sporeLevel-a); }

  draw(renderer){
    // Ключи загрузчика (CONFIG.assets.images), а не пути к файлам.
    const atkImg=renderer.loader?.getImage("playerAttack");
    const bodyImg=renderer.loader?.getImage("player");
    // Спрайт броска нарисован лицом вправо: зеркалим его при стрельбе влево.
    // Вращать спрайт персонажа нельзя — направление уже задано рядом листа.
    const faceLeft=Math.cos(this.angle)<0;

    if(this.isAttacking && atkImg){
      renderer.drawSpriteSheet(
        atkImg, this.x, this.y,
        CONFIG.player.attackFrameW, CONFIG.player.attackFrameH,
        this.attackAnimFrame, 0,
        CONFIG.player.attackDisplaySize,
        0, faceLeft
      );
    } else if(bodyImg){
      // Обычный спрайт игрока: ряд листа = направление взгляда
      renderer.drawSpriteSheet(
        bodyImg, this.x, this.y,
        CONFIG.player.spriteFrameW, CONFIG.player.spriteFrameH,
        this.animFrame, angleToRow(this.angle),
        CONFIG.player.spriteDisplaySize,
        0
      );
    } else {
      // Fallback-отрисовка примитивами: сюда попадаем, если ни один спрайт
      // не загрузился — игрок обязан остаться видимым в любом случае.
      renderer.drawGlowCircle(this.x,this.y,this.radius+6,this.color.glow,12);
      renderer.drawGradientCircle(this.x,this.y,this.radius,this.color.body);
      renderer.ctx.strokeStyle=this.color.stroke; renderer.ctx.lineWidth=2; renderer.ctx.stroke();
      for(let side=-1;side<=1;side+=2){
        const ex=this.x+Math.cos(this.angle+side*0.45)*this.radius*0.45;
        const ey=this.y+Math.sin(this.angle+side*0.45)*this.radius*0.45;
        renderer.drawCircle(ex,ey,4,"#00d4aa");
        renderer.drawCircle(ex+Math.cos(this.angle)*1.5,ey+Math.sin(this.angle)*1.5,2,"#000");
      }
      renderer.ctx.strokeStyle="#2a2a2a"; renderer.ctx.lineWidth=2; renderer.ctx.beginPath();
      renderer.ctx.moveTo(this.x-6,this.y+4); renderer.ctx.lineTo(this.x-10,this.y+12);
      renderer.ctx.moveTo(this.x+6,this.y+4); renderer.ctx.lineTo(this.x+10,this.y+12); renderer.ctx.stroke();
      renderer.drawGlowCircle(this.x-8,this.y+10,3,"#39ff14",6);
      renderer.drawCircle(this.x-8,this.y+10,3,"#39ff14");
      renderer.drawGlowCircle(this.x+8,this.y+10,3,"#c4a000",6);
      renderer.drawCircle(this.x+8,this.y+10,3,"#c4a000");
    }

    if(this.shieldActive&&this.shieldTimer>0){
      renderer.ctx.strokeStyle="rgba(0,212,170,0.6)";
      renderer.ctx.lineWidth=2; renderer.ctx.beginPath();
      renderer.ctx.arc(this.x,this.y,this.radius+8,0,Math.PI*2); renderer.ctx.stroke();
    }
    if(this.isGrabbed) renderer.drawText("⚠ ЗАХВАТ",this.x,this.y-this.radius-15,{font:"10px monospace",color:"#ff3333",align:"center"});
  }
}
