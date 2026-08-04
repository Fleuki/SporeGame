import { CONFIG } from "./config.js";
import { Loop } from "./core/loop.js";
import { Camera } from "./core/camera.js";
import { AssetLoader } from "./engine/assetLoader.js";
import { AudioManager } from "./engine/audio.js";
import { InputManager } from "./engine/input.js";
import { Renderer } from "./engine/renderer.js";
import { Player } from "./entities/player.js";
import { ParticleSystem } from "./entities/particle.js";
import { SpawnSystem } from "./systems/spawnSystem.js";
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
const camera=new Camera(CONFIG.screen.width,CONFIG.screen.height,CONFIG.camera.zoom);
const renderer=new Renderer(canvas);
renderer.loader=loader; renderer.camera=camera;
const particles=new ParticleSystem();
const sporeSystem=new SporeSystem();
const upgradeSystem=new UpgradeSystem();
const loot=new LootSystem(particles,audio);
const battle=new BattleSystem(particles,sporeSystem,loot,audio);
const map=new MapSystem();

input.onMutePress=()=>audio.toggleMute();
input.onRestartPress=()=>{ if(gameOver) init(); };
// Escape раньше просто закрывал меню прокачки — это была бесплатная отмена
// выбора. Теперь это честная пауза, а меню прокачки закрыть нельзя: выбрать
// карточку всё равно придётся.
input.onPausePress=()=>{ if(!gameOver&&!waitingForUpgrade) paused=!paused; };

(async()=>{ await loader.loadAll(CONFIG.assets); })();

let player,enemies,projectiles,spawnSystem,gameOver,paused,waitingForUpgrade;
let runTime=0;   // секунды с начала забега, идут только пока игра не на паузе
// Меню прокачки открывается не мгновенно: сначала должна доиграть вспышка
// уровня. При паузе кадры анимации не идут, поэтому иначе её никто не увидит.
let levelUpDelay=0;
const LEVELUP_FRAMES=CONFIG.levelUp.cols*CONFIG.levelUp.speed+4;
// Кадры, оставшиеся до экрана поражения. Пока счётчик тикает, мир стоит и
// доигрывает только анимация смерти: раньше экран появлялся в тот же кадр,
// когда HP уходило в ноль, и нарисованную смерть никто ни разу не видел.
let dying=0;

function init(){
  player=new Player(0,0);
  // Игрок сам не знает про камеру и звук — обратную связь на урон вешаем здесь
  player.onHurt=(amount,kind)=>{
    if(kind==="shield"){ audio.sfx("shield"); return; }
    audio.sfx("hurt");
    camera.shake(CONFIG.feel.shakeHurt,12);
    particles.emitText(player.x,player.y-player.radius-10,"-"+Math.round(amount),"#ff5566",15);
  };
  camera.centerOn(player);
  enemies=[]; projectiles=[]; loot.reset(); particles.reset(); battle.effects.length=0;
  battle.kills=0; runTime=0; levelUpDelay=0; dying=0;
  spawnSystem=new SpawnSystem(camera);
  gameOver=false; paused=false; waitingForUpgrade=false;
  document.getElementById("gameOverScreen").classList.add("hidden");
  document.getElementById("ui").classList.remove("hidden");
  upgradeSystem.hideMenu();
}

window.addEventListener("upgradeChosen",(e)=>{
  upgradeSystem.applyUpgrade(e.detail,player); waitingForUpgrade=false; paused=false;
});

function update(dt){
  if(gameOver||paused||waitingForUpgrade) return;

  // Смерть: враги, волны и стрельба остановлены, крутятся только анимация
  // алхимика, частицы и карта — чтобы кадр не выглядел замороженным насмерть.
  if(dying>0){
    player.stepDeath();
    particles.update();
    battle.updateEffects();
    map.update(camera);
    camera.follow(player);
    syncHud();
    if(--dying<=0) endGame();
    return;
  }

  runTime+=dt;

  const sporeEffects=sporeSystem.getSporeEffects(player.sporeLevel);
  player.update(dt,{input,enemies,camera});
  camera.follow(player);

  const shots=player.tryShoot(enemies);
  for(const shot of shots){
    projectiles.push(shot);
    // Вспышка в точке вылета — теперь это единственный признак выстрела на
    // самом персонаже, анимация броска отключена (CONFIG.player.attackAnim)
    particles.emitMuzzle(shot.x,shot.y,shot.angle,shot.def.glow||"#00d4aa");
  }
  if(shots.length) audio.sfx("shoot");

  // Волн больше нет: враги идут потоком, сложность считается от runTime,
  // единственное событие спавна — выход босса
  const spawnEvent=spawnSystem.update(dt,enemies,player,sporeEffects);
  if(spawnEvent&&spawnEvent.type==="boss"){
    enemies.push(spawnEvent.boss);
    audio.sfx("boss"); camera.shake(CONFIG.feel.shakeBoss,40);
  }

  battle.update(dt,{player,enemies,projectiles,sporeEffects,camera});
  // Опыт даёт не смерть врага, а подобранный предмет
  if(loot.update(player,camera)) startLevelUp();
  if(levelUpDelay>0&&--levelUpDelay===0) openUpgradeMenu();

  particles.update();
  map.update(camera);              // кадры анимации и список видимых декораций
  map.applyHazards(dt,player,enemies,particles);   // кислотные лужи жгут всех
  syncHud();

  if(player.hp<=0) beginDeath();
}

