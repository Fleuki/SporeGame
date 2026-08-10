import { CONFIG } from "../config.js";
import { WORLD } from "../core/camera.js";

// Детерминированный «шум» по паре целых координат. Один и тот же участок мира
// обязан выглядеть одинаково, сколько бы раз игрок туда ни вернулся, поэтому
// ни один слой земли не имеет права звать Math.random().
//
// Мультипликативное перемешивание после xor обязательно: без него соседние
// клетки дают близкие хеши, и «случайный» разворот тайлов ложится ровными
// диагональными полосами — то есть сеткой, только косой.
function hash2(x,y){
  let h=(Math.round(x)*73856093)^(Math.round(y)*19349663);
  h=Math.imul(h^(h>>>15),2246822519);
  h=Math.imul(h^(h>>>13),3266489917);
  return (h^(h>>>16))>>>0;
}

// Тот же цвет, но полностью прозрачный: "rgba(120,255,180,0.10)" →
// "rgba(120,255,180,0)". Нужно градиентам — стоп с "rgba(0,0,0,0)" на конце
// тянет цвет через чёрный, и по краю пятна проступает грязная кайма.
function fadeOut(color){
  const m=/^rgba?\(([^)]+)\)$/.exec(String(color).trim());
  if(!m) return "rgba(0,0,0,0)";
  const [r,g,b]=m[1].split(",");
  return `rgba(${r},${g},${b},0)`;
}

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
    const b=list[Math.floor(Math.max(0,runTime)/CONFIG.map.secondsPerBiome)%list.length];
    // Землю рисуют по времени забега, а темноту и её цвет — уже в экранном
    // слое, куда runTime не доходит. Запоминаем биом здесь, а не таскаем
    // время через полкадра: drawGround всё равно идёт первым в каждом кадре.
    this.cur=b;
    return b;
  }

  // --- мировой слой ---------------------------------------------------
  // ЗЕМЛЯ. Раньше это был один createPattern("repeat") на всю арену: одна и
  // та же картинка, приклеенная к сетке 200x200 без единого отличия. Глаз
  // ловит такую сетку мгновенно — «одна земля на всю карту с одинаковыми
  // вырезами». Хуже того, все узнаваемые детали текстуры (пятна мха, камни)
  // повторялись строго через 200 пикселей, и по ним было видно шаг сетки.
  //
  // Теперь земля собирается из трёх слоёв, и ни один не требует новых картинок:
  //   1. сам тайл, но каждая клетка ОТРАЖЕНА и ПОВЁРНУТА по своему хешу —
  //      одна текстура даёт восемь разных клеток, и сетка перестаёт читаться;
  //   2. пятна соседнего биома — большие мягкие кляксы, из-за которых у
  //      арены появляются места: мшистая низина, выжженная проплешина;
  //   3. мелочь под ногами — камешки, трещины, споровая крошка, тропинки.
  // Всё привязано к координатам мира через хеш клетки, поэтому одно и то же
  // место выглядит одинаково, сколько бы раз игрок туда ни вернулся.
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
    // ЗЕМЛЯ РИСУЕТСЯ НЕ КАЖДЫЙ КАДР. Все её слои детерминированы координатами
    // мира: тайлы, пятна, тропы и рельеф в одном и том же месте выглядят
    // одинаково всегда. Значит кадр за кадром пересчитывались одни и те же
    // десятки градиентов и сотни поворотов тайла — только ради того, что
    // сдвинулось на три пикселя. Теперь кусок земли с запасом по краям
    // собирается в отдельный холст и просто кладётся на кадр, а пересобирается
    // лишь когда камера выходит за этот запас или меняется биом.
    const layer=this.groundLayer(renderer,biome,img,c);
    if(layer) ctx.drawImage(layer.canvas,layer.x,layer.y,layer.w,layer.h);
    else this.paintGround(ctx,renderer,biome,img,c.x-1,c.y-1,c.w+2,c.h+2);
  }

  // Слои земли внутри прямоугольника мира. ctx может быть как кадром, так и
  // холстом кэша — отсюда и параметры вместо камеры: рисуемый кусок больше
  // видимого, и брать границы у камеры уже нельзя.
  paintGround(ctx,renderer,biome,img,rx,ry,rw,rh){
    // Земля есть только внутри арены — за границей пустота
    const x0=Math.max(rx,WORLD.minX), y0=Math.max(ry,WORLD.minY);
    const x1=Math.min(rx+rw,WORLD.maxX), y1=Math.min(ry+rh,WORLD.maxY);
    ctx.fillStyle=CONFIG.world.voidColor;
    ctx.fillRect(rx,ry,rw,rh);
    if(x1<=x0||y1<=y0) return;

    ctx.save();
    ctx.beginPath(); ctx.rect(x0,y0,x1-x0,y1-y0); ctx.clip();
    this.drawTiles(ctx,img,x0,y0,x1,y1);
    this.drawPatches(renderer,ctx,biome,x0,y0,x1,y1);
    this.drawTrails(ctx,x0,y0,x1,y1);
    this.drawMottle(ctx,x0,y0,x1,y1);
    ctx.restore();

    // Тинт кладётся ПОВЕРХ всех слоёв земли, включая тропы. Иначе тропа
    // рисуется по уже затемнённой земле и выглядит бежевой наклейкой, а не
    // протоптанным местом.
    ctx.fillStyle=biome.tint;
    ctx.fillRect(x0,y0,x1-x0,y1-y0);
  }

  // Готовый кусок земли с запасом по краям. Возвращает null, если кэш
  // почему-то не собрался — тогда земля рисуется по-старому, прямо в кадр.
  //
  // Начало куска ОКРУГЛЯЕТСЯ до целого экранного пикселя тем же способом, что
  // и сдвиг камеры (`Camera.begin`). Без этого готовый холст ложился бы на
  // дробное смещение, и вся земля подрагивала бы на пиксель при каждом шаге —
  // ровно то дрожание пиксель-арта, ради которого камера и округляется.
  groundLayer(renderer,biome,img,c){
    const pad=CONFIG.map.groundPad;
    if(!(pad>0)) return null;
    const zoom=c.zoom;
    const w=c.w*(1+pad*2), h=c.h*(1+pad*2);
    const g=this._ground;
    const inside=g&&g.biome===biome&&g.zoom===zoom&&g.w===w&&g.h===h
      &&c.x>=g.x&&c.y>=g.y&&c.x+c.w<=g.x+g.w&&c.y+c.h<=g.y+g.h;
    if(inside) return g;

    const pw=Math.ceil(w*zoom), ph=Math.ceil(h*zoom);
    if(!(pw>0)||!(ph>0)) return null;
    let cv=g&&g.canvas;
    if(!cv||cv.width!==pw||cv.height!==ph){
      cv=document.createElement("canvas");
      cv.width=pw; cv.height=ph;
    }
    // Камера смотрит в середину куска: уйдя в любую сторону, игрок получает
    // полный запас, а не половину его с одного бока
    const x=Math.round((c.x-c.w*pad)*zoom)/zoom;
    const y=Math.round((c.y-c.h*pad)*zoom)/zoom;
    const gc=cv.getContext("2d");
    gc.setTransform(1,0,0,1,0,0);
    gc.clearRect(0,0,pw,ph);
    gc.imageSmoothingEnabled=false;
    gc.setTransform(zoom,0,0,zoom,-x*zoom,-y*zoom);
    this.paintGround(gc,renderer,biome,img,x,y,w,h);
    gc.setTransform(1,0,0,1,0,0);
    this._ground={canvas:cv,x,y,w,h,zoom,biome};
    return this._ground;
  }

  // Слой 1. Тайлы с разворотом по хешу клетки.
  //
  // Тайл рисуется на полпикселя внахлёст (OVERLAP): при дробном зуме соседние
  // клетки иначе расходятся на субпиксель, и по стыкам идёт сетка тонких
  // тёмных швов — ровно то, от чего мы уходим.
  drawTiles(ctx,img,x0,y0,x1,y1){
    const T=CONFIG.map.tileSize, OVERLAP=0.75;
    const gx0=Math.floor(x0/T), gx1=Math.floor((x1-0.001)/T);
    const gy0=Math.floor(y0/T), gy1=Math.floor((y1-0.001)/T);
    for(let gx=gx0;gx<=gx1;gx++){
      for(let gy=gy0;gy<=gy1;gy++){
        const h=hash2(gx,gy);
        ctx.save();
        ctx.translate(gx*T+T/2,gy*T+T/2);
        // Поворот кратно 90° и отражение: восемь вариантов из одной картинки.
        // Текстура земли бесшовная и «без верха», поэтому повороты законны.
        ctx.rotate((h&3)*Math.PI/2);
        if(h&4) ctx.scale(-1,1);
        ctx.drawImage(img,-T/2-OVERLAP,-T/2-OVERLAP,T+OVERLAP*2,T+OVERLAP*2);
        ctx.restore();
      }
    }
  }

  // Слой 2. Пятна соседнего биома — чтобы у арены были МЕСТА, а не ровное
  // покрытие. Пятно рисуется текстурой другого биома через мягкую круглую
  // маску, поэтому у него нет ни контура, ни узнаваемой формы.
  drawPatches(renderer,ctx,biome,x0,y0,x1,y1){
    const M=CONFIG.map, P=M.patch;
    if(!P||P.chance<=0) return;
    const list=M.biomes, cell=P.cell;
    const other=list[(list.indexOf(biome)+P.from)%list.length];
    const img=renderer.loader?.getImage(other.tile);
    if(!img||!img.width) return;
    const gx0=Math.floor((x0-cell)/cell), gx1=Math.floor(x1/cell);
    const gy0=Math.floor((y0-cell)/cell), gy1=Math.floor(y1/cell);
    for(let gx=gx0;gx<=gx1;gx++){
      for(let gy=gy0;gy<=gy1;gy++){
        const h=hash2(gx+7001,gy-3301);
        if((h%1000)/1000>P.chance) continue;
        const cx=gx*cell+(h>>>3)%cell, cy=gy*cell+(h>>>11)%cell;
        const r=P.radius*(0.6+((h>>>19)%100)/125);
        if(cx+r<x0||cx-r>x1||cy+r<y0||cy-r>y1) continue;
        // Пятно уже готово с растушёванным краем — просто кладём сверху
        const layer=this.patchLayer(img,r,h);
        if(layer) ctx.drawImage(layer,cx-r,cy-r,r*2,r*2);
      }
    }
  }

  // Готовый кружок текстуры с растушёванным краем. Считается один раз на
  // размер и кладётся в кэш: собирать маску каждый кадр для каждого пятна —
  // это десятки градиентов и композитных операций в кадре.
  patchLayer(img,r,h){
    const P=CONFIG.map.patch;
    const key=img.src+"|"+Math.round(r)+"|"+(h&7);
    if(!this._patchCache) this._patchCache=new Map();
    let cv=this._patchCache.get(key);
    if(cv) return cv;
    if(this._patchCache.size>48) this._patchCache.clear();
    const size=Math.max(8,Math.round(r*2));
    cv=document.createElement("canvas");
    cv.width=cv.height=size;
    const g2=cv.getContext("2d");
    const T=CONFIG.map.tileSize;
    g2.save();
    g2.translate(size/2,size/2);
    g2.rotate((h&3)*Math.PI/2);
    const n=Math.ceil(size/T)+1;
    for(let i=-n;i<=n;i++)
      for(let j=-n;j<=n;j++)
        g2.drawImage(img,i*T-T/2,j*T-T/2,T+1,T+1);
    g2.restore();
    // Растушёвка края
    g2.globalCompositeOperation="destination-in";
    const g=g2.createRadialGradient(size/2,size/2,size*0.08,size/2,size/2,size/2);
    g.addColorStop(0,`rgba(0,0,0,${P.alpha})`);
    g.addColorStop(0.6,`rgba(0,0,0,${P.alpha*0.6})`);
    g.addColorStop(1,"rgba(0,0,0,0)");
    g2.fillStyle=g;
    g2.fillRect(0,0,size,size);
    this._patchCache.set(key,cv);
    return cv;
  }

  // Слой 3. КРУПНЫЕ ПЯТНА СВЕТА И ТЕНИ. Земля здесь нарисована очень плотно —
  // мох, грибы, жилы мицелия в каждом пикселе, — и мелкая процедурная крошка
  // (камешки, трещины, споровая пыль) на ней не читается вообще: пробовал,
  // на скриншоте её не видно даже без темноты и тинта. Поэтому разнообразие
  // добавляется на масштабе БОЛЬШЕ, чем детали самой текстуры: медленные
  // светлые и тёмные пятна размером в пол-экрана. Они дают ощущение рельефа —
  // низина, пригорок, — и стоят по паре градиентов на кадр.
  drawMottle(ctx,x0,y0,x1,y1){
    const M=CONFIG.map.mottle;
    if(!M||M.cell<=0) return;
    const cell=M.cell;
    const gx0=Math.floor((x0-cell)/cell), gx1=Math.floor(x1/cell);
    const gy0=Math.floor((y0-cell)/cell), gy1=Math.floor(y1/cell);
    ctx.save();
    for(let gx=gx0;gx<=gx1;gx++){
      for(let gy=gy0;gy<=gy1;gy++){
        const h=hash2(gx+4409,gy-8821);
        const cx=gx*cell+(h>>>3)%cell, cy=gy*cell+(h>>>13)%cell;
        const r=M.radius*(0.55+((h>>>21)%100)/110);
        if(cx+r<x0||cx-r>x1||cy+r<y0||cy-r>y1) continue;
        const dark=(h&1)===0;
        const a=M.alpha*(0.5+((h>>>7)%100)/200);
        const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
        g.addColorStop(0,(dark?M.darkColor:M.lightColor).replace("$A",a.toFixed(3)));
        g.addColorStop(1,(dark?M.darkColor:M.lightColor).replace("$A","0"));
        ctx.fillStyle=g;
        ctx.fillRect(cx-r,cy-r,r*2,r*2);
      }
    }
    ctx.restore();
  }

  // ТРОПИНКИ. Несколько длинных протоптанных полос через всю арену: они
  // задают направление и не дают земле выглядеть равномерным ковром. Мир
  // конечный, поэтому маршруты считаются ОДИН раз и потом только рисуются.
  trails(){
    if(this._trails) return this._trails;
    const T=CONFIG.map.trail, out=[];
    if(!T||T.count<=0){ this._trails=out; return out; }
    for(let i=0;i<T.count;i++){
      const h=hash2(i*7919,i*104729);
      // Старт у случайного края, дальше — случайное блуждание поперёк арены
      const vertical=(h&1)===1;
      let x=vertical?WORLD.minX+(h>>>3)%CONFIG.world.width:WORLD.minX-40;
      let y=vertical?WORLD.minY-40:WORLD.minY+(h>>>3)%CONFIG.world.height;
      let a=vertical?Math.PI/2:0;
      const pts=[[x,y]];
      const steps=Math.ceil((vertical?CONFIG.world.height:CONFIG.world.width)/T.step)+2;
      for(let s=0;s<steps;s++){
        const hh=hash2(i*131+s,s*977);
        a+=((hh%100)/100-0.5)*T.wander;
        x+=Math.cos(a)*T.step; y+=Math.sin(a)*T.step;
        pts.push([x,y]);
      }
      // Габариты маршрута считаем сразу: проверять их в каждом кадре по всем
      // точкам — это тысячи сравнений на ровном месте
      let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
      for(const [px,py] of pts){
        if(px<minX) minX=px; if(px>maxX) maxX=px;
        if(py<minY) minY=py; if(py>maxY) maxY=py;
      }
      const width=T.width*(0.7+((h>>>13)%100)/160);
      out.push({ pts, width,
                 minX:minX-width, maxX:maxX+width,
                 minY:minY-width, maxY:maxY+width });
    }
    this._trails=out;
    return out;
  }

  // Рисуется как слой ЗЕМЛИ, до тинта: тропа поверх затемнения выглядит
  // бежевой полосой, наклеенной сверху, а под ним — вытоптанной землёй.
  drawTrails(ctx,x0,y0,x1,y1){
    const T=CONFIG.map.trail;
    if(!T||T.count<=0) return;
    ctx.save();
    ctx.lineCap="round"; ctx.lineJoin="round";
    for(const tr of this.trails()){
      // Грубая отбраковка: маршрут тянется через всю арену, а в кадр попадает
      // от силы пара его звеньев
      if(tr.maxX<x0||tr.minX>x1||tr.maxY<y0||tr.minY>y1) continue;
      // Три обводки одна в другой: широкая размытая «утоптанность», полоса
      // плотнее и узкая тёмная колея. Одна линия читается как нарисованная
      // мазком, три — как место, по которому ходят.
      for(const [k,color] of [[1,T.color],[0.62,T.color],[0.22,T.coreColor]]){
        ctx.strokeStyle=color;
        ctx.lineWidth=tr.width*k;
        ctx.beginPath();
        ctx.moveTo(tr.pts[0][0],tr.pts[0][1]);
        for(let i=1;i<tr.pts.length;i++) ctx.lineTo(tr.pts[i][0],tr.pts[i][1]);
        ctx.stroke();
      }
    }
    ctx.restore();
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

  // ДЕКОРАЦИИ РИСУЮТСЯ НЕ ОДНИМ СЛОЕМ, И ЭТО ГЛАВНОЕ ЗДЕСЬ.
  //
  // Раньше всё дерево целиком лежало ПОД существами: сначала drawDecor, потом
  // враги и игрок. Из-за этого алхимик, зашедший за ствол, оказывался
  // нарисован ПОВЕРХ него — стоял не за деревом, а на дереве. В игре с видом
  // сверху это ломает единственное, чем задаётся объём: кто ближе к камере.
  //
  // Теперь надвое по одному признаку — есть ли у объекта высота:
  //   flat (кислотная лужа) лежит на земле и всегда под всеми, как и было;
  //   стоящие (деревья, телега, камень) отдаются наружу и сортируются
  //   ВМЕСТЕ с врагами и игроком по нижней точке (см. main.draw).
  //
  // Точка сортировки у декорации — её y: drawProp рисует картинку от
  // основания вверх (translate на y-h), то есть y и есть место, где объект
  // касается земли. У существ то же место — их тень.
  standingProps(){ return this.visible.filter(d=>!d.def.flat); }

  drawFlatDecor(renderer){
    for(const d of this.visible) if(d.def.flat) this.drawOneProp(renderer,d);
  }

  drawOneProp(renderer,d){
    const def=d.def;
    const img=renderer.loader?.getImage(def.image);
    if(!img||!img.width) return;
    // у анимированного листа пропорции берутся с одного кадра, а не со всей полосы
    const frameW=def.frames?img.width/def.frames:img.width;
    const frame=def.frames
      ? Math.floor((this.tick/def.animSpeed)+d.phase)%def.frames
      : 0;
    renderer.drawProp(def.image,d.x,d.y,d.w,d.w*img.height/frameW,
      { flip:def.flat?false:d.flip, glow:def.glow, glowBlur:def.glowBlur,
        flat:def.flat, frames:def.frames, frame });
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
  // fogMult — сжатие круга света правилом стычки «Туман» (1 — без изменений).
  // Множитель приходит снаружи, а не берётся из CONFIG: правило живёт ровно
  // один натиск, и записывать его в глобальный конфиг значило бы оставить
  // туман висеть после конца стычки, а то и до следующего забега.
  drawDarkness(renderer,player,fogMult=1){
    const D=CONFIG.map.darkness;
    if(!D||D.strength<=0) return;
    const cam=renderer.camera; if(!cam||!player) return;
    const w=renderer.canvas.width, h=renderer.canvas.height;

    // Слой темноты собирается в ПОЛОВИННОМ разрешении и растягивается на кадр.
    // В нём нет ни одной детали мельче круга света: сплошная заливка и мягкие
    // градиенты, растянуть которые вдвое нельзя заметить даже на скриншоте, —
    // а платился он полным размером холста дважды за кадр (заливка плюс вывод)
    // и был самой дорогой строчкой всей отрисовки. Вчетверо меньше пикселей.
    const s=D.layerScale||1;
    const lw=Math.max(1,Math.round(w*s)), lh=Math.max(1,Math.round(h*s));

    let cv=this._dark;
    if(!cv||cv.width!==lw||cv.height!==lh){
      cv=this._dark=document.createElement("canvas");
      cv.width=lw; cv.height=lh;
      this._darkCtx=cv.getContext("2d");
    }
    const dc=this._darkCtx;
    dc.setTransform(s,0,0,s,0,0);   // рисуем по-прежнему в пикселях КАДРА
    dc.globalCompositeOperation="source-over";
    // Цвет темноты берётся у биома: чёрный везде одинаков, а «зеленовато-
    // чёрный» и «лиловый мрак» различаются даже боковым зрением — именно
    // этим смена биома и становится заметной, не требуя новой земли.
    const biome=this.cur||CONFIG.map.biomes[0];
    dc.fillStyle=biome.veil||"#03060a";
    dc.clearRect(0,0,w,h);
    dc.fillRect(0,0,w,h);

    dc.globalCompositeOperation="destination-out";
    // Радиусы света заданы в ЭКРАННЫХ пикселях эталонного кадра, а холст
    // теперь любой: на телефоне он меньше, на большом мониторе больше.
    // Пересчитываем через зум — тогда круг света всегда накрывает одинаковый
    // кусок МИРА, и «видно на два шага вокруг» не зависит от размера окна.
    const k=cam.zoom/CONFIG.camera.zoom;
    // Круг света дышит — иначе он выглядит трафаретом, приклеенным к игроку
    const pulse=Math.sin(this.tick*D.pulseSpeed)*(D.pulse||0);
    const p=cam.toScreen(player.x,player.y);
    const lightR=(D.playerRadius+pulse)*k*fogMult;
    this.cutLight(dc,p.x,p.y,lightR,D.playerCore);
    for(const d of this.visible){
      if(!d.def.glow) continue;
      const s=cam.toScreen(d.x,d.y-d.w*0.3);
      this.cutLight(dc,s.x,s.y,D.propRadius*(d.w/(d.def.width||d.w))*k,0.15);
    }

    renderer.ctx.save();
    renderer.ctx.globalAlpha=D.strength;
    // Сглаживание включается ровно на эту одну картинку: слой уменьшенный, и
    // без него край круга света пошёл бы ступеньками. Всей остальной игре оно
    // по-прежнему запрещено — пиксель-арт от него мылится.
    renderer.ctx.imageSmoothingEnabled=true;
    renderer.ctx.drawImage(cv,0,0,w,h);
    renderer.ctx.restore();   // restore возвращает и запрет сглаживания

    // Налёт цвета на самом круге света. Темноты биома мало: игрок смотрит в
    // освещённый круг, а он до сих пор был одинаковым во всех четырёх.
    // Кладётся ПОСЛЕ темноты и только внутрь круга — за его краем цвет
    // спорил бы с veil и оба выглядели бы грязью.
    if(biome.light){
      const g=renderer.ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,lightR);
      g.addColorStop(0,biome.light);
      // Прозрачный край — ТОГО ЖЕ цвета: градиент к "rgba(0,0,0,0)"
      // тянется через чёрный и по краю круга даёт грязное кольцо.
      g.addColorStop(1,fadeOut(biome.light));
      renderer.ctx.save();
      renderer.ctx.fillStyle=g;
      renderer.ctx.fillRect(0,0,w,h);
      renderer.ctx.restore();
    }
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
