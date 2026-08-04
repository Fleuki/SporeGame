import { CONFIG } from "../config.js";

// ЛУТ: всё, что выпадает из врагов и подбирается с земли.
//
// Раньше опыт начислялся мгновенно в момент смерти врага, а единственным
// предметом был антидот. Теперь опыт — это шарики на земле: за ними надо
// идти, и это единственная причина заходить в толпу, которую ты только что
// разогнал. Заодно у игрока появляется смысл в радиусе притяжения.
//
// Предметы живут в мировых координатах и подбираются двумя способами:
// в упор — сразу, а внутри magnetRadius летят к игроку сами.
export class LootSystem {
  constructor(particles,audio){
    this.particles=particles;
    this.audio=audio;
    this.items=[];
    this.coins=0;
    this.tick=0;
  }

  reset(){ this.items.length=0; this.coins=0; }

  spawn(type,x,y,extra={}){
    const def=CONFIG.loot.types[type];
    if(!def) return;
    const a=Math.random()*Math.PI*2, s=0.6+Math.random()*1.4;
    this.items.push({
      type, def, x, y,
      vx:Math.cos(a)*s, vy:Math.sin(a)*s,   // разлёт из точки смерти
      life:def.life||CONFIG.loot.defaultLife,
      frame:Math.floor(Math.random()*(def.frames||1)),
      bob:Math.random()*Math.PI*2,
      ...extra
    });
  }

  // Что выпадает из убитого врага. xp уже посчитан с учётом множителей.
  dropFor(enemy,xp,isBoss){
    const L=CONFIG.loot, tiers=L.crystalTiers;
    // Опыт разбивается на предметы по номиналам сверху вниз: из рядового
    // врага выпадет шарик, из босса — горсть крупных кристаллов, а не
    // триста мелких шариков.
    let left=Math.round(xp), guard=L.maxDrops;
    while(left>=tiers[0]&&guard>0){
      let t=0;
      for(let k=tiers.length-1;k>=0;k--){ if(tiers[k]<=left){ t=k; break; } }
      // Последний предмет забирает весь остаток, чтобы опыт не терялся
      const value=(guard===1)?left:tiers[t];
      this.spawn("crystal",enemy.x,enemy.y,{value,tier:t});
      left-=value; guard--;
    }
    if(left>0) this.spawn("xp_orb",enemy.x,enemy.y,{value:left});

    if(isBoss||Math.random()<L.antidoteChance) this.spawn("antidote",enemy.x,enemy.y);
    if(Math.random()<L.potionChance) this.spawn("potion",enemy.x,enemy.y);
    if(isBoss||Math.random()<L.coinChance) this.spawn("coin",enemy.x,enemy.y);
  }

  // Возвращает true, если поднятый опыт дал уровень
  update(player,camera){
    this.tick++;
    const L=CONFIG.loot;
    // «Магнит мицелия» из прокачки расширяет радиус притяжения
    const magnet=L.magnetRadius+(player.autoLoot?player.lootRadius:0);
    let leveledUp=false;

    for(let i=this.items.length-1;i>=0;i--){
      const it=this.items[i];
      it.x+=it.vx; it.y+=it.vy;
      it.vx*=L.friction; it.vy*=L.friction;
      it.bob+=0.08;
      it.life--;

      const dx=player.x-it.x, dy=player.y-it.y;
      const d=Math.hypot(dx,dy);
      if(d<magnet){
        // Чем ближе, тем быстрее — иначе предметы уныло ползут последние пиксели
        const pull=L.magnetForce*(1-d/magnet)+L.magnetForce*0.4;
        it.vx+=dx/d*pull; it.vy+=dy/d*pull;
      }
      if(d<player.radius+it.def.radius){
        if(this.collect(it,player)) leveledUp=true;
        this.items.splice(i,1);
        continue;
      }
      // Далеко за экраном предметы не нужны: мир бесконечный, а список — нет
      if(it.life<=0||(camera&&!camera.sees(it.x,it.y,L.despawnMargin))){
        this.items.splice(i,1);
      }
    }
    return leveledUp;
  }

  collect(it,player){
    const def=it.def;
    if(def.xp){
      const v=it.value||def.value||1;
      this.particles?.emit(it.x,it.y,def.particle||"#ffd24a",6);
      this.audio?.sfx("pickup");
      return player.addXp(v);
    }
    if(def.heal){
      player.hp=Math.min(player.maxHp,player.hp+def.heal);
      this.particles?.emitText(it.x,it.y-12,"+"+def.heal,"#66ff88");
    }
    if(def.spore){
      player.reduceSpore(def.spore);
      this.particles?.emitText(it.x,it.y-12,"−"+def.spore+"% спор","#00d4aa",12);
    }
    if(def.coin){ this.coins+=def.coin; }
    this.audio?.sfx(def.coin?"coin":"pickup");
    this.particles?.emit(it.x,it.y,def.particle||"#ffffff",8);
    return false;
  }

  draw(renderer){
    for(const it of this.items){
      const def=it.def;
      const img=renderer.loader?.getImage(def.image);
      // Мигание перед исчезновением — предмет не пропадает молча
      if(it.life<90&&Math.floor(it.life/6)%2===0) continue;
      const y=it.y+Math.sin(it.bob)*2;
      if(!img||!img.width){
        renderer.drawGlowCircle(it.x,y,def.radius,def.particle||"#ffd24a",12);
        continue;
      }
      const frames=def.frames||1;
      if(frames===1){
        // одиночный спрайт может быть не квадратным — подгоняем по высоте
        renderer.drawSprite(img,it.x,y,def.size*img.width/img.height,def.size);
        continue;
      }
      const frame=def.animSpeed
        ? Math.floor(this.tick/def.animSpeed+it.frame)%frames
        : Math.min(it.tier||0,frames-1);
      renderer.drawSpriteSheet(img,it.x,y,img.width/frames,img.height,frame,0,def.size);
    }
  }
}
