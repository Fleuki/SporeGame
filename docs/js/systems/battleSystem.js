import { CONFIG } from "../config.js";
import { Enemy } from "../entities/enemy.js";
import { Boss } from "../entities/boss.js";
import { SpatialGrid } from "../core/spatialGrid.js";
import { Effect, Dissolve } from "../entities/effect.js";

// Вся боевая часть кадра: враги, снаряды, попадания, смерти, лут и опыт.
// Раньше это был один блок на 50 строк внутри main.update() вперемешку с
// обновлением интерфейса.
export class BattleSystem {
  constructor(particles,sporeSystem,loot,audio){
    this.particles=particles;
    this.sporeSystem=sporeSystem;
    this.loot=loot;
    this.audio=audio;
    this.grid=new SpatialGrid(96);
    this._near=[];        // переиспользуемый буфер, чтобы не мусорить в GC
    this.effects=[];      // одноразовые анимации взрывов
    this.kills=0;         // счётчик убитых, его показывает интерфейс
  }

  updateEffects(){
    for(let i=this.effects.length-1;i>=0;i--){
      this.effects[i].update();
      if(this.effects[i].done) this.effects.splice(i,1);
    }
  }

  drawEffects(renderer){ for(const e of this.effects) e.draw(renderer); }

  // Разовая анимация в точке — вспышка уровня, взрыв склянки
  addEffect(x,y,def){ this.effects.push(new Effect(x,y,def)); }

  // Попадание: вспышка, урон по области и яд, если оружие их даёт
  impact(p,enemies,camera){
    const d=p.def;
    if(d.burst) this.effects.push(new Effect(p.x,p.y,d.burst));
    if(!d.area) return;
    // Взрыв по области — заметное событие: его слышно и от него трясёт
    this.audio?.sfx("boom",Math.min(1,d.area.radius/120));
    camera?.shake(CONFIG.feel.shakeExplosion*Math.min(1,d.area.radius/120),9);
    for(const o of this.grid.query(p.x,p.y,d.area.radius,[])){
      if(o.dead||Math.hypot(o.x-p.x,o.y-p.y)>d.area.radius) continue;
      const dmg=p.damage*d.area.damage;
      const a=Math.atan2(o.y-p.y,o.x-p.x);
      o.takeDamage(dmg,a,CONFIG.feel.knockback*this.kbMult(o)*0.7);
      this.showDamage(o,dmg,false);
      if(d.area.dot&&o.applyDot) o.applyDot(d.area.dot.dps,d.area.dot.time);
    }
  }

  // Босса отдача почти не двигает — иначе его можно было бы «выдувать» из
  // арены очередями из зажигательных склянок
  kbMult(e){ return e instanceof Boss ? CONFIG.feel.knockbackBoss : 1; }

  showDamage(e,dmg,crit){
    if(!CONFIG.feel.damageNumbers) return;
    const v=Math.max(1,Math.round(dmg));
    this.particles.emitText(e.x,e.y-e.radius-6,crit?v+"!":String(v),
      crit?"#ffd24a":"#ffffff", crit?17:13);
  }

  // Уровень теперь поднимается не здесь: опыт выпадает предметами, и
  // LootSystem сообщает о левел-апе в момент подбора.
  update(dt,{player,enemies,projectiles,sporeEffects,camera}){
    const ctx={player,enemies,camera,particles:this.particles,sporeLevel:player.sporeLevel,events:[]};

    for(const e of enemies){ if(!e.dead) e.update(dt,ctx); }
    for(const ev of ctx.events) this.handleBossEvent(ev,enemies,player,camera);

    // Сетка строится после того, как все враги сдвинулись
    this.grid.rebuild(enemies);
    this.separate(enemies);
    this.updateProjectiles(projectiles,enemies,player,camera);
    this.updateEffects();

    for(let i=enemies.length-1;i>=0;i--){
      const e=enemies[i];
      if(e.hp>0) continue;
      this.killEnemy(e,enemies,player,sporeEffects,camera);
      enemies.splice(i,1);
    }
  }

  // Расталкивание толпы. Пары берутся из той же сетки, что и попадания, —
  // перебирать всех со всеми при сотне врагов было бы 10 000 проверок в кадр.
  separate(enemies){
    if(CONFIG.feel.separation<=0) return;
    for(const e of enemies){
      if(e.dead||e instanceof Boss) continue;
      for(const o of this.grid.query(e.x,e.y,e.radius*2,this._near)){
        if(o===e||o.dead||o instanceof Boss) continue;
        e.separateFrom(o);
      }
    }
  }

