import { CONFIG } from "../config.js";
import { WORLD } from "../core/camera.js";

// КАРТА: земля и декорации арены.
//
// Арена большая (см. CONFIG.world), поэтому ни тайлы, ни декорации не
// раскладываются заранее: оба слоя строятся каждый кадр по видимому куску.
//   * земля — паттерн из бесшовной текстуры, он сам прокручивается вместе
//     с камерой, потому что рисуется в мировых координатах;
//   * декорации — детерминированный «шум» по индексам клетки (тот же приём,
//     что в Renderer.drawMyceliumVeins): пень или телега всегда оказываются
//     в одном и том же месте мира, сколько бы раз игрок туда ни вернулся.
//
// Биом меняется по номеру волны и перекрашивает всю арену целиком.
export class MapSystem {
  constructor(){
    this.patternKey=null; this.pattern=null; this.tick=0;
    this.visible=[];   // декорации текущего кадра, считаются один раз
    // Мешок типов по весам: лужи должны попадаться заметно реже пней
    this.bag=[];
    for(const [key,def] of Object.entries(CONFIG.map.props)){
      for(let i=0;i<(def.weight||1);i++) this.bag.push(key);
    }
  }

  // Список видимых декораций пересчитывается раз в кадр: его читают и
  // отрисовка, и проверка урона от луж.
  update(camera){
    this.tick++;
    this.visible=camera?this.visibleProps(camera):[];
  }

  // Урон от опасных декораций (кислотная лужа). Достаётся всем, кто внутри:
  // толпу можно заманить в лужу, но и самому туда лучше не заходить.
  applyHazards(dt,player,enemies,particles){
    for(const d of this.visible){
      const h=d.def.hazard;
      if(!h) continue;
      const r=d.w*h.radius;
      if(Math.hypot(player.x-d.x,player.y-d.y)<r+player.radius*0.5){
        player.hp-=h.dps*dt;
        player.sporeLevel=Math.min(CONFIG.sporeSystem.maxSpore,player.sporeLevel+h.spore*dt);
        if(this.tick%12===0) particles?.emit(player.x,player.y,"#c8ff2a",3);
      }
      for(const e of enemies){
        if(e.dead) continue;
        if(Math.hypot(e.x-d.x,e.y-d.y)<r+e.radius*0.5) e.hp-=h.enemyDps*dt;
      }
    }
  }

  // Биом сменяется по времени забега: номера волны больше не существует
  biome(runTime){
    const list=CONFIG.map.biomes;
    return list[Math.floor(Math.max(0,runTime)/CONFIG.map.secondsPerBiome)%list.length];
  }

  // --- мировой слой ---------------------------------------------------
  drawGround(renderer,runTime){
    const c=renderer.camera, ctx=renderer.ctx;
    const biome=this.biome(runTime);
    const img=renderer.loader?.getImage(biome.tile);
    if(!c) return;
    if(!img||!img.width){
      // текстуры ещё не загрузились (или их нет) — старый процедурный фон
      renderer.drawMyceliumVeins(); renderer.drawGrid();
      return;
    }
    if(this.patternKey!==biome.tile){
      this.pattern=ctx.createPattern(img,"repeat");
      this.patternKey=biome.tile;
    }
    if(!this.pattern) return;
    // Земля есть только внутри арены — за границей пустота
    const x0=Math.max(c.x-1,WORLD.minX), y0=Math.max(c.y-1,WORLD.minY);
    const x1=Math.min(c.x+c.w+1,WORLD.maxX), y1=Math.min(c.y+c.h+1,WORLD.maxY);
    if(x1<=x0||y1<=y0) return;
    ctx.fillStyle=CONFIG.world.voidColor;
    ctx.fillRect(c.x-1,c.y-1,c.w+2,c.h+2);
    // Масштабируем холст, чтобы тайл лёг нужного размера; координаты делим
    // на тот же множитель — на экране позиция не съезжает.
    const s=CONFIG.map.tileSize/img.width;
    ctx.save();
    ctx.scale(s,s);
    ctx.fillStyle=this.pattern;
    ctx.fillRect(x0/s,y0/s,(x1-x0)/s,(y1-y0)/s);
    ctx.restore();
    ctx.fillStyle=biome.tint;
    ctx.fillRect(x0,y0,x1-x0,y1-y0);
  }

  // Граница арены: не стена, а сгущающийся мрак. Рисуется поверх земли и
  // декораций, но под сущностями — врага у самого края видно должно быть.
  drawEdge(renderer){
    const ctx=renderer.ctx, c=renderer.camera;
    if(!c) return;
    const f=CONFIG.world.edgeFog;
    if(f<=0) return;
    const edges=[
      [WORLD.minX,WORLD.minX+f,0], [WORLD.maxX,WORLD.maxX-f,0],
      [WORLD.minY,WORLD.minY+f,1], [WORLD.maxY,WORLD.maxY-f,1]
    ];
    for(const [at,inner,axis] of edges){
      const g=axis===0
        ? ctx.createLinearGradient(at,0,inner,0)
        : ctx.createLinearGradient(0,at,0,inner);
      g.addColorStop(0,"rgba(5,8,10,0.95)");
      g.addColorStop(1,"rgba(5,8,10,0)");
      ctx.fillStyle=g;
      if(axis===0){
        const x=Math.min(at,inner);
        ctx.fillRect(x,c.y-1,f,c.h+2);
      }else{
        const y=Math.min(at,inner);
        ctx.fillRect(c.x-1,y,c.w+2,f);
      }
    }
  }

