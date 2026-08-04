// Общий предок всего, что живёт на поле и может получить урон.
//
// До этого Enemy и Boss были независимыми классами с разными сигнатурами
// update(), и главный цикл разбирал их через instanceof, вызывая боссу
// update дважды. Теперь у всех один интерфейс update(dt, ctx) / draw(renderer),
// а instanceof остаётся только там, где действительно нужно отличить босса
// (иммунитет к цепному взрыву, гарантированный дроп антидота).

export class Entity {
  constructor(x,y,radius){
    this.x=x; this.y=y; this.radius=radius;
    this.hp=1; this.maxHp=1;
    this.dead=false; this.life=0;
  }

  // ctx — общий контекст кадра: { player, enemies, particles, sporeLevel, events }
  update(dt,ctx){ this.life++; }
  draw(renderer){}

  takeDamage(amount){ this.hp-=amount; return this.hp<=0; }

  distTo(o){ return Math.hypot(o.x-this.x,o.y-this.y); }
  overlaps(o){ return this.distTo(o)<this.radius+o.radius; }
}
