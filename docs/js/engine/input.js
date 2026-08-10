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
      // Выброс спор. Пробел, потому что это единственное активное действие в
      // игре: стрельба здесь сама, прицел на мобильных тоже сам. Повтор от
      // зажатой клавиши (e.repeat) отсекаем здесь, а не перезарядкой: иначе
      // удержание пробела опустошало бы шкалу тремя выбросами подряд, и
      // «трата ресурса» превращалась бы в «слив по ошибке».
      if((k===" "||k==="spacebar")&&!e.repeat){ e.preventDefault(); this.onBurstPress?.(); }
      // Прокачка. Меню больше не открывается само в момент уровня — момент
      // выбирает игрок, и «E» это его вторая дверь после кнопки в углу.
      // Повтор от зажатой клавиши отсекаем: меню и так остановит мир, а
      // второе нажатие поверх открытого меню ничего не значит.
      if(k==="e"&&!e.repeat){ e.preventDefault(); this.onUpgradePress?.(); }
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

    // TOUCH. Джойстик появляется ТАМ, ГДЕ ПАЛЕЦ КОСНУЛСЯ ЭКРАНА, в любой его
    // точке. Раньше он ловил касания только на левой половине холста, и
    // правая половина не делала вообще ничего: стрельба здесь автоматическая,
    // прицел на мобильных тоже автоматический, — то есть пол-экрана было
    // мёртвой зоной, а играть приходилось одной рукой в одном углу.
    //
    // Отслеживаем КОНКРЕТНЫЙ палец по identifier: иначе второе касание
    // (например, случайное касание ладонью) перехватывало управление.
    this.touchId=null;
    const at=(t)=>{
      const rect=canvas.getBoundingClientRect();
      const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
      return { x:(t.clientX-rect.left)*sx, y:(t.clientY-rect.top)*sy };
    };
    canvas.addEventListener("touchstart",(e)=>{
      e.preventDefault();
      if(this.touchId!==null) return;
      const t=e.changedTouches[0];
      if(!t) return;
      const p=at(t);
      this.touchId=t.identifier;
      this.joystick.active=true;
      this.joystick.cx=p.x; this.joystick.cy=p.y;
      this.joystick.dx=0; this.joystick.dy=0;
    },{passive:false});
    canvas.addEventListener("touchmove",(e)=>{
      e.preventDefault();
      for(const t of e.changedTouches){
        if(t.identifier!==this.touchId) continue;
        const p=at(t);
        const dx=p.x-this.joystick.cx, dy=p.y-this.joystick.cy;
        const dist=Math.hypot(dx,dy);
        const max=this.joystick.radius;
        // БАЗА СТОИТ ТАМ, ГДЕ КОСНУЛСЯ ПАЛЕЦ, и больше не двигается. Раньше
        // она ехала за пальцем, если он уходил дальше кольца, — джойстик
        // расползался по всему экрану и терялся из виду. Теперь уехал палец
        // далеко — ручка просто упирается в край кольца, а направление
        // считается от неподвижного центра.
        if(dist>max){ this.joystick.dx=dx/dist*max; this.joystick.dy=dy/dist*max; }
        else { this.joystick.dx=dx; this.joystick.dy=dy; }
        // Порог в долях радиуса, а не в пикселях: холст теперь любого размера,
        // и фиксированные 10 пикселей на плотном экране — это «не шевелится»
        const dead=max*0.2;
        this.keys.w=this.joystick.dy<-dead;
        this.keys.s=this.joystick.dy>dead;
        this.keys.a=this.joystick.dx<-dead;
        this.keys.d=this.joystick.dx>dead;
      }
    },{passive:false});
    const endTouch=(e)=>{
      for(const t of e.changedTouches){
        if(t.identifier!==this.touchId) continue;
        this.touchId=null;
        this.joystick.active=false;
        this.joystick.dx=0; this.joystick.dy=0;
        this.keys.w=this.keys.a=this.keys.s=this.keys.d=false;
      }
    };
    canvas.addEventListener("touchend",(e)=>{ e.preventDefault(); endTouch(e); },{passive:false});
    canvas.addEventListener("touchcancel",endTouch);
  }

  // Джойстик рисуется в пикселях холста, а холст на телефоне другого размера,
  // чем на мониторе. Без пересчёта кольцо в 50 пикселей на плотном экране
  // превращается в еле заметную точку под пальцем.
  scaleTo(canvasW,canvasH){
    const k=Math.min(2.2,Math.max(0.7,Math.hypot(canvasW,canvasH)/Math.hypot(900,700)));
    this.joystick.radius=Math.round(56*k);
    this.joystick.stickRadius=Math.round(24*k);
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