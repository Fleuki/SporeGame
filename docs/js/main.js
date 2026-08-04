import { CONFIG } from "./config.js";
import { Loop } from "./core/loop.js";
import { Camera } from "./core/camera.js";
import { AssetLoader } from "./engine/assetLoader.js";
import { AudioManager } from "./engine/audio.js";
import { InputManager } from "./engine/input.js";
import { Renderer } from "./engine/renderer.js";
import { Player } from "./entities/player.js";
import { ParticleSystem } from "./entities/particle.js";
import { WaveSystem } from "./systems/waveSystem.js";
import { SporeSystem } from "./systems/sporeSystem.js";
import { UpgradeSystem } from "./systems/upgradeSystem.js";
import { BattleSystem } from "./systems/battleSystem.js";
import { MapSystem } from "./systems/mapSystem.js";
import { LootSystem } from "./systems/lootSystem.js";

const canvas=document.getElementById("gameCanvas");
canvas.width=CONFIG.screen.width; canvas.height=CONFIG.screen.height;

const loader=new AssetLoader();
const audio=new AudioManager(loader);
const input=new InputManager(canvas);
const camera=new Camera(CONFIG.screen.width,CONFIG.screen.height);
const renderer=new Renderer(canvas);
renderer.loader=loader; renderer.camera=camera;
const particles=new ParticleSystem();
const sporeSystem=new SporeSystem();
const upgradeSystem=new UpgradeSystem();
const loot=new LootSystem(particles);
const battle=new BattleSystem(particles,sporeSystem,loot);
const map=new MapSystem();

input.onMutePress=()=>audio.toggleMute();
input.onRestartPress=()=>{ if(gameOver) init(); };
input.onPausePress=()=>{ if(upgradeSystem.isOpen){ upgradeSystem.hideMenu(); paused=false; } };

(async()=>{ await loader.loadAll(CONFIG.assets); })();

let player,enemies,projectiles,waveSystem,gameOver,paused,waitingForUpgrade;

function init(){
  player=new Player(0,0);
  camera.centerOn(player);
  enemies=[]; projectiles=[]; loot.reset();
  waveSystem=new WaveSystem(camera);
  waveSystem.startWave(); gameOver=false; paused=false; waitingForUpgrade=false;
  document.getElementById("gameOverScreen").classList.add("hidden");
  upgradeSystem.hideMenu();
}

window.addEventListener("upgradeChosen",(e)=>{
  upgradeSystem.applyUpgrade(e.detail,player); waitingForUpgrade=false; paused=false;
});

function update(dt){
  if(gameOver||paused||waitingForUpgrade) return;

  const sporeEffects=sporeSystem.getSporeEffects(player.sporeLevel);
  player.update(dt,{input,enemies,camera});
  camera.follow(player);

  for(const shot of player.tryShoot(enemies)) projectiles.push(shot);

  const waveEvent=waveSystem.update(enemies,player,sporeEffects);
  if(waveEvent&&waveEvent.type==="boss") enemies.push(waveEvent.boss);

  battle.update(dt,{player,enemies,projectiles,sporeEffects,camera});
  // Опыт даёт не смерть врага, а подобранный предмет
  if(loot.update(player,camera)) openUpgradeMenu();

  particles.update();
  map.update();                    // кадры анимированных декораций
  syncHud();

  if(player.hp<=0) endGame();
}

function openUpgradeMenu(){
  particles.emit(player.x,player.y,"#00d4aa",25);
  waitingForUpgrade=true; paused=true;
  upgradeSystem.showMenu(upgradeSystem.generateCards(player));
}

function endGame(){
  player.hp=0; gameOver=true;
  document.getElementById("finalWave").textContent=waveSystem.wave;
  document.getElementById("finalLevel").textContent=player.level;
  document.getElementById("gameOverScreen").classList.remove("hidden");
}

function syncHud(){
  document.getElementById("xpDisplay").textContent=Math.floor(player.xp);
  document.getElementById("levelDisplay").textContent=player.level;
  document.getElementById("enemyCount").textContent=enemies.length;
  document.getElementById("waveDisplay").textContent=waveSystem.wave;
  document.getElementById("coinDisplay").textContent=loot.coins;
  document.getElementById("hpBar").style.width=(player.hp/player.maxHp*100)+"%";
  document.getElementById("hpText").textContent=Math.floor(player.hp)+"/"+player.maxHp;
  document.getElementById("sporeBar").style.width=player.sporeLevel+"%";
  document.getElementById("sporeText").textContent=Math.floor(player.sporeLevel)+"%";
}

function draw(){
  renderer.clear();
  renderer.playerX=player.x; renderer.playerY=player.y;

  // --- мировой слой: всё внутри begin/end сдвигается камерой ---
  renderer.begin();
  map.drawGround(renderer,waveSystem.wave);   // земля текущего биома
  map.drawDecor(renderer);                    // пни и телеги под сущностями
  loot.draw(renderer);
  for(const e of enemies) e.draw(renderer);
  for(const p of projectiles) p.draw(renderer);
  particles.draw(renderer);
  player.draw(renderer);
  battle.drawEffects(renderer);   // взрывы поверх всего
  renderer.end();

  // --- экранный слой: интерфейс и джойстик не ездят вместе с миром ---
  map.drawVignette(renderer);
  input.drawJoystick(renderer);
  renderer.drawText("Уровень "+player.level+"  |  XP "+Math.floor(player.xp)+"/"+player.xpToNext,20,30,{font:"14px monospace",color:"#aaa"});
  renderer.drawText("Волна "+waveSystem.wave+"  |  Врагов: "+enemies.length,CONFIG.screen.width-240,30,{font:"16px monospace",color:"#8888ff"});

  if(gameOver){
    renderer.drawOverlay(0.7);
    renderer.drawText("СПОРЫ ПОБЕДИЛИ",CONFIG.screen.width/2,CONFIG.screen.height/2-20,{font:"bold 60px monospace",color:"#ff3344",align:"center"});
    renderer.drawText("Волна "+waveSystem.wave+" | Уровень "+player.level,CONFIG.screen.width/2,CONFIG.screen.height/2+50,{font:"20px monospace",color:"#aaa",align:"center"});
    renderer.drawText("R — рестарт | M — звук",CONFIG.screen.width/2,CONFIG.screen.height/2+100,{font:"16px monospace",color:"#888",align:"center"});
  }
}

const loop=new Loop(update,draw);
init(); loop.start();
console.log("Грибной Сумрак запущен! WASD/джойстик — движение, мышь/авто-прицел — стрельба, M — звук, R — рестарт");
