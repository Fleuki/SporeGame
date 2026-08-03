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
    const img=renderer.loader?.getImage(this.def.sprite);
    if(img){
      // Склянка нарисована летящей вправо — вращаем по направлению полёта
      renderer.drawSpriteSheet(img,this.x,this.y,this.def.frame,this.def.frame,
                               0,0,this.def.display,this.angle);
    } else {
      renderer.drawGlowCircle(this.x,this.y,this.radius,"#00d4aa",12);
      renderer.drawCircle(this.x,this.y,this.radius,"#aaffff");
    }
  }
}