  handleBossEvent(ev,enemies,player,camera){
    const b=ev.boss;
    if(ev.type==="sneeze"){
      this.particles.emitSporeCloud(b.x,b.y,CONFIG.bosses.mother_cap.sporeCloudRadius,"#6b2d5c");
      player.sporeLevel+=5;
    } else if(ev.type==="spawn_minions"){
      const n=CONFIG.bosses.mother_cap.minionCount;
      for(let k=0;k<n;k++){
        const ang=(Math.PI*2/n)*k;
        enemies.push(new Enemy(b.x+Math.cos(ang)*60,b.y+Math.sin(ang)*60,CONFIG.bosses.mother_cap.minionType));
      }
    } else if(ev.type==="summon_tentacle"){
      // Щупальце вырастает в случайной точке видимой области, а не в
      // координатах бывшей фиксированной арены
      const t=camera
        ? {x:camera.x+50+Math.random()*(camera.w-100), y:camera.y+50+Math.random()*(camera.h-100)}
        : {x:player.x, y:player.y};
      enemies.push(new Enemy(t.x,t.y,"mycelium_tentacle"));
    } else if(ev.type==="pulse"){
      for(const en of enemies){ if(!(en instanceof Boss)) en.speed*=1.3; }
    }
  }

  updateProjectiles(projectiles,enemies,player,camera){
    for(let i=projectiles.length-1;i>=0;i--){
      const p=projectiles[i];
      p.update();
      let hit=false;

      // Кандидаты берутся из сетки — перебирать всех врагов не нужно
      for(const e of this.grid.query(p.x,p.y,p.radius+64,this._near)){
        if(e.dead||Math.hypot(p.x-e.x,p.y-e.y)>=p.radius+e.radius) continue;

        // Крит — единственная причина, по которой цифры урона вообще стоит
        // показывать: одинаковые числа не несут информации, разброс — несёт.
        const crit=Math.random()<CONFIG.feel.critChance;
        const dmg=p.damage*(crit?CONFIG.feel.critMult:1);
        e.takeDamage(dmg,p.angle,CONFIG.feel.knockback*this.kbMult(e)*(crit?1.6:1));
        this.showDamage(e,dmg,crit);
        this.audio?.sfx(crit?"crit":"hit");
        if(player.poison) e.hp-=3;
        this.particles.emit(p.x,p.y,"#88ff88",5);

        if(player.explosive){
          for(const o of this.grid.query(p.x,p.y,40,[])){
            if(o!==e&&!o.dead&&Math.hypot(o.x-p.x,o.y-p.y)<40) o.hp-=p.damage*0.5;
          }
          this.particles.emit(p.x,p.y,"#ff6633",10);
        }

        // Один отскок на снаряд, в ближайшего врага в радиусе 150
        if(player.ricochet&&!p.ricocheted){
          let nearest=null,bestD=150;
          for(const o of this.grid.query(p.x,p.y,150,[])){
            if(o===e||o.dead) continue;
            const d=Math.hypot(o.x-p.x,o.y-p.y);
            if(d<bestD){ bestD=d; nearest=o; }
          }
          if(nearest){
            const a=Math.atan2(nearest.y-p.y,nearest.x-p.x);
            p.vx=Math.cos(a)*7; p.vy=Math.sin(a)*7; p.angle=a;
            p.ricocheted=true; hit=false; break;
          }
        }
        hit=true; break;
      }

      if(hit) this.impact(p,enemies,camera);
      if(hit||p.isOffScreen(camera)||p.life<=0) projectiles.splice(i,1);
    }
  }

  killEnemy(e,enemies,player,sporeEffects,camera){
    e.dead=true; this.kills++;
    const t=e.def||{};
    // Тело растворяется: без этого враг просто исчезал в кадре смерти
    if(e.anim?.def) this.effects.push(new Dissolve(e.anim,e.x,e.y,t.rim||"#c58cff",
                                                   e instanceof Boss?34:20));
    this.particles.emit(e.x,e.y,"#39ff14",t.sporeCloudAmount||8);
    this.audio?.sfx("kill");
    if(e instanceof Boss){ this.audio?.sfx("boom"); camera?.shake(CONFIG.feel.shakeBoss,26); }

    if(e.abilities.includes("spore_cloud_on_death")){
      this.particles.emitSporeCloud(e.x,e.y,t.sporeCloudRadius||50,"#6b2d5c");
    }
    if(e.abilities.includes("explode_on_death")){
      this.particles.emit(e.x,e.y,"#c4a000",20,2,6);
      for(const o of this.grid.query(e.x,e.y,t.explodeRadius,[])){
        if(o!==e&&!(o instanceof Boss)&&Math.hypot(o.x-e.x,o.y-e.y)<t.explodeRadius) o.hp-=t.explodeDamage*0.5;
      }
      if(Math.hypot(player.x-e.x,player.y-e.y)<t.explodeRadius){
        player.takeDamage(t.explodeDamage); player.sporeLevel+=10;
      }
    }

    let xp=e.xpReward;
    if(sporeEffects.lootMult) xp*=sporeEffects.lootMult;
    if(player.xpMult) xp*=player.xpMult;
    this.loot.dropFor(e,xp,e instanceof Boss);
  }
}
