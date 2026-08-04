// Снаряд несёт с собой описание своего оружия (def): по нему боевая
// система знает, какой рисовать спрайт, какой проигрывать взрыв и есть
// ли урон по области при попадании.
export class Projectile {
  constructor(x,y,angle,damage,def){
    this.def=def;
    this.x=x; this.y=y;
    this.vx=Math.cos(angle)*def.speed; this.vy=Math.sin(angle)*def.speed;
    this.radius=def.radius;
    this.damage=damage; this.life=100;
    this.angle=angle; this.ricocheted=false;
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
