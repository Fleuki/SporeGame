// Камера: окно в мир.
//
// Раньше мир был ровно размером с холст (900x700), игрок зажимался clamp'ом
// по краям, а враги спавнились за границей экрана. Теперь мир не ограничен,
// игрок всегда примерно в центре, а камера переводит мировые координаты в
// экранные.
//
// Вся игровая логика и отрисовка сущностей работают в МИРОВЫХ координатах.
// В экранных остаются только интерфейс и джойстик — они рисуются после
// end(), когда сдвиг камеры уже снят.

import { CONFIG } from "../config.js";

// Границы арены в мировых координатах (центр мира — 0,0)
export const WORLD = {
  minX: -CONFIG.world.width/2,  maxX: CONFIG.world.width/2,
  minY: -CONFIG.world.height/2, maxY: CONFIG.world.height/2
};

export class Camera {
  constructor(viewW,viewH){
    this.x=0; this.y=0;          // левый верхний угол окна в мире
    this.w=viewW; this.h=viewH;
    this.smoothing=0.15;         // 0 — камера не движется, 1 — жёстко привязана
  }

  centerOn(target){ this.x=target.x-this.w/2; this.y=target.y-this.h/2; this.clampToWorld(); }

  follow(target){
    const tx=target.x-this.w/2, ty=target.y-this.h/2;
    this.x+=(tx-this.x)*this.smoothing;
    this.y+=(ty-this.y)*this.smoothing;
    this.clampToWorld();
  }

  // Окно не выезжает за арену: у края игрок смещается от центра экрана,
  // но пустоты за границей не видно.
  clampToWorld(){
    this.x=Math.min(Math.max(this.x,WORLD.minX),WORLD.maxX-this.w);
    this.y=Math.min(Math.max(this.y,WORLD.minY),WORLD.maxY-this.h);
  }

  // Округляем сдвиг до целых пикселей: иначе пиксель-арт «плывёт» на
  // дробных смещениях и подрагивает при движении.
  begin(ctx){ ctx.save(); ctx.translate(-Math.round(this.x),-Math.round(this.y)); }
  end(ctx){ ctx.restore(); }

  toWorld(sx,sy){ return {x:sx+this.x, y:sy+this.y}; }
  toScreen(wx,wy){ return {x:wx-this.x, y:wy-this.y}; }

  // Видна ли точка в окне (margin — запас за краем)
  sees(x,y,margin=0){
    return x>=this.x-margin && x<=this.x+this.w+margin
        && y>=this.y-margin && y<=this.y+this.h+margin;
  }

  // Случайная точка на кольце сразу за краем видимости — туда спавним врагов.
  // У границы арены часть кольца оказывается за миром, поэтому направление
  // выбирается несколько раз, пока точка не попадёт внутрь.
  pointOutside(margin=90){
    const rx=this.w/2+margin, ry=this.h/2+margin;
    const cx=this.x+this.w/2, cy=this.y+this.h/2;
    let p=null;
    for(let i=0;i<10;i++){
      const a=Math.random()*Math.PI*2;
      // Прямоугольная «рамка», а не окружность: иначе по диагоналям враги
      // появлялись бы заметно дальше, чем сверху и снизу.
      const k=1/Math.max(Math.abs(Math.cos(a))/rx, Math.abs(Math.sin(a))/ry);
      p={x:cx+Math.cos(a)*k, y:cy+Math.sin(a)*k};
      if(p.x>=WORLD.minX&&p.x<=WORLD.maxX&&p.y>=WORLD.minY&&p.y<=WORLD.maxY) return p;
    }
    // Прижались в угол арены — ставим врага хотя бы внутрь мира
    p.x=Math.min(Math.max(p.x,WORLD.minX+20),WORLD.maxX-20);
    p.y=Math.min(Math.max(p.y,WORLD.minY+20),WORLD.maxY-20);
    return p;
  }
}
