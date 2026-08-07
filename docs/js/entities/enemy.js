import { angleTo } from "../utils/math.js";
import { CONFIG } from "../config.js";
import { Entity } from "./entity.js";
import { SpriteAnim } from "../engine/sprite.js";

// Насколько ярким должен быть контур существа в этой точке.
//
// Ноль вблизи игрока и полный rimAlpha вдали. Смысл в том, что контур решает
// одну задачу — «врага в темноте не видно», — и вблизи, в круге света, эта
// задача не стоит: там спрайт читается сам, а ободок вокруг каждого тела
// превращает бой в набор цветных наклеек.
//
// Координаты игрока лежат на рендерере (их выставляет main.draw): тащить
// ссылку на игрока в каждого врага ради одного числа не стоит.
export function rimAlphaAt(renderer,x,y){
  const R=CONFIG.enemies;
  if(!(R.rimAlpha>0)) return 0;
  const d=Math.hypot(x-(renderer.playerX||0), y-(renderer.playerY||0));
  if(d<=R.rimNear) return 0;
  const k=Math.min(1,(d-R.rimNear)/Math.max(1,R.rimFar-R.rimNear));
  return R.rimAlpha*k;
}

export class Enemy extends Entity {
  // scale — множители сложности от времени забега, см. SpawnSystem.scale()
  constructor(x,y,typeKey,isMutated=false,scale=null){
    const t=CONFIG.enemies.types[typeKey]||CONFIG.enemies.types.spore_bearer;
    super(x,y,t.radius);
    const s=scale||{hp:1,damage:1,speed:1,xp:1};
    this.def=t; this.typeKey=typeKey;
    this.maxHp=t.hp*(isMutated?1.5:1)*s.hp; this.hp=this.maxHp;
    this.baseSpeed=t.speed*s.speed; this.speed=this.baseSpeed;
    // dmgScale держим отдельно от damage: контактный урон и урон снаряда
    // берутся из разных полей конфига, но расти по времени забега обязаны
    // одинаково
    this.dmgScale=(isMutated?1.3:1)*s.damage;
    this.damage=t.damage*this.dmgScale;
    // Опыт растёт медленнее HP, иначе поздние волны разгоняют уровень быстрее,
    // чем растёт сложность, и прокачка снова обгоняет врагов.
    // s.xp — множитель от правила стычки. Он и есть плата за риск: «Отборные»
    // дают вдвое больше опыта именно потому, что их вдвое опаснее убивать, а
    // «Рой» меньше — иначе выгодной стратегией стало бы фармить дешёвые тела.
    this.xpReward=t.xpReward*(isMutated?1.5:1)*(1+(s.hp-1)*0.45)*(s.xp??1);
    this.color=t.color; this.isMutated=isMutated;
    this.anim=new SpriteAnim(t.sprite); this.moveAngle=0;
    this.abilities=t.abilities||[];
    this.trailTimer=0; this.emergeTimer=t.emergeDelay||0;
    this.zigzagOffset=0; this.zigzagDir=1;
    this.dotTime=0; this.dotDps=0;   // урон по времени от токсичной склянки
    this.touchCd=0;                  // перезарядка контактного удара
    // Стрелок: кадров до следующего выстрела и текущий прогресс замаха
    // (-1 — не заряжает). strafeDir — в какую сторону обходит игрока.
    this.shootCd=t.ranged?Math.round(t.ranged.cooldown*(0.4+Math.random()*0.6)):0;
    this.charge=-1;
    this.strafeDir=Math.random()<0.5?-1:1;
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

    if(this.abilities.includes("ranged_attack")){ this.updateRanged(ctx); return; }

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
      // Щупальце не держит, а волочёт: пока стоишь в нём, замедление
      // продлевается, вышел — доигрывает остаток и отпускает.
      if(this.abilities.includes("snare_player")){
        player.applySlow(this.def.slowMult||0.5,this.def.slowDuration||90);
      }
      // Удар не каждый кадр, а раз в touchInterval. Раньше урон шёл 60 раз в
      // секунду — волк снимал всё здоровье за секунду касания, и игрок не
      // успевал понять, обо что умер.
      if(this.touchCd<=0){
        player.takeDamage(this.damage);
        this.touchCd=CONFIG.enemies.touchInterval;
      }
      const push=Math.atan2(this.y-player.y,this.x-player.x);
      const k=CONFIG.enemies.touchPush;
      this.x+=Math.cos(push)*k; this.y+=Math.sin(push)*k;
    }
  }

  // СТРЕЛОК. Держит дистанцию и стреляет облаками спор.
  //
  // Кадры листа тут не шаги, а фазы раздувания трубы, поэтому анимация не
  // крутится сама: пока враг просто идёт, он показывает нулевой кадр (мешок
  // закрыт), а во время заряда кадр выбирается по прогрессу замаха. Игрок
  // видит, кто именно сейчас в него целится, и у него есть время уйти.
  updateRanged(ctx){
    const {player}=ctx;
    const R=this.def.ranged;
    const a=angleTo(this.x,this.y,player.x,player.y);
    const d=Math.hypot(player.x-this.x,player.y-this.y);
    this.moveAngle=a;

    if(this.shootCd>0) this.shootCd--;

    if(this.charge>=0){
      // Замах: стоит на месте, труба раскрывается, в конце — выстрел
      this.charge++;
      this.anim.hold(a,Math.floor(this.charge/R.chargeTime*this.def.sprite.cols));
      if(this.charge>=R.chargeTime){
        this.charge=-1;
        this.shootCd=R.cooldown;
        ctx.shots?.push({x:this.x,y:this.y,angle:a,def:R.shot,
                         damage:R.shot.damage*this.dmgScale});
        ctx.particles?.emitMuzzle(this.x,this.y,a,R.shot.glow);
      }
      return;
    }

    this.anim.hold(a,0);

    // Слишком далеко — подходит, слишком близко — пятится, на дистанции —
    // обходит по кругу. Без обхода десяток трубачей выстраивается в ровное
    // кольцо и выглядит как декорация.
    if(d>R.keepDist){
      this.x+=Math.cos(a)*this.speed; this.y+=Math.sin(a)*this.speed;
    } else if(d<R.retreatDist){
      this.x-=Math.cos(a)*this.speed; this.y-=Math.sin(a)*this.speed;
    } else {
      const perp=a+Math.PI/2*this.strafeDir;
      this.x+=Math.cos(perp)*this.speed*0.6;
      this.y+=Math.sin(perp)*this.speed*0.6;
      if(this.life%90===0) this.strafeDir*=-1;
    }

    // Стреляет только с дистанции, на которой снаряд долетит
    if(this.shootCd<=0 && d<=R.keepDist*1.15) this.charge=0;

    // Подошли вплотную — бьёт как все остальные: подойти к стрелку в упор
    // должно быть выгодно, но не бесплатно
    if(this.overlaps(player)&&this.touchCd<=0){
      player.takeDamage(this.damage);
      this.touchCd=CONFIG.enemies.touchInterval;
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

    // ЭЛИТА. Венец шипов рисуется ДО спрайта: его середина прозрачна, и враг
    // должен смотреть сквозь неё, а не из-под неё. Листа нет — остаётся
    // прежняя золотая аура, чтобы элита не превратилась в обычного врага.
    if(this.isMutated) this.drawCrown(renderer);

    // Замах стрелка виден и без спрайта: кольцо стягивается к врагу, пока
    // раздувается труба. Это единственное предупреждение перед выстрелом, и
    // оно обязано читаться в толпе, а не только на пустом экране.
    if(this.charge>=0){
      const R=this.def.ranged, k=this.charge/R.chargeTime;
      const ctx=renderer.ctx;
      ctx.save();
      ctx.globalAlpha=0.25+k*0.55;
      ctx.strokeStyle=R.shot.glow||"#ffe066";
      ctx.lineWidth=1.6;
      ctx.beginPath();
      ctx.arc(this.x,this.y,this.radius+22-k*18,0,Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    // Контур под спрайтом: у мутанта золотой, у остальных — свой цвет типа.
    // Он рисуется до спрайта, поэтому наружу торчит только ободок.
    this.anim.outline(renderer,this.x,this.y,
      this.isMutated?"#ffd24a":(this.def.rim||"#b98cff"),
      CONFIG.enemies.rimWidth, rimAlphaAt(renderer,this.x,this.y));

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

  // Венец элиты. Кадр крутится по собственному счётчику жизни, а не по
  // анимации врага: у волка шаг быстрый, у щупальца анимации нет вовсе, и
  // пульсация венца не должна зависеть от того, на ком он сидит.
  drawCrown(renderer){
    const E=CONFIG.enemies.elite;
    const img=E&&renderer.loader?.getImage(E.sprite.key);
    if(!img||!img.width){
      renderer.drawGlowCircle(this.x,this.y,this.radius+4,"#c4a000",10);
      return;
    }
    const size=(this.def.sprite?.display||this.radius*4)*E.sizeMult;
    const col=Math.floor(this.life/E.sprite.animSpeed)%E.sprite.cols;
    renderer.drawSpriteSheet(img,this.x,this.y,
      E.sprite.frame,E.sprite.frame,col,0,size);
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
