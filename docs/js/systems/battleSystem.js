import { CONFIG } from "../config.js";
import { Enemy } from "../entities/enemy.js";
import { Boss } from "../entities/boss.js";

// Вся боевая часть кадра: враги, снаряды, попадания, смерти, лут и опыт.
// Раньше это был один блок на 50 строк внутри main.update() вперемешку с
// обновлением интерфейса.
export class BattleSystem {
  constructor(particles,sporeSystem){
    this.particles=particles;
    this.sporeSystem=sporeSystem;
  }

  // Возвращает { leveledUp } — открытие меню прокачки остаётся за main,
  // потому что оно ставит игру на паузу.
  update(dt,{player,enemies,projectiles,sporeEffects}){
    const ctx={player,enemies,particles:this.particles,sporeLevel:player.sporeLevel,events:[]};

    for(const e of enemies){ if(!e.dead) e.update(dt,ctx); }
    for(const ev of ctx.events) this.handleBossEvent(ev,enemies,player);

    this.updateProjectiles(projectiles,enemies,player);

    let leveledUp=false;
    for(let i=enemies.length-1;i>=0;i--){
      const e=enemies[i];
      if(e.hp>0) continue;
      if(this.killEnemy(e,enemies,player,sporeEffects)) leveledUp=true;
      enemies.splice(i,1);
    }
    return {leveledUp};
  }

  handleBossEvent(ev,enemies,player){
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
      const tx=50+Math.random()*(CONFIG.screen.width-100);
      const ty=50+Math.random()*(CONFIG.screen.height-100);
      enemies.push(new Enemy(tx,ty,"mycelium_tentacle"));
    } else if(ev.type==="pulse"){
      for(const en of enemies){ if(!(en instanceof Boss)) en.speed*=1.3; }
    }
  }

  updateProjectiles(projectiles,enemies,player){
    for(let i=projectiles.length-1;i>=0;i--){
      const p=projectiles[i];
      p.update();
      let hit=false;

      for(const e of enemies){
        if(e.dead||Math.hypot(p.x-e.x,p.y-e.y)>=p.radius+e.radius) continue;

        e.takeDamage(p.damage);
        if(player.poison) e.hp-=3;
        this.particles.emit(p.x,p.y,"#88ff88",5);

        if(player.explosive){
          for(const o of enemies){
            if(o!==e&&!o.dead&&Math.hypot(o.x-p.x,o.y-p.y)<40) o.hp-=p.damage*0.5;
          }
          this.particles.emit(p.x,p.y,"#ff6633",10);
        }

        // Один отскок на снаряд, в ближайшего врага в радиусе 150
        if(player.ricochet&&!p.ricocheted){
          let nearest=null,bestD=150;
          for(const o of enemies){
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

      if(hit||p.isOffScreen(CONFIG.screen.width,CONFIG.screen.height)||p.life<=0) projectiles.splice(i,1);
    }
  }

  // Возвращает true, если игрок поднял уровень
  killEnemy(e,enemies,player,sporeEffects){
    e.dead=true;
    const t=e.def||{};
    this.particles.emit(e.x,e.y,"#39ff14",t.sporeCloudAmount||8);

    if(e.abilities.includes("spore_cloud_on_death")){
      this.particles.emitSporeCloud(e.x,e.y,t.sporeCloudRadius||50,"#6b2d5c");
    }
    if(e.abilities.includes("explode_on_death")){
      this.particles.emit(e.x,e.y,"#c4a000",20,2,6);
      for(const o of enemies){
        if(o!==e&&!(o instanceof Boss)&&Math.hypot(o.x-e.x,o.y-e.y)<t.explodeRadius) o.hp-=t.explodeDamage*0.5;
      }
      if(Math.hypot(player.x-e.x,player.y-e.y)<t.explodeRadius){
        player.takeDamage(t.explodeDamage); player.sporeLevel+=10;
      }
    }

    let xp=e.xpReward;
    if(sporeEffects.lootMult) xp*=sporeEffects.lootMult;
    if(player.xpMult) xp*=player.xpMult;
    const leveledUp=player.addXp(xp);

    if(Math.random()<0.08||(e instanceof Boss)) this.sporeSystem.spawnAntidote(e.x,e.y);
    return leveledUp;
  }
}
