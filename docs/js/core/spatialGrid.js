// Разбиение пространства на клетки для поиска соседей.
//
// Проверка попаданий перебирала всех врагов для каждого снаряда, и то же
// делал цепной взрыв для каждой смерти. При десятке врагов это незаметно,
// но игра целится в сотни одновременно — там перебор пар начинает съедать
// кадр. Сетка строится заново каждый шаг (враги всё равно все двигаются)
// и отвечает на «кто рядом с точкой» за счёт обхода нескольких клеток.

export class SpatialGrid {
  constructor(cellSize=96){
    this.cell=cellSize;
    this.buckets=new Map();
  }

  clear(){ this.buckets.clear(); }

  _key(cx,cy){ return cx*73856093^cy*19349663; }

  insert(e){
    const cx=Math.floor(e.x/this.cell), cy=Math.floor(e.y/this.cell);
    const k=this._key(cx,cy);
    let b=this.buckets.get(k);
    if(!b){ b=[]; this.buckets.set(k,b); }
    b.push(e);
  }

  rebuild(entities){
    this.clear();
    for(const e of entities){ if(!e.dead) this.insert(e); }
  }

  // Все сущности в клетках, пересекающих круг (x,y,r).
  // Возвращает кандидатов — точную дистанцию проверяет вызывающий код.
  query(x,y,r,out=[]){
    out.length=0;
    const c=this.cell;
    const x0=Math.floor((x-r)/c), x1=Math.floor((x+r)/c);
    const y0=Math.floor((y-r)/c), y1=Math.floor((y+r)/c);
    for(let cx=x0;cx<=x1;cx++){
      for(let cy=y0;cy<=y1;cy++){
        const b=this.buckets.get(this._key(cx,cy));
        if(b) for(const e of b) out.push(e);
      }
    }
    return out;
  }
}
