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

// РАЗМЕР ХОЛСТА. Раньше он был прибит гвоздями: 900x700 всегда, а CSS потом
// растягивал результат под окно. На телефоне это давало сразу две беды.
// В альбомной ориентации картинка 900x700 масштабировалась в 844x390 —
// нецелое дробное сжатие пиксель-арта, отсюда «размазывается». В портретной
// холст по ширине упирался в экран и занимал треть высоты, а остальное было
// пустотой.
//
// Теперь холст занимает всё окно, а видимая ПЛОЩАДЬ мира держится постоянной
// (см. CONFIG.camera) — поэтому поворот телефона меняет форму кадра, но не
// сложность.
function fitCanvas(){
  const cssW=Math.max(240,Math.round(canvas.clientWidth||window.innerWidth));
  const cssH=Math.max(240,Math.round(canvas.clientHeight||window.innerHeight));
  // Плотность отрисовки: экран Retina даёт резкий пиксель-арт, но платить за
  // это четырьмя миллионами пикселей в кадре мы не готовы
  const dpr=Math.min(window.devicePixelRatio||1,
                     Math.sqrt(CONFIG.maxCanvasPixels/(cssW*cssH)));
  const w=Math.round(cssW*dpr), h=Math.round(cssH*dpr);
  if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
  // Площадь кадра в мировых единицах фиксирована эталоном
  const refArea=(CONFIG.screen.width/CONFIG.camera.zoom)*
                (CONFIG.screen.height/CONFIG.camera.zoom);
  const zoom=Math.min(CONFIG.camera.maxZoom,
             Math.max(CONFIG.camera.minZoom,Math.sqrt(w*h/refArea)));
  return {w,h,zoom};
}

const fit=fitCanvas();
const loader=new AssetLoader();
const audio=new AudioManager(loader);
const input=new InputManager(canvas);
const camera=new Camera(fit.w,fit.h,fit.zoom);
input.scaleTo(fit.w,fit.h);
const renderer=new Renderer(canvas);
renderer.loader=loader; renderer.camera=camera;
const particles=new ParticleSystem();
const sporeSystem=new SporeSystem();
const upgradeSystem=new UpgradeSystem();
const loot=new LootSystem(particles,audio);
const battle=new BattleSystem(particles,sporeSystem,loot,audio);
const map=new MapSystem();

input.onMutePress=()=>audio.toggleMute();
input.onRestartPress=()=>{ if(started&&gameOver) init(); };
// Escape раньше просто закрывал меню прокачки — это была бесплатная отмена
// выбора. Теперь это честная пауза, а меню прокачки закрыть нельзя: выбрать
// карточку всё равно придётся.
input.onPausePress=()=>{ if(!gameOver&&!waitingForUpgrade) paused=!paused; };
input.onBurstPress=()=>tryBurst();

// ВЫБРОС СПОР — единственное активное действие игрока. Проверки состояния
// стоят здесь, а не в BattleSystem: на паузе, в меню прокачки и в кадрах
// смерти мир не обновляется, и удар без движения врагов был бы бесплатным.
function tryBurst(){
  if(!started||gameOver||paused||waitingForUpgrade||dying>0) return;
  if(!battle.sporeBurst(player,camera)){
    // Отказ обязан звучать. Молчащая кнопка читается как «игра не заметила
    // нажатия», и игрок жмёт её ещё трижды вместо того, чтобы уходить.
    audio.sfx("hit",0.4);
    return;
  }
  syncHud();
}

(async()=>{ await loader.loadAll(CONFIG.assets); })();

// ШРИФТ ДЛЯ ХОЛСТА ГРУЗИМ ЯВНО. Браузер подтягивает woff2 лениво — когда
// текст этим шрифтом впервые понадобился РАЗМЕТКЕ. Холст в этот учёт не
// входит: если файл ещё не пришёл, canvas молча нарисует системным, и первые
// цифры урона в забеге будут другим шрифтом. Подмножества раздельные, поэтому
// просим обе буквы — латинскую и кириллическую.
document.fonts?.load('16px "Pixelify Sans"', "0A");
document.fonts?.load('bold 16px "Pixelify Sans"', "Я");

// Поворот телефона, смена размера окна, появление адресной строки — всё это
// приходит сюда. Камеру пересобираем и сразу центрируем на игроке: иначе
// после поворота окно остаётся сдвинутым на полкадра.
function onResize(){
  const f=fitCanvas();
  camera.resize(f.w,f.h,f.zoom);
  input.scaleTo(f.w,f.h);
  if(player) camera.centerOn(player);
}
window.addEventListener("resize",onResize);
window.addEventListener("orientationchange",()=>setTimeout(onResize,120));
// visualViewport ловит то, чего не ловит resize: скрытие панели браузера на
// мобильных меняет высоту окна без события resize в части браузеров
window.visualViewport?.addEventListener("resize",onResize);

