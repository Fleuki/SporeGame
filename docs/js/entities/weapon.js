import { CONFIG } from "../config.js";
import { Projectile } from "./projectile.js";

// Один ствол со своим таймером. Игрок держит список таких и стреляет из
// всех сразу — стволы не мешают друг другу, потому что у каждого своя
// дистанция, темп и тип урона.
//
// ПРОКАЧКА ЖИВЁТ ЗДЕСЬ. Раньше улучшения стрельбы были глобальными флагами на
// игроке (player.ricochet, player.explosive, player.poison), и это давало
// ровно три проблемы:
//   1. Одна карточка «Рикошет» действовала сразу на все стволы, включая
//      зажигательную склянку, которая и без того взрывается по площади.
//   2. Карточек было по одной на эффект: взял — и ветка кончилась.
//   3. Балансировать было нечего: флаг либо есть, либо нет.
// Теперь у каждого ствола свой набор множителей, и карточки прокачки
// улучшают КОНКРЕТНЫЙ ствол — тот, который игрок уже носит.
export class Weapon {
  constructor(def){
    this.def=def;
    this.cooldown=0;
    // Множители от карточек прокачки. 1 — как в конфиге.
    this.dmgMult=1;      // урон снаряда
    this.rateMult=1;     // перезарядка: меньше — чаще
    this.areaMult=1;     // радиус взрыва/лужи
    this.dotMult=1;      // сила урона по времени
    this.shots=1;        // снарядов за выстрел
    this.spread=0.13;    // разброс веера при shots>1, радиан на снаряд
    this.pierce=0;       // сколько врагов снаряд прошивает насквозь
    this.bounces=0;      // сколько раз отскакивает к соседней цели
    this.evolved=false;  // ствол уже прошёл эволюцию — второй раз нельзя
  }

  // ЭВОЛЮЦИЯ. Пятая карточка ветки не крутит множитель, а подменяет ОПИСАНИЕ
  // ствола: другой темп, другой снаряд, другое поведение (см. CONFIG.weapons,
  // раздел «эволюции»).
  //
  // Множители при этом ОСТАЮТСЯ. Четыре карточки ветки — это половина забега,
  // и обнулять их на пороге эволюции значило бы наказывать ровно за то, ради
  // чего игрок ветку и качал. Веер и пробитие берутся по максимуму: у
  // эволюции есть свой минимум, но если игрок набрал больше — больше и
  // останется.
  evolve(def){
    this.def=def; this.evolved=true;
    if(def.shots) this.shots=Math.max(this.shots,def.shots);
    if(def.pierce) this.pierce=Math.max(this.pierce,def.pierce);
    if(def.spread) this.spread=def.spread;
    // Перезарядка считается от нового интервала — иначе ствол молчал бы
    // остаток старого, более долгого
    this.cooldown=0;
  }

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

  // Что снаряд унесёт с собой в боевую систему: по этому она считает радиус
  // взрыва, силу лужи и сколько ещё целей снаряд имеет право задеть.
  mods(){
    return { areaMult:this.areaMult, dotMult:this.dotMult,
             pierce:this.pierce, bounces:this.bounces };
  }

  // Возвращает массив снарядов (пустой, если ствол молчит).
  // Стволы с дальностью не стреляют, если цели в радиусе нет.
  fire(player,enemies){
    if(this.cooldown>0) return [];
    const d=this.def;
    let angle=player.angle;
    if(d.range>0){
      const t=this.findTarget(player,enemies);
      if(!t) return [];
      angle=Math.atan2(t.y-player.y,t.x-player.x);
    }
    // Общий апгрейд скорострельности (player.rateMult) действует на все
    // стволы, свой (this.rateMult) — только на этот
    this.cooldown=Math.max(3,Math.round(d.interval*this.rateMult*player.rateMult));

    const out=[];
    const dmg=player.damage*d.damage*this.dmgMult;
    for(let i=0;i<this.shots;i++){
      // Веер симметричен относительно исходного угла: один снаряд летит
      // ровно в цель, два расходятся поровну, три — центральный плюс пара
      const a=angle+(i-(this.shots-1)/2)*this.spread;
      out.push(new Projectile(
        player.x+Math.cos(a)*(player.radius+6),
        player.y+Math.sin(a)*(player.radius+6),
        a, dmg, d, this.mods()
      ));
    }
    return out;
  }
}