  // Декорации видимых клеток, отсортированные по Y: дальние рисуются первыми
  visibleProps(camera){
    const M=CONFIG.map, cell=M.decorCell, out=[];
    const gx0=Math.floor((camera.x-cell)/cell), gx1=Math.floor((camera.x+camera.w)/cell);
    const gy0=Math.floor((camera.y-cell)/cell), gy1=Math.floor((camera.y+camera.h)/cell);
    for(let gx=gx0;gx<=gx1;gx++){
      for(let gy=gy0;gy<=gy1;gy++){
        const h=(gx*73856093^gy*19349663)>>>0;
        if((h%1000)/1000>M.decorChance) continue;
        const def=M.props[this.bag[(h>>>9)%this.bag.length]];
        const x=gx*cell+(h>>>3)%cell, y=gy*cell+(h>>>13)%cell;
        // вокруг точки старта декораций нет — иначе игрок появляется в телеге
        if(Math.hypot(x,y)<M.decorClearRadius) continue;
        // и за границей арены их тоже нет
        if(x<WORLD.minX||x>WORLD.maxX||y<WORLD.minY||y>WORLD.maxY) continue;
        out.push({ def, x, y,
          w: def.width*(0.85+((h>>>23)%100)/300),
          flip: ((h>>>17)&1)===1,
          // сдвиг фазы анимации, иначе все лужи булькают синхронно
          phase: (h>>>5)%64 });
      }
    }
    out.sort((a,b)=>a.y-b.y);
    return out;
  }

  drawDecor(renderer){
    for(const d of this.visible){
      const def=d.def;
      const img=renderer.loader?.getImage(def.image);
      if(!img||!img.width) continue;
      // у анимированного листа пропорции берутся с одного кадра, а не со всей полосы
      const frameW=def.frames?img.width/def.frames:img.width;
      const frame=def.frames
        ? Math.floor((this.tick/def.animSpeed)+d.phase)%def.frames
        : 0;
      renderer.drawProp(def.image,d.x,d.y,d.w,d.w*img.height/frameW,
        { flip:def.flat?false:d.flip, glow:def.glow, glowBlur:def.glowBlur,
          flat:def.flat, frames:def.frames, frame });
    }
  }

  // --- экранный слой ---------------------------------------------------
  drawVignette(renderer){ renderer.drawVignette(CONFIG.map.vignette); }

  // ТЕМНОТА. Арена больше не освещена равномерно: кадр затемняется целиком,
  // а свет остаётся кругом вокруг игрока и ореолами вокруг светящихся
  // декораций.
  //
  // Одним градиентом поверх кадра это не рисуется: источников света
  // несколько, и накладывать их друг на друга нельзя — в местах пересечения
  // получилось бы двойное затемнение. Поэтому слой собирается в отдельном
  // канвасе: сплошная заливка, из которой источники ВЫРЕЗАЮТ свет через
  // destination-out, и только потом всё это кладётся на кадр.
  drawDarkness(renderer,player){
    const D=CONFIG.map.darkness;
    if(!D||D.strength<=0) return;
    const cam=renderer.camera; if(!cam||!player) return;
    const w=renderer.canvas.width, h=renderer.canvas.height;

    let cv=this._dark;
    if(!cv||cv.width!==w||cv.height!==h){
      cv=this._dark=document.createElement("canvas");
      cv.width=w; cv.height=h;
      this._darkCtx=cv.getContext("2d");
    }
    const dc=this._darkCtx;
    dc.globalCompositeOperation="source-over";
    dc.fillStyle="#03060a";
    dc.clearRect(0,0,w,h);
    dc.fillRect(0,0,w,h);

    dc.globalCompositeOperation="destination-out";
    // Круг света дышит — иначе он выглядит трафаретом, приклеенным к игроку
    const pulse=Math.sin(this.tick*D.pulseSpeed)*(D.pulse||0);
    const p=cam.toScreen(player.x,player.y);
    this.cutLight(dc,p.x,p.y,D.playerRadius+pulse,D.playerCore);
    for(const d of this.visible){
      if(!d.def.glow) continue;
      const s=cam.toScreen(d.x,d.y-d.w*0.3);
      this.cutLight(dc,s.x,s.y,D.propRadius*(d.w/(d.def.width||d.w)),0.15);
    }

    renderer.ctx.save();
    renderer.ctx.globalAlpha=D.strength;
    renderer.ctx.drawImage(cv,0,0);
    renderer.ctx.restore();
  }

  // Вырезает из слоя темноты мягкое пятно света. core — доля радиуса, внутри
  // которой темнота снимается полностью.
  cutLight(dc,x,y,r,core){
    if(r<=0) return;
    const g=dc.createRadialGradient(x,y,r*core,x,y,r);
    g.addColorStop(0,"rgba(0,0,0,1)");
    g.addColorStop(0.5,"rgba(0,0,0,0.72)");
    g.addColorStop(0.8,"rgba(0,0,0,0.3)");
    g.addColorStop(1,"rgba(0,0,0,0)");
    dc.fillStyle=g;
    dc.beginPath(); dc.arc(x,y,r,0,Math.PI*2); dc.fill();
  }
}