let player,enemies,projectiles,spawnSystem,gameOver,paused,waitingForUpgrade;
// Забег ещё не начат: страница открывается на стартовом экране, а мир под
// ним стоит неподвижно и работает фоном. До нажатия «Играть» симуляция не
// идёт вообще — иначе игрок к моменту старта уже был бы обстрелян.
let started=false;
let runTime=0;   // секунды с начала забега, идут только пока игра не на паузе
// Меню прокачки открывается не мгновенно: сначала должно дойти, что уровень
// вообще взят. При паузе кадры не идут, поэтому иначе искры и надпись никто
// не увидит — меню накрывает их в тот же кадр.
// 32 кадра (полсекунды) вместо прежних 32, посчитанных по длине спрайтовой
// вспышки: её больше нет, а пауза на осознание нужна ровно та же.
let levelUpDelay=0;
const LEVELUP_FRAMES=32;
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
  enemies=[]; projectiles=[]; loot.reset(); particles.reset(); battle.reset();
  runTime=0; levelUpDelay=0; dying=0;
  spawnSystem=new SpawnSystem(camera);
  gameOver=false; paused=false; waitingForUpgrade=false;
  document.getElementById("gameOverScreen").classList.add("hidden");
  document.getElementById("ui").classList.remove("hidden");
  upgradeSystem.hideMenu();
}

window.addEventListener("upgradeChosen",(e)=>{
  const card=upgradeSystem.applyUpgrade(e.detail,player);
  if(card?.category==="evolution") announceEvolution(card);
  waitingForUpgrade=false; paused=false;
});

// ЭВОЛЮЦИЯ СТВОЛА. Единственная карточка за забег, после которой оружие в
// руках у игрока становится ДРУГИМ, — и она обязана прозвучать иначе, чем
// «+12% урона». Собрано из того же, чем говорит остальная игра: искры,
// всплывающий текст, толчок камеры и отдельный звук.
function announceEvolution(card){
  particles.emit(player.x,player.y,"#ffd24a",34,1.5,6);
  particles.emitText(player.x,player.y-player.radius-16,card.title,"#ffd24a",19);
  audio.sfx("evolve"); camera.shake(CONFIG.feel.shakeLevel*1.6,16);
}

