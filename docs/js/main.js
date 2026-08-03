import { CONFIG } from "./config.js";
import { Loop, STEP } from "./core/loop.js";
import { AssetLoader } from "./engine/assetLoader.js";
import { AudioManager } from "./engine/audio.js";
import { InputManager } from "./engine/input.js";
import { Renderer } from "./engine/renderer.js";
import { Player } from "./entities/player.js";
import { Enemy } from "./entities/enemy.js";
import { Boss } from "./entities/boss.js";
import { ParticleSystem } from "./entities/particle.js";
import { WaveSystem } from "./systems/waveSystem.js";
import { SporeSystem } from "./systems/sporeSystem.js";
import { UpgradeSystem } from "./systems/upgradeSystem.js";

const canvas=document.getElementById("gameCanvas");
const ctx=canvas.getContext("2d");
canvas.width=CONFIG.screen.width; canvas.height=CONFIG.screen.height;

const loader=new AssetLoader();
const audio=new AudioManager(loader);
const input=new InputManager(canvas);
const renderer=new Renderer(canvas);
renderer.loader=loader;
const particles=new ParticleSystem();
const sporeSystem=new SporeSystem();
const upgradeSystem=new UpgradeSystem();

input.onMutePress=()=>audio.toggleMute();
input.onRestartPress=()=>{ if(gameOver) init(); };
input.onPausePress=()=>{ if(upgradeSystem.isOpen){ upgradeSystem.hideMenu(); paused=false; } };

(async()=>{ await loader.loadAll(CONFIG.assets); })();

let player,enemies,projectiles,waveSystem,gameOver,paused,waitingForUpgrade;

function init(){
  player=new Player(CONFIG.screen.width/2,CONFIG.screen.height/2);
  enemies=[]; projectiles=[];
  waveSystem=new WaveSystem(CONFIG.screen.width,CONFIG.screen.height);
  waveSystem.startWave(); gameOver=false; paused=false; waitingForUpgrade=false;
  document.getElementById("gameOverScreen").classList.add("hidden");
  upgradeSystem.hideMenu();
}

window.addEventListener("upgradeChosen",(e)=>{
  upgradeSystem.applyUpgrade(e.detail,player); waitingForUpgrade=false; paused=false;
});

