// Анимация спрайт-листов — один источник правды для врагов и боссов.
//
// Лист описывается в config.js полем sprite:
//   key        — ключ в CONFIG.assets.images (НЕ путь к файлу)
//   frame      — сторона кадра в пикселях (кадры квадратные)
//   cols, rows — размер сетки листа
//   display    — во сколько пикселей рисовать на экране
//   animSpeed  — кадров игры на один кадр анимации
// и одним из способов выбора ряда:
//   row + mirror — фиксированный ряд, зеркалится по направлению движения
//   dirRows      — {up,right,down,left}: свой ряд на каждое направление
//   phaseRows    — ряд выбирается снаружи (например по остатку HP босса)

export function dirFromAngle(angle){
  // 0 — вправо, ось Y направлена вниз
  if(angle>=-Math.PI/4 && angle<Math.PI/4) return "right";
  if(angle>=Math.PI/4 && angle<3*Math.PI/4) return "down";
  if(angle>=-3*Math.PI/4 && angle<-Math.PI/4) return "up";
  return "left";
}

export class SpriteAnim {
  constructor(def){
    this.def=def||null;
    this.frame=0; this.timer=0;
    this.row=def?.row||0; this.flip=false;
  }

  // angle — куда смотрит существо, phase — ряд, если лист устроен по фазам
  step(angle=0,playing=true,phase=null){
    const d=this.def; if(!d) return;
    if(playing){
      this.timer++;
      if(this.timer>=(d.animSpeed||8)){ this.timer=0; this.frame=(this.frame+1)%d.cols; }
    }
    if(d.dirRows){
      this.row=d.dirRows[dirFromAngle(angle)]??0; this.flip=false;
    } else if(d.phaseRows && phase!==null){
      this.row=Math.max(0,Math.min(d.rows-1,phase)); this.flip=false;
    } else {
      this.row=d.row||0;
      this.flip=d.mirror ? Math.cos(angle)<0 : false;
    }
  }

  // Есть ли чем рисовать — чтобы решить это ДО отрисовки подложки
  ready(renderer){ return !!(this.def && renderer.loader?.getImage(this.def.key)); }

  // Возвращает false, если рисовать нечем — вызывающий код обязан
  // отрисовать запасной вариант, иначе существо станет невидимым.
  draw(renderer,x,y){
    const d=this.def; if(!d) return false;
    const img=renderer.loader?.getImage(d.key);
    if(!img) return false;
    renderer.drawSpriteSheet(img,x,y,d.frame,d.frame,this.frame,this.row,d.display,0,this.flip);
    return true;
  }

  // Тот же кадр силуэтом — вспышка от попадания поверх спрайта
  flash(renderer,x,y,alpha,color="#ffffff"){
    const d=this.def; if(!d) return false;
    const img=renderer.loader?.getImage(d.key);
    if(!img) return false;
    renderer.drawFlash(img,d.key,x,y,d.frame,d.frame,this.frame,this.row,d.display,this.flip,alpha,color);
    return true;
  }
}
