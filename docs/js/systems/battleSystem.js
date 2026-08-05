import { CONFIG } from "../config.js";
import { Enemy } from "../entities/enemy.js";
import { Boss } from "../entities/boss.js";
import { SpatialGrid } from "../core/spatialGrid.js";
import { Projectile, EnemyShot } from "../entities/projectile.js";
import { Effect, Dissolve } from "../entities/effect.js";

// Сколько живых грибниц (эволюция токсичной склянки) держим одновременно.
// Старейшая уступает место новой: пятно живёт впятеро дольше перезарядки,
// и без предела арена заросла бы сплошным ковром урона.
const MAX_FIELDS = 10;

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
    this.enemyShots=[];   // облака спор, выпущенные трубачами
    this.fields=[];       // живые грибницы: пятна урона, оставшиеся на земле
    this.kills=0;         // счётчик убитых, его показывает интерфейс
  }

  reset(){
    this.effects.length=0; this.enemyShots.length=0;
    this.fields.length=0; this.kills=0;
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

  // Попадание: вспышка, урон по области и лужа, если оружие их даёт.
  // Радиус и сила лужи берутся с учётом прокачки ИМЕННО ЭТОГО ствола
  // (p.mods), а не общих флагов игрока.
  impact(p,enemies,camera,projectiles){
    const d=p.def;
    if(d.burst) this.effects.push(new Effect(p.x,p.y,d.burst));
    // Эволюции: грибница остаётся на земле, вулкан разбрасывает осколки.
    // Оба живут до проверки d.area — они не «часть взрыва», а отдельное
    // поведение ствола, и работают даже там, где взрыва нет.
    if(d.field) this.spawnField(p);
    if(d.cluster&&projectiles) this.spawnCluster(p,projectiles);
    if(!d.area) return;
    const radius=d.area.radius*(p.mods.areaMult||1);
    // Взрыв по области — заметное событие: его слышно и от него трясёт
    this.audio?.sfx("boom",Math.min(1,radius/120));
    camera?.shake(CONFIG.feel.shakeExplosion*Math.min(1,radius/120),9);
    for(const o of this.grid.query(p.x,p.y,radius,[])){
      if(o.dead||Math.hypot(o.x-p.x,o.y-p.y)>radius) continue;
      const dmg=p.damage*d.area.damage;
      const a=Math.atan2(o.y-p.y,o.x-p.x);
      o.takeDamage(dmg,a,CONFIG.feel.knockback*this.kbMult(o)*0.7);
      this.showDamage(o,dmg,false);
      if(d.area.dot&&o.applyDot){
        o.applyDot(d.area.dot.dps*(p.mods.dotMult||1),d.area.dot.time);
      }
    }
  }

  // ЖИВАЯ ГРИБНИЦА (эволюция токсичной склянки). Пятно на земле, которое
  // жжёт всех, кто в него зайдёт. Игрока не трогает: это его собственный
  // ствол, а не кислотная лужа с карты.
  //
  // Потолок в MAX_FIELDS обязателен: перезарядка эволюции 76 кадров, а живёт
  // пятно 300 — без предела к десятой минуте арена превратилась бы в сплошной
  // ковёр урона, и врагам оставалось бы только умирать по дороге.
  spawnField(p){
    const f=p.def.field;
    if(this.fields.length>=MAX_FIELDS) this.fields.shift();
    this.fields.push({
      x:p.x, y:p.y,
      r:f.radius*(p.mods.areaMult||1),
      dps:f.dps*(p.mods.dotMult||1),
      life:f.life, maxLife:f.life,
      color:f.color||"#a8ff6a"
    });
  }

  updateFields(dt){
    for(let i=this.fields.length-1;i>=0;i--){
      const f=this.fields[i];
      if(--f.life<=0){ this.fields.splice(i,1); continue; }
      for(const e of this.grid.query(f.x,f.y,f.r,[])){
        if(e.dead||Math.hypot(e.x-f.x,e.y-f.y)>f.r+e.radius*0.5) continue;
        e.hp-=f.dps*dt;
      }
      // Грибница дышит спорами — иначе пятно на земле неотличимо от текстуры
      if(f.life%9===0){
        const a=Math.random()*Math.PI*2, rr=Math.sqrt(Math.random())*f.r;
        this.particles?.emitToxicTrail(f.x+Math.cos(a)*rr,f.y+Math.sin(a)*rr);
      }
    }
  }

  // Рисуется ПОД сущностями (см. main.draw): это земля, а не эффект поверх боя
  drawFields(renderer){
    const ctx=renderer.ctx;
    for(const f of this.fields){
      // Последняя секунда — пятно гаснет, чтобы «оно ещё жжёт или уже нет»
      // было видно заранее
      const k=Math.min(1,f.life/60);
      const pulse=1+Math.sin(f.life*0.07)*0.03;
      ctx.save();
      ctx.globalAlpha=0.16*k;
      renderer.drawCircle(f.x,f.y,f.r*pulse,f.color);
      ctx.globalAlpha=0.3*k;
      ctx.strokeStyle=f.color; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.arc(f.x,f.y,f.r*pulse,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  // ОСКОЛКИ ВУЛКАНА (эволюция зажигательной склянки). Разлетаются веером от
  // точки взрыва и рвутся сами — по фитилю или от первого встречного.
  // Собственного cluster у осколка нет, поэтому цепочка обрывается на нём.
  spawnCluster(p,projectiles){
    const c=p.def.cluster;
    const base=Math.random()*Math.PI*2;
    for(let i=0;i<c.count;i++){
      const a=base+i*(Math.PI*2/c.count);
      projectiles.push(new Projectile(
        p.x,p.y,a,p.damage*c.damage,c.shot,
        { areaMult:p.mods.areaMult||1, dotMult:p.mods.dotMult||1,
          pierce:0, bounces:0 }
      ));
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
    const ctx={player,enemies,camera,particles:this.particles,
               sporeLevel:player.sporeLevel,events:[],shots:[]};

    for(const e of enemies){ if(!e.dead) e.update(dt,ctx); }
    for(const ev of ctx.events) this.handleBossEvent(ev,enemies,player,camera);
    for(const s of ctx.shots){
      this.enemyShots.push(new EnemyShot(s.x,s.y,s.angle,s.def,s.damage));
      this.audio?.sfx("shoot",0.5);
    }

    // Сетка строится после того, как все враги сдвинулись
    this.grid.rebuild(enemies);
    this.separate(enemies);
    this.updateProjectiles(projectiles,enemies,player,camera);
    this.updateEnemyShots(player,camera);
    this.updateFields(dt);
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
      // Сетка нужна только самонаводящимся снарядам — остальные её не читают
      p.update(this.grid);
      let spent=false;   // снаряд отработал и должен исчезнуть

      // Кандидаты берутся из сетки — перебирать всех врагов не нужно
      for(const e of this.grid.query(p.x,p.y,p.radius+64,this._near)){
        if(e.dead||p.hit.has(e)) continue;
        if(Math.hypot(p.x-e.x,p.y-e.y)>=p.radius+e.radius) continue;
        p.hit.add(e);

        // Крит — единственная причина, по которой цифры урона вообще стоит
        // показывать: одинаковые числа не несут информации, разброс — несёт.
        const crit=Math.random()<CONFIG.feel.critChance;
        const dmg=p.damage*(crit?CONFIG.feel.critMult:1);
        e.takeDamage(dmg,p.angle,CONFIG.feel.knockback*this.kbMult(e)*(crit?1.6:1));
        this.showDamage(e,dmg,crit);
        this.audio?.sfx(crit?"crit":"hit");
        this.particles.emit(p.x,p.y,"#88ff88",5);
        this.impact(p,enemies,camera,projectiles);

        // ПРОБИТИЕ идёт раньше ОТСКОКА: прошивающий снаряд летит дальше по
        // прямой и в кого-то ещё врежется сам, а отскок — это уже последнее
        // действие снаряда, после него он гарантированно тратится.
        if(p.pierceLeft>0){ p.pierceLeft--; break; }

        if(p.bouncesLeft>0){
          const next=this.nearestOther(p,e,170);
          if(next){
            const a=Math.atan2(next.y-p.y,next.x-p.x);
            const sp=Math.hypot(p.vx,p.vy);
            p.vx=Math.cos(a)*sp; p.vy=Math.sin(a)*sp; p.angle=a;
            p.bouncesLeft--; p.life=Math.max(p.life,40);
            break;
          }
        }
        spent=true; break;
      }

      const gone=p.isOffScreen(camera);
      if(spent||gone||p.life<=0){
        // ФИТИЛЬ. Осколок вулкана рвётся и без попадания — иначе шесть спор
        // разлетались бы в пустоту и тихо исчезали, а «взрыв разбрасывает
        // рвущиеся споры» превращалось бы в «иногда разбрасывает».
        // За экраном не рвём: этого взрыва всё равно никто не увидит.
        if(!spent&&!gone&&p.def.fuse) this.impact(p,enemies,camera,projectiles);
        projectiles.splice(i,1);
      }
    }
  }

  // Ближайшая цель для отскока, кроме той, в которую только что попали
  nearestOther(p,skip,range){
    let best=null,bestD=range;
    for(const o of this.grid.query(p.x,p.y,range,[])){
      if(o===skip||o.dead||p.hit.has(o)) continue;
      const d=Math.hypot(o.x-p.x,o.y-p.y);
      if(d<bestD){ bestD=d; best=o; }
    }
    return best;
  }

  // СНАРЯДЫ ВРАГОВ. Единственное, что достаёт игрока, когда он стоит в
  // безопасном углу и выкашивает всё на подходе.
  updateEnemyShots(player,camera){
    for(let i=this.enemyShots.length-1;i>=0;i--){
      const s=this.enemyShots[i];
      s.update();
      if(!player.isDying&&Math.hypot(player.x-s.x,player.y-s.y)<player.radius+s.radius){
        // takeDamage вернёт false, если урон съели щит или неуязвимость, —
        // споры в этом случае тоже не налипают
        if(player.takeDamage(s.damage)&&s.def.spore){
          player.sporeLevel=Math.min(CONFIG.sporeSystem.maxSpore,
                                     player.sporeLevel+s.def.spore);
        }
        this.particles.emit(s.x,s.y,s.def.glow||"#ffe066",10);
        this.enemyShots.splice(i,1);
        continue;
      }
      if(s.life<=0||s.isOffScreen(camera)) this.enemyShots.splice(i,1);
    }
  }

  drawShots(renderer){ for(const s of this.enemyShots) s.draw(renderer); }

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