function update(dt){
  if(gameOver||paused) return; if(waitingForUpgrade) return;
  const sporeEffects=sporeSystem.getSporeEffects(player.sporeLevel);
  player.update(input,CONFIG.screen.width,CONFIG.screen.height,dt,enemies);

  const proj=player.tryShoot();
  if(proj){ projectiles.push(proj); }

  const waveEvent=waveSystem.update(enemies,player,sporeEffects);
  if(waveEvent&&waveEvent.type==="boss"){ enemies.push(waveEvent.boss); }

  for(let i=enemies.length-1;i>=0;i--){
    // У Boss своя сигнатура update(player,enemies,sporeLevel) — общий вызов
    // для него не подходит и раньше прокручивал боссу все таймеры дважды.
    const e=enemies[i]; if(!(e instanceof Boss)) e.update(player,1,player.sporeLevel);
    if(e.dead) continue;

    if(e instanceof Boss){
      const evt=e.update(player,enemies,player.sporeLevel);
      if(evt==="sneeze"){ particles.emitSporeCloud(e.x,e.y,CONFIG.bosses.mother_cap.sporeCloudRadius,"#6b2d5c"); player.sporeLevel+=5; }
      if(evt==="spawn_minions"){ for(let k=0;k<CONFIG.bosses.mother_cap.minionCount;k++){ const ang=(Math.PI*2/CONFIG.bosses.mother_cap.minionCount)*k; enemies.push(new Enemy(e.x+Math.cos(ang)*60,e.y+Math.sin(ang)*60,"spore_bearer")); } }
      if(evt==="summon_tentacle"){ const tx=50+Math.random()*(CONFIG.screen.width-100), ty=50+Math.random()*(CONFIG.screen.height-100); enemies.push(new Enemy(tx,ty,"mycelium_tentacle")); }
      if(evt==="pulse"){ for(const en of enemies){ if(!(en instanceof Boss)) en.speed*=1.3; } }
    }

    if(e.trailTimer!==undefined&&e.trailTimer<=0){
      if(e.abilities.includes("spore_trail")){ particles.emitSporeCloud(e.x,e.y,25,"#6b2d5c"); e.trailTimer=CONFIG.enemies.types.mushroom_wolf.trailInterval; }
      if(e.abilities.includes("toxic_trail")){ particles.emitToxicTrail(e.x,e.y); e.trailTimer=CONFIG.enemies.types.spore_bat.trailInterval; }
    }

    if(e.hp<=0){
      e.dead=true; const t=CONFIG.enemies.types[e.typeKey]||CONFIG.bosses[e.typeKey]; particles.emit(e.x,e.y,"#39ff14",t.sporeCloudAmount||8);
      if(e.abilities&&e.abilities.includes("spore_cloud_on_death")) particles.emitSporeCloud(e.x,e.y,t.sporeCloudRadius||50,"#6b2d5c");
      if(e.abilities&&e.abilities.includes("explode_on_death")){
        particles.emit(e.x,e.y,"#c4a000",20,2,6);
        for(const o of enemies){ if(o!==e&&!(o instanceof Boss)){ const d=Math.hypot(o.x-e.x,o.y-e.y); if(d<t.explodeRadius) o.hp-=t.explodeDamage*0.5; } }
        const d=Math.hypot(player.x-e.x,player.y-e.y); if(d<t.explodeRadius){ player.takeDamage(t.explodeDamage); player.sporeLevel+=10; }
      }
      let xp=e.xpReward; if(sporeEffects.lootMult) xp*=sporeEffects.lootMult; if(player.xpMult) xp*=player.xpMult;
      if(player.addXp(xp)){ particles.emit(player.x,player.y,"#00d4aa",25); waitingForUpgrade=true; paused=true; upgradeSystem.showMenu(upgradeSystem.generateCards()); }
      if(Math.random()<0.08||(e instanceof Boss)) sporeSystem.spawnAntidote(e.x,e.y);
      enemies.splice(i,1);
    }
  }

  for(let i=projectiles.length-1;i>=0;i--){
    const p=projectiles[i]; p.update(); let hit=false;
    for(const e of enemies){ if(e.dead) continue; if(Math.hypot(p.x-e.x,p.y-e.y)<p.radius+e.radius){
      e.takeDamage(p.damage); if(player.poison) e.hp-=3; particles.emit(p.x,p.y,"#88ff88",5);
      if(player.explosive){ for(const o of enemies){ if(o!==e&&!o.dead&&Math.hypot(o.x-p.x,o.y-p.y)<40) o.hp-=p.damage*0.5; } particles.emit(p.x,p.y,"#ff6633",10); }
      // Рикошет: проверка `if(nearest)` стояла ВНУТРИ цикла поиска, поэтому
      // снаряд разворачивался в первого попавшегося врага в радиусе, а не в
      // ближайшего, и продолжал перебор уже после разворота.
      if(player.ricochet && !p.ricocheted){
        let nearest=null, bestD=150;
        for(const o of enemies){
          if(o===e||o.dead) continue;
          const d2=Math.hypot(o.x-p.x,o.y-p.y);
          if(d2<bestD){ bestD=d2; nearest=o; }
        }
        if(nearest){
          const a2=Math.atan2(nearest.y-p.y,nearest.x-p.x);
          p.vx=Math.cos(a2)*7; p.vy=Math.sin(a2)*7; p.angle=a2;
          p.ricocheted=true;   // один отскок на снаряд, иначе он живёт вечно
          hit=false; break;
        }
      }
      hit=true; break;
    }
    }
    if(hit||p.isOffScreen(CONFIG.screen.width,CONFIG.screen.height)||p.life<=0) projectiles.splice(i,1);
  }

  particles.update(); sporeSystem.update(player);

  document.getElementById("xpDisplay").textContent=Math.floor(player.xp);
  document.getElementById("levelDisplay").textContent=player.level;
  document.getElementById("enemyCount").textContent=enemies.length;
  document.getElementById("waveDisplay").textContent=waveSystem.wave;
  document.getElementById("hpBar").style.width=(player.hp/player.maxHp*100)+"%";
  document.getElementById("hpText").textContent=Math.floor(player.hp)+"/"+player.maxHp;
  document.getElementById("sporeBar").style.width=player.sporeLevel+"%";
  document.getElementById("sporeText").textContent=Math.floor(player.sporeLevel)+"%";

  if(player.hp<=0){ player.hp=0; gameOver=true; document.getElementById("finalWave").textContent=waveSystem.wave; document.getElementById("finalLevel").textContent=player.level; document.getElementById("gameOverScreen").classList.remove("hidden"); }
}
function draw(){
  renderer.clear(); renderer.drawMyceliumVeins(CONFIG.screen.width,CONFIG.screen.height); renderer.drawGrid(CONFIG.screen.width,CONFIG.screen.height);
  renderer.playerX=player.x; renderer.playerY=player.y;
  sporeSystem.draw(renderer);
  for(const e of enemies) e.draw(renderer);
  for(const p of projectiles) p.draw(renderer);
  particles.draw(renderer);
  player.draw(renderer);
  input.drawJoystick(renderer); // ← виртуальный джойстик
  renderer.drawText("Уровень "+player.level+"  |  XP "+Math.floor(player.xp)+"/"+player.xpToNext,20,30,{font:"14px monospace",color:"#aaa"});
  renderer.drawText("Волна "+waveSystem.wave+"  |  Врагов: "+enemies.length,CONFIG.screen.width-240,30,{font:"16px monospace",color:"#8888ff"});
  if(gameOver){ renderer.drawOverlay(0.7); renderer.drawText("СПОРЫ ПОБЕДИЛИ",CONFIG.screen.width/2,CONFIG.screen.height/2-20,{font:"bold 60px monospace",color:"#ff3344",align:"center"}); renderer.drawText("Волна "+waveSystem.wave+" | Уровень "+player.level,CONFIG.screen.width/2,CONFIG.screen.height/2+50,{font:"20px monospace",color:"#aaa",align:"center"}); renderer.drawText("R — рестарт | M — звук",CONFIG.screen.width/2,CONFIG.screen.height/2+100,{font:"16px monospace",color:"#888",align:"center"}); }
}

const loop=new Loop(update,draw);
init(); loop.start();
console.log("Грибной Сумрак запущен! WASD/джойстик — движение, мышь/авто-прицел — стрельба, M — звук, R — рестарт");
