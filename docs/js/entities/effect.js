// Одноразовая анимация в мировой точке: взрыв склянки, вспышка.
// Проигрывается один раз и удаляется.
export class Effect {
  constructor(x,y,def){
    this.x=x; this.y=y; this.def=def;
    this.frame=0; this.timer=0; this.done=false;
  }

  update(){
    if(this.done) return;
    this.timer++;
    if(this.timer<(this.def.speed||4)) return;
    this.timer=0; this.frame++;
    if(this.frame>=this.def.cols) this.done=true;
  }

  draw(renderer){
    if(this.done) return;
    const img=renderer.loader?.getImage(this.def.key);
    if(!img) return;
    renderer.drawSpriteSheet(img,this.x,this.y,this.def.frame,this.def.frame,
                            this.frame,0,this.def.display);
  }
}

// НАРИСОВАННАЯ СМЕРТЬ. Лист из нескольких кадров, который проигрывается один
// раз на месте убитого: враг оседает и рассыпается спорами.
//
// Зачем отдельный класс, если рядом есть Effect. У Effect кадр всегда первый
// ряд и никакого зеркала: он рисует взрывы, а им направление безразлично.
// Смерти оно небезразлично — волк, умерший мордой влево, не должен на
// последнем кадре развернуться вправо.
//
// Листа может не быть: смерти рисуются по одному врагу за раз, и пока файла
// нет, бой обязан идти как шёл. Поэтому DeathAnim создаётся ТОЛЬКО когда
// картинка уже загружена (проверка в BattleSystem.killEnemy), а иначе смерть
// по-прежнему собирает Dissolve.
export class DeathAnim {
  // flip — куда смотрел враг в момент смерти. Лист рисуется в одну сторону и
  // зеркалится, как лист смерти алхимика: четыре направления на смерть — это
  // вчетверо больше генераций ради кадра, который живёт полсекунды.
  constructor(def,x,y,flip=false){
    this.def=def; this.x=x; this.y=y; this.flip=flip;
    this.frame=0; this.timer=0; this.t=0; this.done=false;
    const cols=def.cols||4;
    this.life=cols*(def.animSpeed||6)+(def.hold||10);
    this.fadeFrom=cols*(def.animSpeed||6);
  }

  update(){
    if(this.done) return;
    this.t++;
    if(++this.timer>=(this.def.animSpeed||6)){
      this.timer=0;
      // На последнем кадре останавливаемся и гаснем: зацикливать смерть,
      // пока по ней бегают живые, было бы странно
      if(this.frame<(this.def.cols||4)-1) this.frame++;
    }
    if(this.t>=this.life) this.done=true;
  }

  draw(renderer){
    if(this.done) return;
    const img=renderer.loader?.getImage(this.def.key);
    if(!img){ this.done=true; return; }
    const ctx=renderer.ctx;
    // Гаснет только хвост, сама анимация идёт в полную силу: если начать
    // гасить с первого кадра, нарисованную смерть снова никто не увидит
    const fade=this.t>this.fadeFrom
      ? 1-(this.t-this.fadeFrom)/Math.max(1,this.life-this.fadeFrom) : 1;
    ctx.save(); ctx.globalAlpha=fade;
    renderer.drawSpriteSheet(img,this.x,this.y,this.def.frame,this.def.frame,
                             this.frame,0,this.def.display,0,this.flip);
    ctx.restore();
  }
}

// РАСТВОРЕНИЕ ВРАГА — ЗАПАСНОЙ ВАРИАНТ, пока нет листа смерти.
//
// Раньше убитый исчезал в тот же кадр, в котором кончалось его HP: на экране
// просто пропадала фигура, а от смерти оставались только разлетающиеся точки.
// Это и читалось как «топорно» — событие есть, а картинки у события нет.
//
// Смерть здесь собирается из того кадра, на котором врага застали: он
// всплывает, раздувается, вспыхивает своим цветом и тает. Работает сносно, но
// это единственное место, где движок изображает то, чего в ассетах нет вовсе.
// У кого лист смерти появился — тот идёт через DeathAnim выше.
export class Dissolve {
  // anim — SpriteAnim убитого: берём из него ПОЗУ, а не саму анимацию,
  // потому что после смерти шагать уже некуда
  constructor(anim,x,y,color="#c58cff",life=20){
    this.def=anim.def; this.frame=anim.frame; this.row=anim.row; this.flip=anim.flip;
    this.x=x; this.y=y; this.color=color;
    this.t=0; this.life=life; this.done=!this.def;
  }

  update(){ if(!this.done&&++this.t>=this.life) this.done=true; }

  draw(renderer){
    if(this.done) return;
    const img=renderer.loader?.getImage(this.def.key);
    if(!img){ this.done=true; return; }
    const k=this.t/this.life;
    const size=this.def.display*(1+k*0.3);
    const y=this.y-k*14;
    const ctx=renderer.ctx;
    ctx.save();
    ctx.globalAlpha=(1-k)*0.85;
    renderer.drawSpriteSheet(img,this.x,y,this.def.frame,this.def.frame,
                             this.frame,this.row,size,0,this.flip);
    ctx.restore();
    // Поверх — тот же силуэт цветом типа: тело будто выгорает спорами
    renderer.drawFlash(img,this.def.key,this.x,y,this.def.frame,this.def.frame,
                       this.frame,this.row,size,this.flip,(1-k)*0.32,this.color);
  }
}
