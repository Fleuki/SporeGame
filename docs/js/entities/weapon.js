import { CONFIG } from "../config.js";
import { Projectile } from "./projectile.js";

// Один ствол со своим таймером. Игрок держит список таких и стреляет из
// всех сразу — стволы не мешают друг другу, потому что у каждого своя
// дистанция, темп и тип урона.
export class Weapon {
  constructor(def){ this.def=def; this.cooldown=0; }

  update(){ if(this.cooldown>0) this.cooldown--; }

  // Ближайший враг в радиусе действия
  findTarget(player,enemies){
    let best=null,bestD=this.def.range;
    for(const e of enemies){
      if(e.dead) continue;
      const d=Math.hypot(e.x-player.x,e.y-player.y);
      if(d<bestD){ bestD=d; best=e; }
    }
    return best;
  }

  // Возвращает снаряд или null. Стволы с дальностью молчат, если цели нет.
  fire(player,enemies){
    if(this.cooldown>0) return null;
    const d=this.def;
    let angle=player.angle;
    if(d.range>0){
      const t=this.findTarget(player,enemies);
      if(!t) return null;
      angle=Math.atan2(t.y-player.y,t.x-player.x);
    }
    // Апгрейд скорострельности меняет player.attackRate — множим на его
    // отношение к базовому, чтобы он ускорял все стволы, а не только один.
    const rate=player.attackRate/CONFIG.player.attackRate;
    this.cooldown=Math.max(3,Math.round(d.interval*rate));
    return new Projectile(
      player.x+Math.cos(angle)*(player.radius+6),
      player.y+Math.sin(angle)*(player.radius+6),
      angle, player.damage*d.damage, d
    );
  }
}
