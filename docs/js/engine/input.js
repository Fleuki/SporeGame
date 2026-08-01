export class InputManager {
  constructor(canvas){
    this.keys={w:false,a:false,s:false,d:false};
    this.mouse={x:0,y:0};
    this.canvas=canvas;
    this.isMobile="ontouchstart" in window || navigator.maxTouchPoints>0;
    this.joystick={active:false,cx:0,cy:0,dx:0,dy:0,radius:50,stickRadius:22};
    this.autoAim=true; // на мобильных авто-прицел

    // Клавиатура
    document.addEventListener("keydown",(e)=>{
      const k=e.key.toLowerCase();
      if(k in this.keys){ this.keys[k]=true; e.preventDefault(); }
      if(k==="m") this.onMutePress?.();
      if(k==="r") this.onRestartPress?.();
      if(k==="escape") this.onPausePress?.();
    });
    document.addEventListener("keyup",(e)=>{
      const k=e.key.toLowerCase();
      if(k in this.keys){ this.keys[k]=false; e.preventDefault(); }
    });
    canvas.addEventListener("mousemove",(e)=>{
      const rect=canvas.getBoundingClientRect();
      const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
      this.mouse.x=Math.max(0,Math.min(canvas.width,(e.clientX-rect.left)*sx));
      this.mouse.y=Math.max(0,Math.min(canvas.height,(e.clientY-rect.top)*sy));
    });
    canvas.addEventListener("contextmenu",(e)=>e.preventDefault());

    // Touch: виртуальный джойстик (левая половина)
    canvas.addEventListener("touchstart",(e)=>{
      e.preventDefault();
      for(const t of e.changedTouches){
        const rect=canvas.getBoundingClientRect();
        const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
        const tx=(t.clientX-rect.left)*sx, ty=(t.clientY-rect.top)*sy;
        if(tx<canvas.width*0.5){
          this.joystick.active=true;
          this.joystick.cx=tx; this.joystick.cy=ty;
          this.joystick.dx=0; this.joystick.dy=0;
        }
      }
    },{passive:false});
    canvas.addEventListener("touchmove",(e)=>{
      e.preventDefault();
      for(const t of e.changedTouches){
        const rect=canvas.getBoundingClientRect();
        const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
        const tx=(t.clientX-rect.left)*sx, ty=(t.clientY-rect.top)*sy;
        if(this.joystick.active){
          const dx=tx-this.joystick.cx, dy=ty-this.joystick.cy;
          const dist=Math.hypot(dx,dy);
          const max=this.joystick.radius;
          if(dist>max){ this.joystick.dx=dx/dist*max; this.joystick.dy=dy/dist*max; }
          else { this.joystick.dx=dx; this.joystick.dy=dy; }
          // Преобразуем в WASD
          this.keys.w=this.joystick.dy<-10;
          this.keys.s=this.joystick.dy>10;
          this.keys.a=this.joystick.dx<-10;
          this.keys.d=this.joystick.dx>10;
        }
      }
    },{passive:false});
    canvas.addEventListener("touchend",(e)=>{
      e.preventDefault();
      this.joystick.active=false;
      this.joystick.dx=0; this.joystick.dy=0;
      this.keys.w=this.keys.a=this.keys.s=this.keys.d=false;
    },{passive:false});
    canvas.addEventListener("touchcancel",(e)=>{
      this.joystick.active=false;
      this.joystick.dx=0; this.joystick.dy=0;
      this.keys.w=this.keys.a=this.keys.s=this.keys.d=false;
    });
  }

  // Для авто-прицеливания на мобильных
  getAutoAimAngle(player,enemies){
    if(!this.isMobile || enemies.length===0) return null;
    let nearest=null, bestD=99999;
    for(const e of enemies){ if(!e.dead){ const d=Math.hypot(e.x-player.x,e.y-player.y); if(d<bestD){bestD=d; nearest=e;} } }
    if(nearest) return Math.atan2(nearest.y-player.y,nearest.x-player.x);
    return null;
  }

  drawJoystick(renderer){
    if(!this.isMobile || !this.joystick.active) return;
    const j=this.joystick;
    renderer.ctx.globalAlpha=0.4;
    renderer.drawCircle(j.cx,j.cy,j.radius,"rgba(100,100,100,0.3)","#666",2);
    renderer.drawCircle(j.cx+j.dx,j.cy+j.dy,j.stickRadius,"rgba(0,212,170,0.6)","#00d4aa",2);
    renderer.ctx.globalAlpha=1;
  }
}