function beginDeath(){
  if(dying>0) return;
  player.startDeath();
  dying=player.deathDuration();
  audio.sfx("hurt"); audio.sfx("boom");
  camera.shake(CONFIG.feel.shakeBoss,30);
  particles.emit(player.x,player.y,"#6b2d5c",30,1,5);
}

function startLevelUp(){
  particles.emit(player.x,player.y,"#00d4aa",25);
  battle.addEffect(player.x,player.y-30,CONFIG.levelUp);
  audio.sfx("levelup"); camera.shake(CONFIG.feel.shakeLevel,10);
  levelUpDelay=LEVELUP_FRAMES;
}

function openUpgradeMenu(){
  waitingForUpgrade=true; paused=true;
  upgradeSystem.showMenu(upgradeSystem.generateCards(player));
}

function endGame(){
  player.hp=0; gameOver=true; dying=0;
  // Убитые и монеты переехали сюда с игрового экрана: в бою на них не
  // смотрят, а на экране итогов они как раз и есть итог
  document.getElementById("finalLevel").textContent=player.level;
  document.getElementById("finalKills").textContent=battle.kills;
  document.getElementById("finalCoins").textContent=loot.coins;
  document.getElementById("finalTime").textContent=formatTime(runTime);
  document.getElementById("gameOverScreen").classList.remove("hidden");
  // Боевой HUD на экране итогов не нужен: таймер и шкалы просвечивали
  // сквозь затемнение и спорили с итоговыми цифрами
  document.getElementById("ui").classList.add("hidden");
}

function formatTime(sec){
  const m=Math.floor(sec/60), s=Math.floor(sec%60);
  return m+":"+String(s).padStart(2,"0");
}

// Узлы интерфейса ищутся один раз: getElementById по разу на поле в кадр —
// это лишняя работа каждый кадр и заодно шум в коде.
//
// Состав HUD урезан: с боевого экрана ушли счётчик убитых, монеты, номер
// волны и все текстовые подписи шкал. Осталось три вещи — таймер сверху по
// центру (он же единственная мера прогресса), полоса опыта во всю ширину
// внизу и компактная пара HP/споры над ней. Цифры «74/100» в бою всё равно
// никто не читает, а цвет и длина шкалы читаются мгновенно.
const HUD={};
for(const id of ["xpBar","levelDisplay","timeDisplay","hpBar","sporeBar"]){
  HUD[id]=document.getElementById(id);
}
const hpRow=HUD.hpBar.closest(".vital"), sporeRow=HUD.sporeBar.closest(".vital");

// Заполнение резной шкалы. Ширину менять нельзя — картинка сжималась бы
// вместе с рамкой; вместо этого «горящая» копия открывается clip-path'ом.
// Открывается не от края картинки, а от края ОКНА шкалы: наросты по бокам
// заходят внутрь кадра, и без этой поправки пустая шкала выглядела бы
// заполненной на несколько процентов, а полная — не доходящей до конца.
// Границы окна лежат в CSS (--win-a/--win-b), там же, где сама картинка.
// Границы окна читаются один раз на шкалу: getComputedStyle в каждом кадре —
// это принудительный пересчёт стилей шестьдесят раз в секунду на ровном месте.
const BAR_WIN=new WeakMap();
function barWindow(el){
  let w=BAR_WIN.get(el);
  if(!w){
    const cs=getComputedStyle(el.parentElement);
    w={ a: parseFloat(cs.getPropertyValue("--win-a"))||0,
        b: parseFloat(cs.getPropertyValue("--win-b"))||100 };
    BAR_WIN.set(el,w);
  }
  return w;
}

function fillBar(el,pct){
  const {a,b}=barWindow(el);
  const p=Math.max(0,Math.min(1,pct));
  el.style.clipPath="inset(0 "+(100-(a+(b-a)*p)).toFixed(2)+"% 0 0)";
}

