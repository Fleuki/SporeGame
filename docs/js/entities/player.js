import { angleTo } from "../utils/math.js";
import { CONFIG } from "../config.js";
import { Entity } from "./entity.js";
import { WORLD } from "../core/camera.js";
import { Weapon } from "./weapon.js";

function angleToRow(angle){
  if(angle>=-Math.PI/4 && angle<Math.PI/4) return 2;
  if(angle>=Math.PI/4 && angle<3*Math.PI/4) return 0;
  if(angle>=-3*Math.PI/4 && angle<-Math.PI/4) return 3;
  return 1;
}

export class Player extends Entity {
  constructor(x,y){
    super(x,y,CONFIG.player.radius);
    this.speed=CONFIG.player.speed;
    this.maxHp=CONFIG.player.maxHp; this.hp=this.maxHp; this.xp=0; this.level=1; this.xpToNext=10;
    this.damage=CONFIG.player.damage; this.attackCooldown=0; this.attackRate=CONFIG.player.attackRate;
    // Стволы стреляют одновременно, каждый по своему таймеру.
    // Остальные выдаются карточками прокачки.
    this.weapons=[new Weapon(CONFIG.weapons.antidote)];
    this.angle=0; this.color=CONFIG.player.color; this.sporeLevel=0; this.isGrabbed=false;
    // hasShield — щит вообще получен, shieldActive — заряд на месте.
    // Раньше был только shieldActive: заблокировал один удар — и всё, апгрейд
    // навсегда превращался в пустую карточку вопреки описанию.
    this.hasShield=false; this.shieldActive=false; this.shieldCd=0; this.dashCooldown=0;
    this.ricochet=false; this.explosive=false; this.poison=false; this.autoLoot=false; this.lootRadius=40;
    this.canDash=false; this.regen=0; this.xpMult=1; this.lastKeyTime={w:0,a:0,s:0,d:0}; this.lastKey="";
    // Мутации ускоряют заражение через свой множитель, а не правкой CONFIG:
    // глобальный конфиг живёт дольше забега, и правки в нём переносились
    // в следующие партии.
    this.sporeRate=1;
    this.iframes=0; this.hurtFlash=0; this.onHurt=null;
    // Сколько раз взято каждое улучшение — по этому UpgradeSystem убирает из
    // колоды выбранное до предела
    this.taken={};
    this.animTimer=0; this.animFrame=0; this.animSpeed=8; this.isMoving=false;
    // life читался проверкой регенерации, но нигде не задавался:
    // undefined%60 === NaN, поэтому апгрейд «Мицелиевое исцеление» не лечил.
    // Теперь счётчик приходит из Entity.
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

  update(dt,ctx){
    const {input,enemies,camera}=ctx;
    this.life++;
    // Таймеры тикают даже в захвате щупальца: иначе неуязвимость «замерзала»
    // на всю его длительность, и захват парадоксально защищал игрока
    if(this.iframes>0) this.iframes--;
    if(this.hurtFlash>0) this.hurtFlash--;
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

    // Мир не привязан к размеру холста, но и не бесконечен: игрок ходит
    // свободно внутри арены, а на её границе упирается.
    this.x+=dx*this.speed; this.y+=dy*this.speed;
    this.x=Math.min(Math.max(this.x,WORLD.minX+this.radius),WORLD.maxX-this.radius);
    this.y=Math.min(Math.max(this.y,WORLD.minY+this.radius),WORLD.maxY-this.radius);

    const autoAim=input.getAutoAimAngle(this,enemies);
    if(autoAim!==null) this.angle=autoAim;
    else {
      // Мышь приходит в экранных координатах, целиться нужно в мировых
      const m=camera?camera.toWorld(input.mouse.x,input.mouse.y):input.mouse;
      this.angle=angleTo(this.x,this.y,m.x,m.y);
    }

    if(this.attackCooldown>0) this.attackCooldown--;
    if(this.dashCooldown>0) this.dashCooldown--;
    // Щит копит заряд, пока его нет
    if(this.hasShield&&!this.shieldActive&&--this.shieldCd<=0) this.shieldActive=true;
    if(this.regen>0 && this.hp<this.maxHp && this.life%60===0) this.hp+=this.regen;

    // Заражение растёт само по себе — в этом весь смысл механики: споры
    // копятся всегда, а сбить их можно только антидотом.
    this.sporeLevel=Math.min(CONFIG.sporeSystem.maxSpore,
      this.sporeLevel+CONFIG.player.sporeGrowth*this.sporeRate*dt);
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

  hasWeapon(key){ return this.weapons.some(w=>w.def===CONFIG.weapons[key]); }
  addWeapon(key){ if(!this.hasWeapon(key)) this.weapons.push(new Weapon(CONFIG.weapons[key])); }

  // Опрашивает все стволы и возвращает вылетевшие снаряды
  tryShoot(enemies){
    const shots=[];
    for(const w of this.weapons){
      w.update();
      const p=w.fire(this,enemies);
      if(p) shots.push(p);
    }
    if(shots.length){
      this.attackCooldown=this.attackRate;
      // Анимация броска общая: играет, когда выстрелил хоть один ствол.
      // При выключенном attackAnim в неё вообще не входим — иначе цикл ходьбы
      // всё равно прерывался бы, просто уже незаметно для глаза.
      if(CONFIG.player.attackAnim){
        this.isAttacking=true;
        this.attackAnimFrame=0;
        this.attackAnimTimer=0;
      }
    }
    return shots;
  }

  // Возвращает true, если урон реально прошёл (а не был съеден щитом или
  // неуязвимостью). ignoreIFrames — для урона по времени вроде кислотных луж:
  // он капает постоянно и не должен продлевать неуязвимость.
  takeDamage(a,ignoreIFrames=false){
    if(this.shieldActive){
      this.shieldActive=false; this.shieldCd=CONFIG.player.shieldRecharge;
      this.onHurt?.(0,"shield"); return false;
    }
    if(this.iframes>0&&!ignoreIFrames) return false;
    this.hp-=a;
    this.sporeLevel=Math.min(CONFIG.sporeSystem.maxSpore,this.sporeLevel+CONFIG.player.sporeGrowthOnHit);
    if(!ignoreIFrames){ this.iframes=CONFIG.player.contactIFrames; this.hurtFlash=12; }
    this.onHurt?.(a,"hit");
    return true;
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
    const atkImg=CONFIG.player.attackAnim?renderer.loader?.getImage("playerAttack"):null;
    const bodyImg=renderer.loader?.getImage("player");
    // Спрайт броска нарисован лицом вправо: зеркалим его при стрельбе влево.
    // Вращать спрайт персонажа нельзя — направление уже задано рядом листа.
    const faceLeft=Math.cos(this.angle)<0;

    // Тень под ногами: без неё игрок сливается с землёй ровно так же, как враги
    renderer.drawShadow(this.x,this.y+this.radius*0.8,this.radius*0.8,this.radius*0.3,0.45);

    // Неуязвимость видно по морганию: иначе непонятно, почему второй удар
    // подряд не прошёл.
    const blink=this.iframes>0 && this.hurtFlash<=0 && Math.floor(this.iframes/4)%2===0;
    if(blink){ renderer.ctx.save(); renderer.ctx.globalAlpha=0.45; }

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

    if(blink) renderer.ctx.restore();

    // Красный силуэт в момент удара — самая заметная часть обратной связи
    if(this.hurtFlash>0){
      const a=this.hurtFlash/12*0.8;
      if(this.isAttacking&&atkImg){
        renderer.drawFlash(atkImg,"playerAttack",this.x,this.y,
          CONFIG.player.attackFrameW,CONFIG.player.attackFrameH,this.attackAnimFrame,0,
          CONFIG.player.attackDisplaySize,faceLeft,a,"#ff3344");
      } else if(bodyImg){
        renderer.drawFlash(bodyImg,"player",this.x,this.y,
          CONFIG.player.spriteFrameW,CONFIG.player.spriteFrameH,this.animFrame,angleToRow(this.angle),
          CONFIG.player.spriteDisplaySize,false,a,"#ff3344");
      } else {
        renderer.ctx.save(); renderer.ctx.globalAlpha=a;
        renderer.drawCircle(this.x,this.y,this.radius,"#ff3344"); renderer.ctx.restore();
      }
    }

    if(this.shieldActive){
      renderer.ctx.strokeStyle="rgba(0,212,170,0.6)";
      renderer.ctx.lineWidth=2; renderer.ctx.beginPath();
      renderer.ctx.arc(this.x,this.y,this.radius+8,0,Math.PI*2); renderer.ctx.stroke();
    }
    if(this.isGrabbed) renderer.drawText("⚠ ЗАХВАТ",this.x,this.y-this.radius-15,{font:"10px monospace",color:"#ff3333",align:"center"});
  }
}
