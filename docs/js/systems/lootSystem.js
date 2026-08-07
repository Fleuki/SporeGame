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
    this.tick=0;
  }

  reset(){ this.items.length=0; }

  spawn(type,x,y,extra={}){
    const def=CONFIG.loot.types[type];
    if(!def) return;
    const a=Math.random()*Math.PI*2, s=0.6+Math.random()*1.4;
    this.items.push({
      type, def, x, y,
      vx:Math.cos(a)*s, vy:Math.sin(a)*s,   // разлёт из точки смерти
      life:def.life||CONFIG.loot.defaultLife,
      bob:Math.random()*Math.PI*2,
      ...extra
    });
  }

  // Что выпадает из убитого врага. xp уже посчитан с учётом множителей.
  //
  // РОВНО ОДНА точка опыта с рядового врага. Раньше опыт дробился на
  // кристаллы номиналами 10/25/60/150 плюс шарик на остаток — с каждого врага
  // падало по два предмета, и при сорока врагах на поле земля превращалась в
  // ковёр из спрайтов. Дробить есть смысл только у босса: три минуты боя не
  // должны заканчиваться одной точкой.
  dropFor(enemy,xp,isBoss){
    const L=CONFIG.loot;
    const total=Math.max(1,Math.round(xp));
    if(isBoss){
      const n=L.bossDrops;
      const part=Math.max(1,Math.floor(total/n));
      for(let i=0;i<n;i++){
        // Последняя точка забирает остаток, чтобы опыт не терялся на округлении
        this.spawn("xp",enemy.x,enemy.y,{value:i===n-1?total-part*(n-1):part});
      }
    } else {
      this.spawn("xp",enemy.x,enemy.y,{value:total});
    }

    // Монеты вернулись вместе с лавкой (CONFIG.shop). С босса — горстью, по
    // той же причине, по которой горстью падает его опыт.
    if(isBoss) for(let i=0;i<L.bossCoins;i++) this.spawn("coin",enemy.x,enemy.y);
    else if(Math.random()<L.coinChance) this.spawn("coin",enemy.x,enemy.y);

    if(isBoss||Math.random()<L.antidoteChance) this.spawn("antidote",enemy.x,enemy.y);
    if(Math.random()<L.potionChance) this.spawn("potion",enemy.x,enemy.y);
  }

  // Возвращает true, если поднятый опыт дал уровень
  update(player,camera){
    this.tick++;
    const L=CONFIG.loot;
    // «Магнит мицелия» из прокачки расширяет радиус притяжения
    const magnet=L.magnetRadius+(player.lootRadius||0);
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
    if(def.coin){
      const v=it.value||def.coin;
      player.coins+=v; player.coinsEarned+=v;
      // Своя монета и своя цифра: без неё непонятно, что кошелёк вообще
      // пополнился — счётчик в HUD маленький и стоит в углу
      this.particles?.emitText(it.x,it.y-12,"+"+v,"#ffd24a",12);
      this.audio?.sfx("coin");
      this.particles?.emit(it.x,it.y,def.particle||"#ffd24a",6);
      return false;
    }
    if(def.heal){
      player.hp=Math.min(player.maxHp,player.hp+def.heal);
      this.particles?.emitText(it.x,it.y-12,"+"+def.heal,"#66ff88");
    }
    if(def.spore){
      player.reduceSpore(def.spore);
      this.particles?.emitText(it.x,it.y-12,"−"+def.spore+"% спор","#00d4aa",12);
    }
    this.audio?.sfx("pickup");
    this.particles?.emit(it.x,it.y,def.particle||"#ffffff",8);
    return false;
  }

  // Размер и цвет точки опыта по её номиналу: мелочь с рядового врага —
  // зелёная искра, кусок с босса — крупный голубой огонёк. Разницу видно, а
  // места точка занимает как частица.
  tierOf(def,value){
    const t=def.tiers;
    let best=t[0];
    for(const row of t) if(value>=row[0]) best=row;
    return best;
  }

  draw(renderer){
    const ctx=renderer.ctx;
    for(const it of this.items){
      const def=it.def;
      // Мигание перед исчезновением — предмет не пропадает молча
      if(it.life<90&&Math.floor(it.life/6)%2===0) continue;
      const y=it.y+Math.sin(it.bob)*2;

      if(def.dot){
        const [,r,color]=this.tierOf(def,it.value||1);
        // Пульсация — единственное, что отличает лежащую точку опыта от
        // случайной частицы взрыва: частицы гаснут, эта дышит
        const k=1+Math.sin(it.bob*1.6)*0.12;
        // Свечение здесь НЕ через shadowBlur: точек на земле бывает под
        // сотню, а shadowBlur — это размытие всего кадра на каждый вызов,
        // то есть сто размытий в кадр на ровном месте. Три круга с падающей
        // прозрачностью дают тот же ореол бесплатно.
        ctx.save();
        ctx.globalAlpha=0.18;
        renderer.drawCircle(it.x,y,r*k*2.2,color);
        ctx.globalAlpha=0.4;
        renderer.drawCircle(it.x,y,r*k*1.45,color);
        ctx.globalAlpha=1;
        renderer.drawCircle(it.x,y,r*k,color);
        ctx.globalAlpha=0.85;
        renderer.drawCircle(it.x,y,r*k*0.45,"#ffffff");
        ctx.restore();
        continue;
      }

      const img=renderer.loader?.getImage(def.image);
      if(!img||!img.width){
        renderer.drawGlowCircle(it.x,y,def.radius,def.particle||"#ffd24a",12);
        continue;
      }
      // одиночный спрайт может быть не квадратным — подгоняем по высоте
      renderer.drawSprite(img,it.x,y,def.size*img.width/img.height,def.size);
    }
  }
}
