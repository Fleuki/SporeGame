// Снаряд несёт с собой описание своего оружия (def): по нему боевая
// система знает, какой рисовать спрайт, какой проигрывать взрыв и есть
// ли урон по области при попадании.
//
// mods — модификаторы КОНКРЕТНОГО ствола, из которого он вылетел
// (см. Weapon.mods): радиус взрыва, сила лужи, пробитие, отскоки.
export class Projectile {
  constructor(x,y,angle,damage,def,mods=null){
    this.def=def;
    this.mods=mods||{areaMult:1,dotMult:1,pierce:0,bounces:0};
    this.x=x; this.y=y;
    this.vx=Math.cos(angle)*def.speed; this.vy=Math.sin(angle)*def.speed;
    this.radius=def.radius;
    this.damage=damage; this.life=100;
    this.angle=angle;
    this.pierceLeft=this.mods.pierce;
    this.bouncesLeft=this.mods.bounces;
    // Кого уже задели: без этого прошивающий снаряд бьёт одного и того же
    // врага каждый кадр, пока пролетает сквозь него
    this.hit=new Set();
  }

  update(){ this.x+=this.vx; this.y+=this.vy; this.life--; }

  // Мир не ограничен, поэтому «за экраном» считается относительно камеры
  isOffScreen(camera){ return camera?!camera.sees(this.x,this.y,60):false; }

  draw(renderer){
    const d=this.def;
    const glow=d.glow||"#00d4aa";

    // ШЛЕЙФ. Спрайт склянки на 32 пикселях — нечитаемое пятно, и в бою просто
    // не видно, летит что-то или нет. Хвост из трёх затухающих точек позади
    // снаряда превращает его в движущийся огонёк: направление и скорость
    // считываются мгновенно, даже когда на экране толпа.
    const ctx=renderer.ctx;
    ctx.save();
    for(let i=1;i<=3;i++){
      ctx.globalAlpha=0.30/i;
      renderer.drawCircle(this.x-this.vx*i*0.9, this.y-this.vy*i*0.9,
                          this.radius*(1-i*0.22), glow);
    }
    ctx.restore();
    renderer.drawGlowCircle(this.x,this.y,this.radius*0.9,glow,14);

    const img=renderer.loader?.getImage(d.sprite);
    if(img){
      // Склянка нарисована летящей вправо — вращаем по направлению полёта
      renderer.drawSpriteSheet(img,this.x,this.y,d.frame,d.frame,
                               0,0,d.display,this.angle);
    } else {
      renderer.drawCircle(this.x,this.y,this.radius,"#ffffff");
    }
  }
}

// СНАРЯД ВРАГА. Летит медленно и по прямой — от него можно уйти, но только
// если ты вообще двигаешься. Спрайта у него нет намеренно: облако спор должно
// читаться как облако, а не как ещё одна склянка, и в толпе игрок обязан
// мгновенно отличать своё от чужого. Своё — бирюзовое и быстрое, чужое —
// жёлтое, крупное и вязкое.
export class EnemyShot {
  constructor(x,y,angle,def,damage){
    this.def=def;
    this.x=x; this.y=y;
    this.vx=Math.cos(angle)*def.speed; this.vy=Math.sin(angle)*def.speed;
    this.radius=def.radius;
    this.damage=damage;
    this.life=def.life||180;
    this.spin=Math.random()*Math.PI*2;
  }

  update(){
    this.x+=this.vx; this.y+=this.vy;
    this.spin+=0.09;
    this.life--;
  }

  isOffScreen(camera){ return camera?!camera.sees(this.x,this.y,80):false; }

  draw(renderer){
    const ctx=renderer.ctx, glow=this.def.glow||"#ffe066";
    ctx.save();
    // Рыхлый комок: три подрагивающих кружка вместо одного ровного
    for(let i=0;i<3;i++){
      const a=this.spin+i*(Math.PI*2/3);
      ctx.globalAlpha=0.42;
      renderer.drawCircle(this.x+Math.cos(a)*this.radius*0.4,
                          this.y+Math.sin(a)*this.radius*0.4,
                          this.radius*0.72, glow);
    }
    ctx.globalAlpha=1;
    ctx.restore();
    renderer.drawGlowCircle(this.x,this.y,this.radius*0.55,glow,16);
  }
}
