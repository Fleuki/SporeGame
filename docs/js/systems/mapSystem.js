import { CONFIG } from "../config.js";

// КАРТА: земля и декорации бесконечного мира.
//
// Мир не ограничен, поэтому ни тайлы, ни декорации нельзя разложить заранее:
// оба слоя строятся каждый кадр по видимому куску мира.
//   * земля — паттерн из бесшовной текстуры, он сам прокручивается вместе
//     с камерой, потому что рисуется в мировых координатах;
//   * декорации — детерминированный «шум» по индексам клетки (тот же приём,
//     что в Renderer.drawMyceliumVeins): пень или телега всегда оказываются
//     в одном и том же месте мира, сколько бы раз игрок туда ни вернулся.
//
// Биом меняется по номеру волны и перекрашивает всю арену целиком.
export class MapSystem {
  constructor(){ this.patternKey=null; this.pattern=null; this.tick=0; }

  update(){ this.tick++; }

  biome(wave){
    const list=CONFIG.map.biomes;
    return list[Math.floor((wave-1)/CONFIG.map.wavesPerBiome)%list.length];
  }

  // --- мировой слой ---------------------------------------------------
  drawGround(renderer,wave){
    const c=renderer.camera, ctx=renderer.ctx;
    const biome=this.biome(wave);
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
    // Масштабируем холст, чтобы тайл лёг нужного размера; координаты делим
    // на тот же множитель — на экране позиция не съезжает.
    const s=CONFIG.map.tileSize/img.width;
    ctx.save();
    ctx.scale(s,s);
    ctx.fillStyle=this.pattern;
    // запас в пиксель по краям: камера сдвигается на округлённые значения
    ctx.fillRect((c.x-1)/s,(c.y-1)/s,(c.w+2)/s,(c.h+2)/s);
    ctx.restore();
    ctx.fillStyle=biome.tint;
    ctx.fillRect(c.x-1,c.y-1,c.w+2,c.h+2);
  }

  // Декорации видимых клеток, отсортированные по Y: дальние рисуются первыми
  visibleProps(camera){
    const M=CONFIG.map, types=Object.keys(M.props), cell=M.decorCell, out=[];
    const gx0=Math.floor((camera.x-cell)/cell), gx1=Math.floor((camera.x+camera.w)/cell);
    const gy0=Math.floor((camera.y-cell)/cell), gy1=Math.floor((camera.y+camera.h)/cell);
    for(let gx=gx0;gx<=gx1;gx++){
      for(let gy=gy0;gy<=gy1;gy++){
        const h=(gx*73856093^gy*19349663)>>>0;
        if((h%1000)/1000>M.decorChance) continue;
        const def=M.props[types[(h>>>9)%types.length]];
        const x=gx*cell+(h>>>3)%cell, y=gy*cell+(h>>>13)%cell;
        // вокруг точки старта декораций нет — иначе игрок появляется в телеге
        if(Math.hypot(x,y)<M.decorClearRadius) continue;
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
    if(!renderer.camera) return;
    for(const d of this.visibleProps(renderer.camera)){
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
}