function update(dt){
  if(!started||gameOver||paused||waitingForUpgrade) return;

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
    // Вспышка в точке вылета — единственный признак выстрела на самом
    // персонаже: анимации броска больше нет, он всегда в спрайте ходьбы
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

// ПОЛУЧЕН УРОВЕНЬ.
//
// Спрайтовая вспышка отсюда убрана. Лист fx_levelup — это кадр 192 пикселя,
// который рисовался размером 220 при росте персонажа в 64: втрое больше самого
// игрока, поверх всего и с растяжением. Он не читался как эффект игры, он
// читался как наклейка, прилетевшая из другого приложения.
//
// Событие и без него сообщается тремя способами сразу: искры из игрока, звук и
// короткий толчок камеры. Плюс номер уровня всплывающим текстом — тем же, что
// показывает урон, то есть в стиле остального кадра.
function startLevelUp(){
  particles.emit(player.x,player.y,"#00d4aa",26,1,5);
  particles.emitText(player.x,player.y-player.radius-16,
                     "УРОВЕНЬ "+player.level,"#7dffca",17);
  audio.sfx("levelup"); camera.shake(CONFIG.feel.shakeLevel,10);
  levelUpDelay=LEVELUP_FRAMES;
}

function openUpgradeMenu(){
  waitingForUpgrade=true; paused=true;
  upgradeSystem.showMenu(upgradeSystem.generateCards(player),player);
}

function endGame(){
  player.hp=0; gameOver=true; dying=0;
  // Счётчик убитых переехал сюда с игрового экрана: в бою на него не
  // смотрят, а на экране итогов он как раз и есть итог.
  // Монет здесь больше нет — валюта убрана до магазина (ЭТАП 2 в ROADMAP):
  // цифра, которую некуда потратить, обещает накопление, которого не будет.
  document.getElementById("finalLevel").textContent=player.level;
  document.getElementById("finalKills").textContent=battle.kills;
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
for(const id of ["xpBar","levelDisplay","timeDisplay","hpBar","sporeBar","burstBtn"]){
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
  // Кнопка выброса гаснет, пока шкалы не хватает на его цену. Это не украшение:
  // цена ресурса должна читаться до нажатия, иначе трата остаётся сюрпризом.
  HUD.burstBtn.classList.toggle("dim",!player.canBurst());
}

// Красная рамка по краям экрана в момент удара. Самый дешёвый способ сказать
// «в тебя попали» так, чтобы это было видно, даже когда смотришь на толпу
// в другом углу экрана.
function drawHurtVignette(){
  const k=player.hurtFlash>0?player.hurtFlash/12
         :(player.sporeLevel>=CONFIG.sporeSystem.thresholds.critical?0.35:0);
  if(k<=0) return;
  const ctx=renderer.ctx, w=canvas.width, h=canvas.height;
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
  map.drawGround(renderer,runTime);           // земля, тропы и пятна биомов
  map.drawDecor(renderer);                    // пни и телеги под сущностями
  map.drawEdge(renderer);                     // мрак на границе арены
  battle.drawFields(renderer);                // живые грибницы лежат на земле
  loot.draw(renderer);
  for(const e of enemies) e.draw(renderer);
  for(const p of projectiles) p.draw(renderer);
  battle.drawShots(renderer);     // облака спор трубачей
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
    // Надписи масштабируются вместе с холстом: на телефоне холст заметно
    // меньше 900 пикселей, и кегль в 46px занял бы половину экрана
    const k=Math.min(1.4,Math.max(0.55,canvas.width/CONFIG.screen.width));
    renderer.drawText("ПАУЗА",canvas.width/2,canvas.height/2,
      {font:"bold "+Math.round(46*k)+"px "+CONFIG.fontFamily,color:"#00d4aa",align:"center"});
    renderer.drawText("Esc — продолжить",canvas.width/2,canvas.height/2+40*k,
      {font:Math.round(16*k)+"px "+CONFIG.fontFamily,color:"#8a8a8a",align:"center"});
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
    // Колода прокачки. Проверить, что эволюция появляется на пятой карточке
    // ветки, иначе как забегом до десятого уровня нельзя, а забег до
    // десятого уровня — это десять минут на одну проверку одного числа.
    upgrades:upgradeSystem,
    battle,
    // Карта: декорации ставятся по хешу клетки из мешка map.bag, то есть
    // случайно и редко. Чтобы посмотреть на одну конкретную (например, на
    // кислотную лужу), мешок проще подменить: GAME.map.bag=["acid_pool"].
    map,
    // Ввод: без него нельзя проверить джойстик иначе как пальцем по телефону
    input,
    // Живой конфиг: правки видны со следующего кадра, без перезагрузки.
    // Нужен для подбора того, что оценивается только глазами — контур врагов,
    // сила темноты, размеры. Поставить игру на паузу (Esc), покрутить число,
    // сравнить два кадра одной и той же сцены — иначе сравниваешь разные.
    config:CONFIG,
    // Выброс спор с кода: клавиатурный пробел из Playwright уходит документу,
    // а не игре, если фокус остался на кнопке «Играть»
    burst:()=>tryBurst(),
    stats:()=>({
      time:runTime, level:player.level, hp:player.hp, maxHp:player.maxHp,
      spore:player.sporeLevel, kills:battle.kills, gameOver,
      // Выброс: без этих двух полей проверить трату шкалы можно только
      // глазами по кнопке, а бот кнопку не видит
      canBurst:player.canBurst(), burstCd:player.burstCd,
      alive:enemies.filter(e=>!e.dead).length,
      aliveLimit:spawnSystem.aliveLimit(),
      interval:spawnSystem.interval(),
      onScreen:enemies.filter(e=>!e.dead&&camera.sees(e.x,e.y,0)).length,
      pipers:enemies.filter(e=>!e.dead&&e.typeKey==="spore_piper").length,
      enemyShots:battle.enemyShots.length,
      drops:loot.items.length,
      fields:battle.fields.length,
      damage:player.damage,
      // Не просто «сколько стволов», а какие именно: эволюция подменяет
      // описание ствола, и по числу её не видно
      weapons:player.weapons.map(w=>w.def.key)
    })
  };
}

// НАЧАЛО ЗАБЕГА. init() зовётся и здесь, до старта: мир нужен нарисованным,
// чтобы за стартовым экраном стояла игра, а не чёрный прямоугольник. Но HUD
// до нажатия «Играть» прячем — показывать шкалы поверх названия незачем.
function startRun(){
  document.getElementById("startScreen").classList.add("hidden");
  started=true; init();
}
document.getElementById("playBtn").onclick=startRun;
// Та же трата с пальца. Подсказку «ПРОБЕЛ» на сенсорном экране прячем: клавиши
// там нет, а подпись к несуществующей кнопке — то же ложное обещание.
if(input.isMobile) document.body.classList.add("touch");
HUD.burstBtn.addEventListener("click",(e)=>{ e.preventDefault(); tryBurst(); });
// Кнопка вместо надписи «R — рестарт»: на телефоне клавиши нет, и экран
// смерти был тупиком — забег не перезапустить иначе как перезагрузкой.
document.getElementById("restartBtn").onclick=()=>{ if(gameOver) init(); };

const loop=new Loop(update,draw);
init();
document.getElementById("ui").classList.add("hidden");
loop.start();
console.log("Грибной Сумрак запущен! WASD/джойстик — движение, мышь/авто-прицел — стрельба, M — звук, R — рестарт");
