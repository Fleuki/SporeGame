// Общий предок всего, что живёт на поле и может получить урон.
//
// До этого Enemy и Boss были независимыми классами с разными сигнатурами
// update(), и главный цикл разбирал их через instanceof, вызывая боссу
// update дважды. Теперь у всех один интерфейс update(dt, ctx) / draw(renderer),
// а instanceof остаётся только там, где действительно нужно отличить босса
// (иммунитет к цепному взрыву, гарантированный дроп антидота).

import { CONFIG } from "../config.js";
import { WORLD } from "../core/camera.js";

export class Entity {
  constructor(x,y,radius){
    this.x=x; this.y=y; this.radius=radius;
    this.hp=1; this.maxHp=1;
    this.dead=false; this.life=0;
    // Реакция на удар: вспышка на несколько кадров и отдача по направлению
    // выстрела. Без них попадание видно только по убыванию полоски HP.
    this.flash=0; this.kx=0; this.ky=0;
  }

  // ctx — общий контекст кадра: { player, enemies, particles, sporeLevel, events }
  update(dt,ctx){ this.life++; }
  draw(renderer){}

  // angle/force — откуда прилетело: снаряд толкает, урон по времени нет
  takeDamage(amount,angle=null,force=0){
    this.hp-=amount;
    this.flash=CONFIG.feel.hitFlash;
    if(force>0&&angle!==null){ this.kx+=Math.cos(angle)*force; this.ky+=Math.sin(angle)*force; }
    return this.hp<=0;
  }

  // Затухание отдачи и вспышки — общий кусок кадра для всех, кого бьют
  stepImpact(){
    if(this.flash>0) this.flash--;
    if(this.kx||this.ky){
      this.x+=this.kx; this.y+=this.ky;
      const f=CONFIG.feel.knockbackFriction;
      this.kx*=f; this.ky*=f;
      if(Math.abs(this.kx)<0.05) this.kx=0;
      if(Math.abs(this.ky)<0.05) this.ky=0;
      this.clampToArena();
    }
  }

  // НИКТО НЕ ВЫХОДИТ ЗА АРЕНУ. Игрок зажат её границами с самого начала
  // (`Player.update`), а вот врагов не держало ничто — их двигала только
  // погоня за игроком, и уйти наружу они не могли. Отдача могла.
  //
  // Живой игрой: Улей вытолкали ударами за верхний край, а он НЕПОДВИЖЕН —
  // сам не вернулся, а игрок за ним выйти не может. Босс остался жив
  // навсегда, и вместе с ним застрял финал забега, который ждёт, пока арена
  // освободится. Один невыталкиваемый босс отменил конец игры.
  //
  // Отдача при этом остаётся: она толкает, просто не наружу. Радиус вычтен —
  // иначе туша упирается в край половиной себя, и по ней трудно попасть.
  clampToArena(){
    const r=this.radius||0;
    this.x=Math.min(Math.max(this.x,WORLD.minX+r),WORLD.maxX-r);
    this.y=Math.min(Math.max(this.y,WORLD.minY+r),WORLD.maxY-r);
  }

  distTo(o){ return Math.hypot(o.x-this.x,o.y-this.y); }
  overlaps(o){ return this.distTo(o)<this.radius+o.radius; }
}
