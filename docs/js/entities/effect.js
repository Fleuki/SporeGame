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

// РАСТВОРЕНИЕ ВРАГА. Раньше убитый исчезал в тот же кадр, в котором кончалось
// его HP: на экране просто пропадала фигура, а от смерти оставались только
// разлетающиеся точки. Это и читалось как «топорно» — событие есть, а
// картинки у события нет.
//
// Отдельного листа смерти у врагов нет, и рисовать его неоткуда, поэтому
// смерть собирается из того кадра, на котором врага застали: он всплывает,
// раздувается, вспыхивает своим цветом и тает. Двадцать кадров — ровно
// столько, чтобы глаз успел заметить, кто именно умер, и не дольше.
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