function syncHud(){
  HUD.xpBar.style.width=(player.xp/player.xpToNext*100)+"%";
  HUD.levelDisplay.textContent=player.level;
  HUD.timeDisplay.textContent=formatTime(runTime);

  const hpPct=Math.max(0,player.hp/player.maxHp);
  fillBar(HUD.hpBar,hpPct);
  // Полоска пульсирует на последней четверти здоровья и на критическом
  // заражении: движение боковое зрение ловит даже в свалке
  hpRow.classList.toggle("critical",hpPct<=0.25);
  fillBar(HUD.sporeBar,player.sporeLevel/CONFIG.sporeSystem.maxSpore);
  sporeRow.classList.toggle("critical",player.sporeLevel>=CONFIG.sporeSystem.thresholds.danger);
}

// Красная рамка по краям экрана в момент удара. Самый дешёвый способ сказать
// «в тебя попали» так, чтобы это было видно, даже когда смотришь на толпу
// в другом углу экрана.
function drawHurtVignette(){
  const k=player.hurtFlash>0?player.hurtFlash/12
         :(player.sporeLevel>=CONFIG.sporeSystem.thresholds.critical?0.35:0);
  if(k<=0) return;
  const ctx=renderer.ctx, w=CONFIG.screen.width, h=CONFIG.screen.height;
  const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.28,w/2,h/2,Math.max(w,h)*0.62);
  g.addColorStop(0,"rgba(255,40,60,0)");
  g.addColorStop(1,`rgba(255,40,60,${0.55*k})`);
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
}

function draw(){
  renderer.clear();
  renderer.playerX=player.x; renderer.playerY=player.y;

  // --- мировой слой: всё внутри begin/end сдвигается камерой ---
  renderer.begin();
  map.drawGround(renderer,runTime);           // земля текущего биома
  map.drawDecor(renderer);                    // пни и телеги под сущностями
  map.drawEdge(renderer);                     // мрак на границе арены
  loot.draw(renderer);
  for(const e of enemies) e.draw(renderer);
  for(const p of projectiles) p.draw(renderer);
  particles.draw(renderer);
  player.draw(renderer);
  battle.drawEffects(renderer);   // взрывы поверх всего
  renderer.end();

  // --- экранный слой: интерфейс и джойстик не ездят вместе с миром ---
  // Темнота идёт первой: она гасит мир, но не должна гасить виньетку,
  // красную рамку урона и джойстик
  map.drawDarkness(renderer,player);
  map.drawVignette(renderer);
  drawHurtVignette();
  input.drawJoystick(renderer);

  if(paused&&!waitingForUpgrade&&!gameOver){
    renderer.drawOverlay(0.55);
    renderer.drawText("ПАУЗА",CONFIG.screen.width/2,CONFIG.screen.height/2,{font:"bold 46px monospace",color:"#00d4aa",align:"center"});
    renderer.drawText("Esc — продолжить",CONFIG.screen.width/2,CONFIG.screen.height/2+40,{font:"16px monospace",color:"#8a8a8a",align:"center"});
  }

  // Экран поражения рисует #gameOverScreen из index.html. Раньше здесь же
  // лежала вторая, канвасная копия того же текста — обе показывались
  // одновременно и со смещением, буквы наезжали друг на друга.
  if(gameOver) renderer.drawOverlay(0.35);
}

// ОТЛАДОЧНЫЙ ДОСТУП: только по «?debug» в адресе. Баланс здесь правится
// числами в CONFIG, а проверить их иначе как забегом нельзя — глазами по
// скриншоту не посчитать ни живых врагов, ни потолок, ни темп спавна.
// В обычной игре объект не создаётся вовсе.
if(new URLSearchParams(location.search).has("debug")){
  window.GAME={
    // Геттеры, а не ссылки: init() создаёт нового игрока на каждый рестарт,
    // и захваченная ссылка после первого же «R» указывала бы в пустоту
    get player(){ return player; },
    get enemies(){ return enemies; },
    get spawn(){ return spawnSystem; },
    stats:()=>({
      time:runTime, level:player.level, hp:player.hp, maxHp:player.maxHp,
      spore:player.sporeLevel, kills:battle.kills, gameOver,
      alive:enemies.filter(e=>!e.dead).length,
      aliveLimit:spawnSystem.aliveLimit(),
      interval:spawnSystem.interval(),
      onScreen:enemies.filter(e=>!e.dead&&camera.sees(e.x,e.y,0)).length,
      damage:player.damage, weapons:player.weapons.length
    })
  };
}

const loop=new Loop(update,draw);
init(); loop.start();
console.log("Грибной Сумрак запущен! WASD/джойстик — движение, мышь/авто-прицел — стрельба, M — звук, R — рестарт");
