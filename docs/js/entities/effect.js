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
