import { CONFIG } from "./config.js";
import { Loop } from "./core/loop.js";
import { Camera } from "./core/camera.js";
import { AssetLoader } from "./engine/assetLoader.js";
import { AudioManager } from "./engine/audio.js";
import { InputManager } from "./engine/input.js";
import { Renderer } from "./engine/renderer.js";
import { Player } from "./entities/player.js";
// Только чтобы отличить босса от рядового врага при выборе момента для лавки
import { Boss } from "./entities/boss.js";
import { ParticleSystem } from "./entities/particle.js";
import { SpawnSystem } from "./systems/spawnSystem.js";
import { SporeSystem } from "./systems/sporeSystem.js";
import { UpgradeSystem } from "./systems/upgradeSystem.js";
import { BattleSystem } from "./systems/battleSystem.js";
import { MapSystem } from "./systems/mapSystem.js";
import { LootSystem } from "./systems/lootSystem.js";
import { ShopSystem } from "./systems/shopSystem.js";
import { RecordSystem } from "./systems/recordSystem.js";
import { MetaSystem } from "./systems/metaSystem.js";
import { SettingsSystem } from "./systems/settingsSystem.js";
import { Store } from "./engine/store.js";
import { YandexPlatform } from "./platform/yandex.js";

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
  const refW=CONFIG.screen.width/CONFIG.camera.zoom;
  const refH=CONFIG.screen.height/CONFIG.camera.zoom;
  const refArea=refW*refH;
  // ...но только пока ФОРМА кадра недалеко от эталонной. Портретный телефон
  // при постоянной площади вытягивал кадр в щель по ширине (см. CONFIG.camera):
  // площадь та же, а фланг вдвое ближе. Поэтому пропорции зажимаются в
  // aspectCap раз от эталонных, и зум считается по той стороне, которой при
  // этом не хватает.
  const cap=CONFIG.camera.aspectCap||1e9, refAspect=refW/refH;
  const aspect=Math.min(refAspect*cap,Math.max(refAspect/cap,w/h));
  // Кадр эталонной площади нужной формы. Пока пропорции окна внутри
  // потолка, aspect равен w/h — и обе стороны дают ровно один и тот же зум,
  // то есть на обычном экране ничего не меняется.
  const viewW=Math.sqrt(refArea*aspect), viewH=refArea/viewW;
  const zoom=Math.min(CONFIG.camera.maxZoom,
             Math.max(CONFIG.camera.minZoom,Math.min(w/viewW,h/viewH)));
  // Насколько кадр вышел больше эталонного, считает не здесь, а SpawnSystem
  // по самой камере (`areaScale`): у неё камера уже есть, и после поворота
  // телефона число обязано быть свежим без единого лишнего присваивания.
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
const battle=new BattleSystem(particles,sporeSystem,loot,audio,loader);
const map=new MapSystem();
const shop=new ShopSystem(audio);
const meta=new MetaSystem();
// Рекорд у каждой сложности свой — область хранения задаётся выбранной
const records=new RecordSystem(meta.difficulty);
// Громкости читаются из localStorage и применяются к звуку сразу при запуске:
// игрок, убавивший эффекты в прошлый раз, не должен слышать их снова
const settings=new SettingsSystem(audio);

// ПЛОЩАДКА. На своём адресе (GitHub Pages) SDK нет вовсе, и адаптер молча
// ничего не делает; на Яндекс Играх он же держит рекламу, отсчёт геймплея и
// хранилище. Boot ниже, вместе с ассетами: до его ответа игра уже играется.
const platform=new YandexPlatform();
// ЗВУК НА ВРЕМЯ РЕКЛАМНОГО БЛОКА — требование площадки. Флаг держим здесь же:
// без него возврат на вкладку посреди ролика вернул бы музыку поверх рекламы.
let advSuspend=false;
platform.onAdvSound=(on)=>{ advSuspend=on; audio.suspend(on); };

input.onMutePress=()=>audio.toggleMute();
// Рестарт с клавиатуры идёт через ту же рекламную паузу, что и кнопка: иначе
// у игры был бы тихий путь в обход рекламы, о котором знает один человек.
input.onRestartPress=()=>{ if(started&&gameOver) platform.commercialBreak(()=>init()); };
// Escape раньше просто закрывал меню прокачки — это была бесплатная отмена
// выбора. Теперь это честная пауза, а меню прокачки закрыть нельзя: выбрать
// карточку всё равно придётся.
// Лавку, как и меню прокачки, нельзя закрыть паузой: это была бы бесплатная
// отмена. Уйти с прилавка можно только кнопкой «В БОЙ».
input.onPausePress=()=>togglePause();
input.onBurstPress=()=>tryBurst();
input.onUpgradePress=()=>openUpgradeMenu();

// ПАУЗА одним местом на две двери: Escape и кнопка в углу. На телефоне
// клавиши нет, и до кнопки забег там нельзя было прервать ничем, кроме
// перезагрузки страницы.
//
// force задаёт состояние вместо переключения — им пользуется уход со
// вкладки: свернувшийся браузер обязан ставить игру на паузу, а не снимать
// её, если она уже стояла.
function togglePause(force){
  if(!started||gameOver||waitingForUpgrade||shop.isOpen||dying>0) return;
  const next=force===undefined?!paused:force;
  if(next===paused) return;
  paused=next;
  // Пауза — тоже «не играет»: площадка не должна считать боем стоящий мир.
  // Музыку здесь НЕ глушим намеренно: на паузе открыта панель громкости, и
  // её ползунки настраиваются на слух.
  if(paused) platform.gameplayStop(); else platform.gameplayStart();
  document.getElementById("pauseBtn").classList.toggle("paused",paused);
  // Пауза БЫЛА пустым экраном с надписью — а это ровно тот момент, когда
  // игрок хочет что-нибудь подкрутить. Панель звука открывается вместе с
  // паузой и закрывается вместе с ней: отдельная кнопка «настройки» посреди
  // боя была бы ещё одним элементом, который надо найти.
  showSettings(paused);
}

// ПАНЕЛЬ ЗВУКА. Одна на два места: её открывает кнопка со стартового экрана
// и она же появляется на паузе. Своего состояния у неё нет — она только
// показывает то, что уже лежит в SettingsSystem.
function showSettings(on){
  document.getElementById("settingsPanel").classList.toggle("hidden",!on);
  if(on) syncSettings();
}

function syncSettings(){
  for(const [kind,el,val] of SLIDERS){
    const pct=Math.round(settings.values[kind]*100);
    el.value=pct; val.textContent=pct;
    // Ноль — это выключено, и это должно читаться, а не вычисляться по
    // положению ручки
    el.closest(".vol-row").classList.toggle("off",pct===0);
  }
}

// ВКЛАДКУ СВЕРНУЛИ — ЗАБЕГ НА ПАУЗЕ. На телефоне это не редкость, а обычное
// дело: пришло сообщение, позвонили, погас экран. Кадры при этом не идут
// (браузер не зовёт requestAnimationFrame), то есть мир и так стоит, — но
// возвращается игрок в НЕОСТАНОВЛЕННЫЙ бой, посреди толпы, которая уже
// вплотную. Пауза даёт ту секунду, за которую он успевает понять, где он.
//
// Снимать паузу при возвращении НЕЛЬЗЯ: снимает её игрок, когда готов.
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    togglePause(true);
    // СВЁРНУТАЯ ИГРА НЕ ЗВУЧИТ. Это требование площадки, и оно же простая
    // вежливость: кадры на свёрнутой вкладке не идут, а <audio> и синтез
    // спокойно играют дальше — из свёрнутой вкладки в наушники.
    audio.suspend(true);
    platform.gameplayStop();
  }else if(!advSuspend){
    // Возврат: звук отмерзает там же, где остановился. Рекламный блок —
    // исключение: вкладка снова видна, но ролик ещё идёт.
    audio.suspend(false);
  }
});
window.addEventListener("blur",()=>togglePause(true));

// Ушли с прилавка — мир снова идёт. Отдельным колбэком, потому что закрыть
// лавку может и кнопка «В БОЙ», и опустевший ассортимент.
shop.onClose=()=>{ paused=false; syncHud(); };

// ВЫБРОС СПОР — единственное активное действие игрока. Проверки состояния
// стоят здесь, а не в BattleSystem: на паузе, в меню прокачки и в кадрах
// смерти мир не обновляется, и удар без движения врагов был бы бесплатным.
function tryBurst(){
  if(!started||gameOver||paused||waitingForUpgrade||shop.isOpen||dying>0) return;
  if(!battle.sporeBurst(player,camera)){
    // Отказ обязан звучать. Молчащая кнопка читается как «игра не заметила
    // нажатия», и игрок жмёт её ещё трижды вместо того, чтобы уходить.
    audio.sfx("hit",0.4);
    return;
  }
  syncHud();
}

// Звук, отвалившийся уже после запуска, обязан вернуть игру к синтезу:
// загрузчик отдаёт элемент сразу и об ошибке узнаёт позже (см. loadSound).
loader.onSoundError=(key)=>audio.soundLost(key);

(async()=>{
  await loader.loadAll(CONFIG.assets);
  // ИГРА ГОТОВА — площадка снимает свой экран загрузки. Раньше этого вызова
  // нет ничего осмысленного: картинок нет, стартовый экран стоял бы пустым.
  platform.ready();
})();

// SDK площадки поднимаем ОТДЕЛЬНО от ассетов и не ждём его нигде: ответит —
// появятся реклама, отсчёт геймплея и своё хранилище; не ответит (свой адрес,
// блокировщик, оборванная сеть) — игра идёт ровно так же.
platform.boot();

// ХРАНИЛИЩЕ ПЛОЩАДКИ ПРИШЛО ПОЗЖЕ ПЕРВОГО ЧТЕНИЯ. Рекорд, банк и громкости
// читаются на первом кадре — до SDK, — и на iPhone внутри чужого iframe это
// чтение возвращает пустоту (см. engine/store.js). Пришло настоящее
// хранилище — перечитываем всё и обновляем стартовый экран: иначе игрок,
// у которого всё сохранено, видит «рекорда нет» и запертых персонажей.
Store.onSwap=()=>{
  if(started) return;      // посреди забега менять правила нельзя
  meta.reload();
  // Порядок важен: сложность приходит из меты, а рекорд у каждой сложности
  // свой. setScope при совпадении ключа выходит сразу и НЕ перечитывает —
  // поэтому reload отдельной строкой, а не «и так сработает».
  records.setScope(meta.difficulty);
  records.reload();
  settings.reload();
  syncSettings(); showBest(); showDiff(); showMeta();
};

// ШРИФТ ДЛЯ ХОЛСТА ГРУЗИМ ЯВНО. Браузер подтягивает woff2 лениво — когда
// текст этим шрифтом впервые понадобился РАЗМЕТКЕ. Холст в этот учёт не
// входит: если файл ещё не пришёл, canvas молча нарисует системным, и первые
// цифры урона в забеге будут другим шрифтом. Подмножества раздельные, поэтому
// просим обе буквы — латинскую и кириллическую.
document.fonts?.load('16px "Tiny5"', "0A");
document.fonts?.load('16px "Tiny5"', "Я");

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
// Лавка ждёт своей очереди: она не должна открываться ни поверх меню
// прокачки, ни посреди боя с боссом (см. maybeOpenShop).
let shopDue=false, nextShopAt=CONFIG.shop.every;
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
// Уровни, за которые прокачка ещё не взята. Меню открывает игрок сам
// (см. startLevelUp), поэтому счётчик может расти до любого числа.
let pendingUpgrades=0;
// Кадры, оставшиеся до экрана поражения. Пока счётчик тикает, мир стоит и
// доигрывает только анимация смерти: раньше экран появлялся в тот же кадр,
// когда HP уходило в ноль, и нарисованную смерть никто ни разу не видел.
let dying=0;
// ПОБЕДА. Последний босс мёртв, но экран итогов ждёт: секунды на то, чтобы
// увидеть, как он разваливается, и услышать тишину после боя. Ноль — забег
// идёт как шёл. Считается ровно так же, как dying, и по той же причине:
// событие, которого никто не увидел, всё равно что не случилось.
let winning=0;
// Сколько раз за забег сказана подсказка про кнопку прокачки (0, 1 или 2) и
// брал ли игрок хоть одну карточку. Второе нужно, чтобы отличить «не понял
// кнопку» от «копит нарочно»: см. startLevelUp.
let upgradeHintShown=0, upgradeUsed=false;
const WIN_DELAY=2.2;            // секунд между смертью последнего босса и итогом
// Сам последний босс — по нему и определяется победа. Ссылка, а не флаг:
// проверять надо «мёртв ли ОН», а не «пусто ли поле».
let finalBoss=null;
// Смена биома: какой показан сейчас и какой ждёт объявления. Ждать приходится
// потому, что надпись под таймером одна на всех, а правило стычки важнее
// (см. checkBiome).
let biomeShown=null, biomePending=null;
// Объявление о переходе заражения через порог и задержка, чтобы оно не мигало
// у самой границы (см. checkBiome).
let sporePending=null, sporeCooldown=0;
let bannerBusy=0;               // секунд, пока надпись под таймером занята
const BANNER_TIME=2.5;          // столько живёт анимация push-banner в CSS

function init(){
  // Персонаж берётся из меты в момент создания игрока, а не запоминается
  // отдельно: рестарт по «R» обязан выдать того же, кого выбрали на стартовом
  // экране, а смена выбора — нового с ближайшего забега.
  // Постоянная прокачка приходит ЧИСЛАМИ и застывает здесь же, в конструкторе:
  // купленное на стартовом экране применяется со следующего забега, а не
  // посреди идущего.
  player=new Player(0,0,meta.current(),meta.bonus());
  // Игрок сам не знает про камеру и звук — обратную связь на урон вешаем здесь
  player.onHurt=(amount,kind)=>{
    if(kind==="shield"){ audio.sfx("shield"); return; }
    audio.sfx("hurt");
    camera.shake(CONFIG.feel.shakeHurt,12);
    particles.emitText(player.x,player.y-player.radius-10,"-"+Math.round(amount),"#ff5566",15);
  };
  camera.centerOn(player);
  enemies=[]; projectiles=[]; loot.reset(); particles.reset(); battle.reset();
  runTime=0; pendingUpgrades=0; dying=0; winning=0; finalBoss=null;
  upgradeHintShown=0; upgradeUsed=false;
  // Биом сбрасывается вместе с забегом: без этого рестарт из костяной гнили
  // объявлял бы «МШИСТАЯ НИЗИНА» на первой же секунде нового забега.
  biomeShown=map.biome(0); biomePending=null; bannerBusy=0;
  sporeNoteShown=null; sporePending=null; sporeCooldown=0;
  // Сложность фиксируется в момент создания забега и дальше не меняется:
  // см. комментарий у конструктора SpawnSystem.
  spawnSystem=new SpawnSystem(camera,meta.curDiff());
  shop.reset(); shopDue=false; nextShopAt=CONFIG.shop.every;
  gameOver=false; paused=false; waitingForUpgrade=false;
  // Рестарт с экрана итогов — это снова геймплей. init() зовётся и до
  // стартового экрана (мир нужен нарисованным под ним), поэтому по `started`:
  // там ещё никто не играет.
  if(started) platform.gameplayStart();
  // Значок паузы обязан вернуться в исходное вместе с забегом: игрок мог
  // умереть на паузе, и следующий забег начался бы с кнопкой «играть».
  document.getElementById("pauseBtn").classList.remove("paused");
  document.getElementById("gameOverScreen").classList.add("hidden");
  // HUD показываем только в начатом забеге. init() зовётся и до старта — мир
  // нужен нарисованным за стартовым экраном, — но шкалы поверх названия там не
  // нужны, а при смене персонажа init() зовётся оттуда же ещё раз.
  document.getElementById("ui").classList.toggle("hidden",!started);
  upgradeSystem.hideMenu();
}

window.addEventListener("upgradeChosen",(e)=>{
  const card=upgradeSystem.applyUpgrade(e.detail,player);
  upgradeUsed=true;
  if(card?.category==="evolution") announceEvolution(card);
  pendingUpgrades=Math.max(0,pendingUpgrades-1);
  // Накоплено несколько уровней — показываем следующую тройку СРАЗУ, не
  // выходя в бой. Игрок нажал кнопку именно для того, чтобы разобраться с
  // прокачкой целиком; заставлять его жать её трижды подряд, каждый раз с
  // возвратом в бой, значило бы вернуть ту же дёрганность, только руками.
  if(pendingUpgrades>0){
    upgradeSystem.showMenu(upgradeSystem.generateCards(player),player);
    syncHud();
    return;
  }
  upgradeSystem.hideMenu();
  waitingForUpgrade=false; paused=false;
  syncHud();
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
    if(--dying<=0) endGame(false);
    return;
  }

  // ПОБЕДА. Последний босс убит — забег кончился, но экран итогов ждёт: игрок
  // обязан увидеть, как эта туша разваливается, и услышать, что стало тихо.
  // Мир при этом стоит (как и на смерти), доигрывают только частицы: отставшие
  // враги, догрызающие победителя на экране итогов, отменяли бы саму победу.
  if(winning>0){
    winning-=dt;
    particles.update();
    battle.updateEffects();
    map.update(camera);
    camera.follow(player);
    syncHud();
    if(winning<=0) endGame(true);
    return;
  }

  // ОСТАНОВКА КАДРА. Мир стоит, кадр по-прежнему рисуется (draw живёт отдельно
  // от update), поэтому вспышка и кольцо на месте удара успевают отпечататься.
  // Счётчик крутится ЗДЕСЬ, а не в бою: бой не знает ни про паузу, ни про
  // смерть игрока, ни про меню — а останавливать поверх них нечего.
  if(battle.hitStop>0){ battle.hitStop--; return; }

  runTime+=dt;

  // ЛАВКА. Время считается от начала забега (волн нет, единица прогресса —
  // секунды), но открывается она не по секундомеру, а при первой удобной
  // возможности: см. maybeOpenShop.
  if(runTime>=nextShopAt){ shopDue=true; nextShopAt+=CONFIG.shop.every; }
  if(shopDue&&maybeOpenShop()) return;

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
    // ПОСЛЕДНИЙ БОСС ОБЪЯВЛЕН ИМЕНЕМ. Рядовые выходят молча — их узнают по
    // размеру, — но этот кончает забег, и спутать его с четвёртым по счёту
    // выходом по таймеру нельзя.
    if(spawnEvent.final){
      finalBoss=spawnEvent.boss;
      showBanner(spawnEvent.name||spawnEvent.boss.name);
      camera.shake(CONFIG.feel.shakeBoss*1.5,60);
    }
  } else if(spawnEvent&&spawnEvent.type==="push"){
    announcePush(spawnEvent.mod);
  } else if(spawnEvent&&spawnEvent.type==="final_warn"){
    // ПРЕДУПРЕЖДЕНИЕ О ФИНАЛЕ говорится там, куда игрок УЖЕ смотрит, — под
    // таймером, в той же очереди, что правило стычки и смена биома. Иначе
    // конец забега станет сюрпризом, а к финальному бою хочется прийти
    // готовым: добрать уровень, потратить монеты, сбить заражение.
    showBanner("ПОСЛЕДНЯЯ МИНУТА");
    audio.sfx("wave");
    camera.shake(CONFIG.feel.shakeLevel,10);
  }

  checkBiome(dt);

  // МУЗЫКА ПО СОСТОЯНИЮ, а не по событию. Босса можно не только выпустить, но
  // и добить, и пережить его появление на паузе, и увидеть второго до смерти
  // первого — переключать трек «на выход босса» значило бы ловить все эти
  // случаи по отдельности и один обязательно забыть. Спрашивать состояние
  // каждый кадр дешевле: повторный вызов с тем же именем ничего не делает.
  audio.music(enemies.some(e=>!e.dead&&e instanceof Boss)?"boss":"run");

  battle.update(dt,{player,enemies,projectiles,sporeEffects,camera});
  // Опыт даёт не смерть врага, а подобранный предмет
  if(loot.update(player,camera)) startLevelUp();

  particles.update();
  map.update(camera);              // кадры анимации и список видимых декораций
  map.applyHazards(dt,player,enemies,particles);   // кислотные лужи жгут всех
  syncHud();

  if(player.hp<=0) beginDeath();
  else if(finalBoss&&finalBoss.dead) beginWin();
}

// Открыть лавку, если сейчас подходящий момент. Возвращает true, если
// открыли, — тогда кадр на этом заканчивается: мир уже на паузе.
//
// Момент неподходящий ровно в одном случае — на поле босс. Пауза с меню
// посреди боя, который и есть событие забега, ломает его надвое; лавка
// подождёт до смерти босса, благо она уже «должна» и никуда не денется.
function maybeOpenShop(){
  if(enemies.some(e=>!e.dead&&e instanceof Boss)) return false;
  shopDue=false; paused=true;
  shop.open(player);
  return true;
}

function beginDeath(){
  if(dying>0) return;
  player.startDeath();
  dying=player.deathDuration();
  audio.sfx("hurt"); audio.sfx("boom");
  camera.shake(CONFIG.feel.shakeBoss,30);
  particles.emit(player.x,player.y,"#6b2d5c",30,1,5);
}

// ПОБЕДА. Зеркало beginDeath: то же ожидание перед экраном итогов, только
// повод обратный.
//
// Музыка глушится СРАЗУ, а не на экране итогов: боссовая тема, продолжающая
// бить над развалившимся боссом, съедает единственную тишину, которая в этой
// игре что-то значит. Своего трека у победы нет — и пусть лучше не будет
// никакого, чем чужой (то же решение, что с темой смерти, см. HANDOFF).
function beginWin(){
  if(winning>0||gameOver) return;
  winning=WIN_DELAY;
  audio.music(null);
  audio.sfx("evolve"); audio.sfx("boom");
  camera.shake(CONFIG.feel.shakeBoss*1.4,50);
  particles.emit(finalBoss.x,finalBoss.y,"#ffd24a",44,1.6,7);
}

// ПРАВИЛО СТЫЧКИ ОБЪЯВЛЕНО: оно меняет то, что убивает, поэтому со звуком и
// толчком камеры — в отличие от смены биома, которая меняет только вид.
function announcePush(mod){
  showBanner(mod.name);
  audio.sfx("wave");
  camera.shake(CONFIG.feel.shakeLevel,8);
}

// СМЕНА БИОМА. Земля, цвет темноты и цвет света меняются разом
// (CONFIG.map.biomes), но всё это — фон, и человек, занятый толпой, замечает
// его не сразу. Название говорит прямо: место сменилось.
//
// Правило стычки при этом ВСЕГДА важнее: оно меняет то, что убивает, а биом —
// то, как выглядит. Поэтому объявление биома не перебивает надпись, а ждёт
// своей очереди (bannerBusy) — две надписи в одной точке экрана иначе
// затирают друг друга, и обе проходят молча.
function checkBiome(dt){
  if(bannerBusy>0) bannerBusy-=dt;
  const b=map.biome(runTime);
  if(b!==biomeShown){
    // Первый биом забега не объявляется: он не сменился, он просто есть.
    if(biomeShown) biomePending=b;
    biomeShown=b;
  }
  if(sporeCooldown>0) sporeCooldown-=dt;
  // ОЧЕРЕДЬ НАДПИСЕЙ. Место под таймером одно, а сказать хотят трое: правило
  // стычки (оно важнее всех — меняет то, что убивает), смена биома и переход
  // заражения через порог. Правило перебивает, эти двое ждут.
  //
  // Заражение вперёд биома: биом — это про вид, заражение — про то, что с
  // игроком прямо сейчас происходит.
  if(sporePending&&bannerBusy<=0&&sporeCooldown<=0){
    showBanner(sporePending.call);
    audio.sfx("wave",0.45);
    sporePending=null;
    // Порог можно переходить туда-сюда (антидот сбивает шкалу мгновенно), и
    // без задержки объявление мигало бы у границы. Шесть секунд — заметно
    // дольше, чем длится колебание у порога.
    sporeCooldown=6;
  } else if(biomePending&&bannerBusy<=0){
    showBanner(biomePending.name||"");
    audio.sfx("wave",0.5);
    biomePending=null;
  }
}

// Надпись под таймером. Класс снимается и вешается заново намеренно: без
// этого CSS-анимация не проигрывается второй раз, и второе объявление
// подряд прошло бы молча — то есть ровно тот случай, ради которого
// объявление и заведено.
function showBanner(text){
  const el=document.getElementById("pushBanner");
  // Точка-разделитель приклеивается к предыдущему слову неразрывным пробелом.
  // На узком экране надпись переносится (иначе её обрезало бы краем), и без
  // этого «·» повисала в начале новой строки, читаясь как опечатка.
  el.firstElementChild.textContent=text.replace(/ · /g," · ");
  el.classList.add("hidden");
  void el.offsetWidth;              // перезапуск анимации
  el.classList.remove("hidden");
  bannerBusy=BANNER_TIME;
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
// ПОЛУЧЕН УРОВЕНЬ — НО МЕНЮ БОЛЬШЕ НЕ ОТКРЫВАЕТСЯ САМО.
//
// Раньше уровень мгновенно останавливал игру и разворачивал карточки на весь
// экран. В начале забега уровни идут часто, и живая игра показала, во что это
// превращается, дословно: «уровень на начальных очень быстрый, и вот
// постоянно прокачка выскакивает на весь экран и отрывает от игры».
//
// Дело не в самой паузе — выбор карточки её стоит, — а в том, КТО выбирает
// момент. Игра выдёргивала игрока из манёвра, который он вёл: за секунду до
// этого он уходил от волка, а теперь читает три карточки и, вернувшись,
// обнаруживает волка вплотную.
//
// Теперь уровни КОПЯТСЯ (pendingUpgrades), а меню открывает сам игрок кнопкой
// в углу или клавишей «E». Три накопленных уровня — три выбора подряд, и все
// в тот момент, который выбрал он. Сам выбор не изменился: те же три карточки
// и та же остановка мира на время меню.
function startLevelUp(){
  particles.emit(player.x,player.y,"#00d4aa",26,1,5);
  particles.emitText(player.x,player.y-player.radius-16,
                     "УРОВЕНЬ "+player.level,"#7dffca",17);
  audio.sfx("levelup"); camera.shake(CONFIG.feel.shakeLevel,10);
  pendingUpgrades++;
  // ПЕРВЫЙ УРОВЕНЬ ЗАБЕГА ГОВОРИТСЯ СЛОВАМИ, и ровно один раз.
  //
  // Меню прокачки открывает игрок сам (это чинили по живому новичку, которого
  // выдёргивало из манёвра) — но взамен появилась дыра: игра ждёт нажатия
  // кнопки, о которой не сказала ни разу. Кнопка загорается в левом нижнем
  // углу и пульсирует, а смотрят в бою в середину экрана и на таймер. Ровно
  // то же наблюдение, что с заражением: объяснение работает там, куда игрок
  // УЖЕ смотрит.
  //
  // Дальше молчим: второй и третий уровни приходят через полминуты, и
  // повторять подсказку — значит превращать её в шум.
  //
  // Второй раз подсказка повторяется РОВНО ОДИН раз и только по доказательству
  // того, что первую не поняли: три накопленных уровня, из которых не взят ни
  // один. Замер первой минуты показал, что к 60-й секунде их как раз три —
  // то есть игрок, пропустивший надпись, идёт дальше без прокачки вообще, и
  // это не «его выбор», а непонятая кнопка. Дальше — молчим в любом случае.
  if(!upgradeHintShown||(!upgradeUsed&&pendingUpgrades===3&&upgradeHintShown===1)){
    upgradeHintShown=upgradeHintShown?2:1;
    showBanner(input.isMobile?"ПРОКАЧКА ГОТОВА · КНОПКА СЛЕВА":"ПРОКАЧКА ГОТОВА · КЛАВИША E");
  }
  syncHud();
}

// Открыть накопленное. Зовётся кнопкой и клавишей, поэтому все проверки
// состояния здесь: посреди лавки, смерти и уже открытого меню открывать
// нечего.
function openUpgradeMenu(){
  if(!started||gameOver||dying>0||winning>0||waitingForUpgrade||shop.isOpen) return;
  if(pendingUpgrades<=0){
    // Пустая кнопка обязана звучать отказом — молчание читается как «игра не
    // заметила нажатие», и её жмут ещё трижды
    audio.sfx("hit",0.4);
    return;
  }
  waitingForUpgrade=true; paused=true;
  // Панель звука с паузы здесь мешала бы: два окна поверх одного мира
  showSettings(false);
  upgradeSystem.showMenu(upgradeSystem.generateCards(player),player);
}

// Экран итогов. won — дошёл ли забег до конца: у победы и у поражения одни и
// те же цифры, но разные заголовок, цвет и музыка. Двух экранов не заводим —
// итог у забега один, меняется только то, чем он кончился.
function endGame(won=false){
  player.hp=won?player.hp:0; gameOver=true; dying=0; winning=0;
  shop.reset();
  platform.gameplayStop();
  // СВОЙ ТРЕК НА ЭКРАНЕ ИТОГОВ. Здесь была тишина, и она была правильной:
  // тема забега, продолжающая бодро играть над «СПОРЫ ПОБЕДИЛИ», отменяет
  // собой всё, что этот экран говорит. Отдельная тема смерти — не то же
  // самое: она про конец, а не про бой, играет один раз и затихает
  // (MUSIC_LOOP в audio.js). Файла нет — снова тишина, а не подмена темой
  // забега (NO_FALLBACK там же).
  //
  // У ПОБЕДЫ ТРЕКА НЕТ, и тема смерти ей не подходит по смыслу: она про
  // «споры победили». Пока автор не сделает тему победы, здесь тишина —
  // ровно по тому же правилу, по которому её однажды оставили на смерти.
  // «victory» — трека ещё нет, и это не забывчивость: пока файла нет, играет
  // ТИШИНА (NO_FALLBACK в audio.js), а не тема забега и не тема смерти. Как
  // только файл ляжет в CONFIG.assets.sounds, эта же строка его и заиграет.
  audio.music(won?"victory":"death");
  // Заголовок и цвет экрана. Иллюстрация с проросшим противогазом на победе
  // прячется классом `won`: она говорит обратное тому, что говорит заголовок.
  const over=document.getElementById("gameOverScreen");
  over.classList.toggle("won",won);
  document.getElementById("overTitle").textContent=won?"СУМРАК РАССЕЯН":"СПОРЫ ПОБЕДИЛИ";
  document.getElementById("overLead").textContent=won?"Прошёл за":"Продержался";
  // Счётчик убитых переехал сюда с игрового экрана: в бою на него не
  // смотрят, а на экране итогов он как раз и есть итог. Монет показываем
  // СОБРАННЫЕ за забег, а не оставшиеся в кошельке: итог — это сколько ты
  // добыл, а не сколько не успел потратить.
  document.getElementById("finalLevel").textContent=player.level;
  document.getElementById("finalKills").textContent=battle.kills;
  document.getElementById("finalCoins").textContent=player.coinsEarned;
  // В БАНК УХОДИТ ТОЛЬКО НЕПОТРАЧЕННОЕ. Монета, вложенная в лавку, работала в
  // этом забеге — если бы в банк шло заработанное, выгодной стратегией стало
  // бы не покупать ничего и умирать пораньше.
  const banked=meta.deposit(player.coins);
  const bankedLine=document.getElementById("bankedLine");
  bankedLine.classList.toggle("hidden",!banked);
  if(banked){
    document.getElementById("bankedCoins").textContent=banked;
    document.getElementById("bankTotal").textContent=meta.bank;
  }
  // Рекорд подаётся ПОСЛЕ цифр забега: сначала «сколько получилось», потом
  // «лучше ли, чем раньше». Обратный порядок читается как упрёк.
  // ПОБЕДА ОТКРЫВАЕТ СЛЕДУЮЩУЮ СЛОЖНОСТЬ — и обязана об этом сказать. Молча
  // открытая ступень равна неоткрытой: игрок закрыл экран итогов и никогда не
  // узнал, что игра стала другой.
  const opened=won?meta.beat(meta.difficulty):null;
  const unlockLine=document.getElementById("unlockedLine");
  unlockLine.classList.toggle("hidden",!opened);
  if(opened){
    document.getElementById("unlockedName").textContent=meta.diffDef(opened).name;
  }
  const beaten=records.submit({time:runTime,level:player.level,kills:battle.kills,won});
  document.getElementById("newRecord").textContent=
    beaten&&won&&!records.prev?.won?"ЗАБЕГ ПРОЙДЕН":"НОВЫЙ РЕКОРД";
  document.getElementById("newRecord").classList.toggle("hidden",!beaten);
  const prev=records.prev;
  const prevLine=document.getElementById("prevBest");
  prevLine.classList.toggle("hidden",beaten||!prev);
  if(prev) document.getElementById("prevBestTime").textContent=recordText(prev);
  showBest();
  document.getElementById("finalTime").textContent=formatTime(runTime);
  document.getElementById("gameOverScreen").classList.remove("hidden");
  // Боевой HUD на экране итогов не нужен: таймер и шкалы просвечивали
  // сквозь затемнение и спорили с итоговыми цифрами
  document.getElementById("ui").classList.add("hidden");
}

// Как читается рекорд. Пройденный забег и погибший меряются РАЗНЫМ: у первого
// достижение в том, ЗА СКОЛЬКО он пройден, у второго — сколько продержался.
// Одна и та же строка «14:12» значила бы в этих двух случаях противоположное.
function recordText(b){
  return b.won?("пройден за "+formatTime(b.time)):formatTime(b.time);
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
for(const id of ["xpBar","levelDisplay","timeDisplay","hpBar","sporeBar","burstBtn",
                 "coinDisplay","sporeNote","burstNotch","upgradeBtn","upgradeCount"]){
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
  const S=CONFIG.sporeSystem;
  fillBar(HUD.sporeBar,player.sporeLevel/S.maxSpore);
  sporeRow.classList.toggle("critical",player.sporeLevel>=S.thresholds.danger);
  // Кнопка выброса гаснет, пока шкалы не хватает на его цену. Это не украшение:
  // цена ресурса должна читаться до нажатия, иначе трата остаётся сюрпризом.
  HUD.burstBtn.classList.toggle("dim",!player.canBurst());
  // ...но одного «гаснет» мало. Заражение подходит к цене и откатывается
  // назад по нескольку раз за забег — подобранный антидот сбивает шкалу
  // мгновенно, — и снаружи это читается как «кнопка то работает, то нет».
  // Заливка отвечает на вопрос «сколько ещё»: она и есть накопленная доля
  // цены. На перезарядке (полсекунды после удара) заряда нет вовсе.
  // Заливка показывает ЗАПАС, а не готовность: сразу после удара спор
  // остаётся больше цены (30 из 64), и обнулённая заливка врала бы — «всё
  // потратил», хотя следующий выброс уже почти оплачен. Полсекунды
  // перезарядки поверх этого показывает погасшая кнопка.
  const charge=Math.min(1,player.sporeLevel/player.burstCost());
  HUD.burstBtn.style.setProperty("--charge",charge.toFixed(3));
  // Насечка на шкале стоит там же, где цена выброса. Ставится отсюда, а не
  // числом в CSS: подешевей когда-нибудь выброс — и метка уехала бы врать.
  HUD.burstNotch.parentElement.style.setProperty("--notch",
    (player.burstCost()/S.maxSpore).toFixed(3));
  // Кнопка прокачки: есть что взять — она появляется и пульсирует. Число
  // показываем только когда уровней несколько: «1» рядом с одной кнопкой
  // ничего не сообщает.
  HUD.upgradeBtn.classList.toggle("hidden",pendingUpgrades<=0);
  HUD.upgradeBtn.classList.toggle("single",pendingUpgrades<=1);
  // Один уровень — восклицательный знак, несколько — их число. «1» рядом с
  // одной кнопкой не сообщает ничего, а знак читается как «тебе тут дали» с
  // того же расстояния, с какого видно саму кнопку.
  HUD.upgradeCount.textContent=pendingUpgrades>1?pendingUpgrades:"!";
  syncSporeNote();
  // Кошелёк. Единственная цифра, вернувшаяся на боевой экран, — и только
  // потому, что теперь она означает «хватит ли на прилавке»
  HUD.coinDisplay.textContent=player.coins;
}

// ЧТО ДЕЛАЕТ ЗАРАЖЕНИЕ — вслух, под шкалой.
//
// Это главная механика игры, и до этой строки она нигде не была названа:
// шкала росла сама, враги от неё ускорялись, лут становился щедрее, на
// критическом капал урон — и всё молча. Игрок видел растущую полоску и не
// знал ни что она делает, ни что с ней делать. Механику, которую нельзя
// прочитать, игрок не использует: он её терпит.
//
// Текст берётся из тех же порогов, по которым считаются эффекты
// (CONFIG.sporeSystem.thresholds/effects), поэтому разъехаться с правдой он
// не может — поменяются числа, поменяется и подпись.
// text — постоянная подпись под шкалой, call — объявление под таймером в
// момент перехода. Второе появилось после живой игры: подпись под шкалой
// новый игрок НЕ ЗАМЕЧАЕТ вовсе — «даже не видела эту надпись, потому что
// играла и была сосредоточена на игре». Смотрят в середину экрана и на
// таймер, туда и надо говорить; подпись под шкалой остаётся справочником,
// который можно перечитать в любой момент.
const SPORE_NOTES=[
  { at: 0,  text: "Заражение растёт само", call: null },
  { at: 25, text: "Лут щедрее, враги быстрее", call: "ЗАРАЖЕНИЕ 25% · ЛУТ ЩЕДРЕЕ" },
  { at: 50, text: "Лут вдвое, враги злее",    call: "ЗАРАЖЕНИЕ 50% · ЛУТ ВДВОЕ, ВРАГИ ЗЛЕЕ" },
  { at: 75, text: "Втрое лут, но заражение жжёт", hot: true,
    call: "ЗАРАЖЕНИЕ 75% · ВТРОЕ ЛУТ, НО ОНО ЖЖЁТ" }
];
let sporeNoteShown=null;
function syncSporeNote(){
  const T=CONFIG.sporeSystem.thresholds;
  const lvl=player.sporeLevel;
  // Пороги те же, что у эффектов: safe/warning/danger — границы, за которыми
  // включается следующая запись CONFIG.sporeSystem.effects
  let note=SPORE_NOTES[0];
  if(lvl>=T.danger) note=SPORE_NOTES[3];
  else if(lvl>=T.warning) note=SPORE_NOTES[2];
  else if(lvl>=T.safe) note=SPORE_NOTES[1];
  if(note===sporeNoteShown) return;      // строка меняется на порогах, а не каждый кадр
  // Порог перейден — говорим об этом туда, куда игрок смотрит. Первый показ
  // за забег (sporeNoteShown === null) не объявляем: это не переход, это
  // начальное состояние.
  // Кладём в очередь САМ ПОРОГ, а не готовую строку, и кладём при каждой
  // смене: если порогов сменилось два, пока надпись была занята, показать
  // надо последний. Иначе игрок увидит объявление о состоянии, которого у
  // него уже нет.
  if(sporeNoteShown&&note.call) sporePending=note;
  sporeNoteShown=note;
  HUD.sporeNote.textContent=note.text;
  HUD.sporeNote.classList.toggle("hot",!!note.hot);
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

// ГЛУБИНА. Всё, что СТОИТ на земле, рисуется в одном порядке — снизу вверх по
// точке касания с землёй. Иначе не работает единственный признак объёма,
// который есть у вида сверху: кто ближе к камере, тот поверх.
//
// Что было: декорации рисовались отдельным слоем ПОД всеми существами, и
// игрок, зашедший за ствол дерева, оказывался нарисован на дереве, а не за
// ним. Заметно это стало сразу, как только у декораций появился рост.
//
// Точка касания у декорации — её y (drawProp рисует картинку от основания
// вверх), у существа — центр его тени, то есть y плюс доля радиуса. Берём
// ровно ту же формулу, что и тень: если объекты сортировать по одному месту,
// а тень рисовать в другом, порядок и тень начнут спорить друг с другом.
//
// Летящее в этот список не входит: снаряды, облака спор и частицы идут поверх
// всего. Они в воздухе, и своей точки касания у них нет.
const DEPTH=[];
function footY(o){ return o.y+(o.radius||0)*0.8; }
function drawByDepth(){
  DEPTH.length=0;
  for(const d of map.standingProps()) DEPTH.push(d);
  for(const e of enemies) if(!e.dead) DEPTH.push(e);
  DEPTH.push(player);
  DEPTH.sort((a,b)=>footY(a)-footY(b));
  for(const o of DEPTH){
    // Декорация — это не сущность, у неё нет draw(): у неё есть def с
    // картинкой. Различаем по нему, а не по instanceof: заводить общий
    // базовый класс ради одного признака в отрисовке незачем.
    if(o===player) player.draw(renderer);
    else if(o.def&&o.def.image) map.drawOneProp(renderer,o);
    else o.draw(renderer);
  }
}

function draw(){
  renderer.clear();
  renderer.playerX=player.x; renderer.playerY=player.y;

  // --- мировой слой: всё внутри begin/end сдвигается камерой ---
  renderer.begin();
  map.drawGround(renderer,runTime);           // земля, тропы и пятна биомов
  map.drawFlatDecor(renderer);                // кислотные лужи лежат на земле
  map.drawEdge(renderer);                     // мрак на границе арены
  battle.drawFields(renderer);                // живые грибницы лежат на земле
  loot.draw(renderer);
  drawByDepth();                  // деревья, враги и игрок — по глубине
  for(const p of projectiles) p.draw(renderer);
  battle.drawShots(renderer);     // облака спор трубачей
  battle.drawRings(renderer);     // споровые кольца финала — поверх толпы
  particles.draw(renderer);
  battle.drawEffects(renderer);   // взрывы поверх всего
  // Имя и полоса босса — интерфейс, а не часть мира: их не должно закрывать
  // ничем. Своё же облако спор Материнской Капли ложилось прямо на имя, и в
  // кадре оставалось «Мат…апля» — см. Boss.drawLabel.
  for(const e of enemies) e.drawLabel?.(renderer);
  renderer.end();

  // --- экранный слой: интерфейс и джойстик не ездят вместе с миром ---
  // Темнота идёт первой: она гасит мир, но не должна гасить виньетку,
  // красную рамку урона и джойстик
  // Туман — правило стычки: круг света сжимается на время натиска
  map.drawDarkness(renderer,player,spawnSystem?.modMult("fog"));
  map.drawVignette(renderer);
  drawHurtVignette();
  input.drawJoystick(renderer);

  if(paused&&!waitingForUpgrade&&!gameOver){
    renderer.drawOverlay(0.55);
    // Надписи масштабируются вместе с холстом: на телефоне холст заметно
    // меньше 900 пикселей, и кегль в 46px занял бы половину экрана
    const k=Math.min(1.4,Math.max(0.55,canvas.width/CONFIG.screen.width));
    renderer.drawText("ПАУЗА",canvas.width/2,canvas.height/2,
      {font:Math.round(46*k)+"px "+CONFIG.fontFamily,color:"#00d4aa",align:"center"});
    // Подсказка обязана называть ту дверь, которая у игрока есть: на телефоне
    // клавиши Esc нет вовсе, и надпись про неё оставляла паузу тупиком —
    // ровно тем же, каким был экран смерти с надписью «R — рестарт».
    renderer.drawText(input.isMobile?"кнопка сверху справа — продолжить":"Esc — продолжить",
      canvas.width/2,canvas.height/2+40*k,
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
    // Лавка: проверить её иначе как забегом до 80-й секунды нельзя, а это
    // полторы минуты на одну проверку одного ценника
    shop,
    battle,
    // Частицы: кольца удара и брызги иначе не сосчитать
    particles,
    // Карта: декорации ставятся по хешу клетки из мешка map.bag, то есть
    // случайно и редко. Чтобы посмотреть на одну конкретную (например, на
    // кислотную лужу), мешок проще подменить: GAME.map.bag=["acid_pool"].
    map,
    // Ввод: без него нельзя проверить джойстик иначе как пальцем по телефону
    input,
    // Звук: музыку нельзя ни увидеть на скриншоте, ни услышать в Playwright.
    // Единственный способ проверить, что трек вообще переключился на боссе, —
    // спросить audio.track.
    audio,
    // Мета: банк и персонажи копятся между забегами, то есть проверить их
    // «как игрок» — это несколько забегов подряд. GAME.meta.bank=999 плюс
    // GAME.meta.unlock("ranger") показывает второго персонажа сразу.
    meta,
    // Площадка и хранилище. Обе ветки — «SDK есть» и «SDK нет» — проверяются
    // только прогоном с подставным window.YaGames: увидеть глазами, что
    // реклама вызвалась, а сохранение легло в хранилище площадки, негде.
    platform,
    store:Store,
    // Загрузчик и рисовальщик: без них из прогона нельзя спросить, КАКИМ
    // листом рисуется персонаж, — а именно это и надо проверять, когда у
    // каждого персонажа свои листы и работают откаты.
    loader, renderer,
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
      // Элита теперь не только толще, но и ведёт себя иначе — а поймать её
      // поведение глазами нельзя: она редкая. Считаем её и отложенные взрывы.
      elites:enemies.filter(e=>!e.dead&&e.isMutated).length,
      pending:battle.pending.length,
      // Накопленные уровни: без них «понял ли игрок про кнопку прокачки»
      // прогоном не измерить — а именно этим и меряется первая минута
      upgradesReady:pendingUpgrades,
      drops:loot.items.length,
      fields:battle.fields.length,
      damage:player.damage,
      // Не просто «сколько стволов», а какие именно: эволюция подменяет
      // описание ствола, и по числу её не видно
      weapons:player.weapons.map(w=>w.def.key),
      // ФИНАЛ. Сколько секунд до него, идёт ли он и сколько осталось у
      // последнего босса — иначе про конец забега можно узнать только
      // пятнадцатиминутным прогоном.
      finalIn:Math.round(spawnSystem.finalIn()),
      finalBossHp:finalBoss?Math.round(finalBoss.hp):null,
      winning, won:gameOver&&!!finalBoss&&finalBoss.dead
    }),
    // ПЕРЕМОТКА ЗАБЕГА. Финал наступает на 900-й секунде, и проверить его
    // иначе как пятнадцатиминутным прогоном нельзя — а он в headless идёт
    // раз в десять медленнее реального времени, то есть проверка одного числа
    // стоит два часа. Перемотка двигает ОБА счётчика: runTime (по нему живут
    // лавка, биомы и заражение) и время спавна (по нему — сложность и финал).
    // Сложность при этом становится честной для новой секунды, а вот уровень
    // и стволы остаются как есть: перемотка проверяет конец забега, а не
    // балансирует его.
    // Очередь боссов двигается вместе со временем: иначе перемотка на
    // пятнадцатую минуту немедленно выпускает ПЕРВОГО босса по таймеру, он
    // оказывается жив в секунду финала — и финал честно ждёт его смерти,
    // выглядя как «конец забега не работает».
    jumpTo:(sec)=>{
      runTime=sec; spawnSystem.time=sec;
      spawnSystem.bossesSpawned=Math.floor(sec/CONFIG.spawn.bossEvery);
      nextShopAt=sec+CONFIG.shop.every;
    }
  };
}

// НАЧАЛО ЗАБЕГА. init() зовётся и здесь, до старта: мир нужен нарисованным,
// чтобы за стартовым экраном стояла игра, а не чёрный прямоугольник. Но HUD
// до нажатия «Играть» прячем — показывать шкалы поверх названия незачем.
function startRun(){
  document.getElementById("startScreen").classList.add("hidden");
  showLab(false);
  // Панель звука могла остаться открытой со стартового экрана: в бою она
  // висела бы поверх кадра, ничего при этом не останавливая
  showSettings(false);
  started=true; init();
  // Музыку просим отсюда нарочно: это то самое нажатие, которым браузер
  // разрешает создать звук. Раньше просьбы не было бы слышно вообще.
  audio.music("run");
  // Площадка ведёт свой счёт: где игрок играет, а где стоит в меню. По этим
  // двум вызовам она и решает, можно ли показать рекламу.
  platform.gameplayStart();
  // Остальные треки не качались до этой секунды вовсе (CONFIG.assets.
  // deferSounds): человек, который открыл страницу и закрыл её, не должен
  // платить за музыку, которой не услышал. Здесь забег уже начался — и с
  // задержкой, чтобы боссовый трек не отнимал канал у играющего.
  setTimeout(()=>loader.warmSounds(),(CONFIG.assets.warmDelay??8)*1000);
  // ПЕРВЫЕ СЕКУНДЫ НОВИЧКА. Стрельба и прицел здесь автоматические, и это
  // главное, чего про игру не знают заранее: человек жмёт «Играть» и первые
  // секунды ищет, чем стрелять. На стартовом экране про это написано, но
  // читают его далеко не все — а замер показал, что до пятой секунды на арене
  // всё равно пусто (graceTime), то есть надпись никому не мешает.
  //
  // Показывается ТОЛЬКО тому, кто ещё ни одного забега не закончил: рекорда
  // нет — значит новичок. Заводить для этого отдельный флаг незачем, а
  // повторять подсказку опытному игроку — это шум.
  if(!records.best) showBanner("ОРУЖИЕ БЬЁТ САМО · ТВОЁ ДЕЛО — ХОДИТЬ");
}

// ВОЗВРАТ В МЕНЮ с экрана итогов. Без него банк был бы обещанием, которое
// нельзя получить: стартовый экран показывался ровно один раз за загрузку
// страницы, и чтобы потратить отложенные монеты на персонажа, пришлось бы
// перезагружать вкладку.
function backToMenu(){
  started=false; gameOver=false; audio.music(null);
  platform.gameplayStop();
  document.getElementById("gameOverScreen").classList.add("hidden");
  document.getElementById("startScreen").classList.remove("hidden");
  init();
  showBest(); showMeta(); showDiff();
}
// Рекорд на стартовом экране. Прячется, пока его нет: пустое место честнее
// нулей, которые выглядят как «ты уже играл и продержался ноль».
function showBest(){
  const b=records.best, line=document.getElementById("bestLine");
  line.classList.toggle("hidden",!b);
  if(!b) return;
  document.getElementById("bestTime").textContent=recordText(b);
  document.getElementById("bestLevel").textContent=b.level;
  // Рекорд принадлежит сложности, и это надо назвать: иначе «пройден за 15:01»
  // на первой выглядит как рекорд игры вообще.
  document.getElementById("bestDiff").textContent=meta.curDiff().name;
}

// ВЫБОР ПЕРСОНАЖА И БАНК на стартовом экране.
//
// Ряд собирается заново на каждое нажатие — ровно как прилавок лавки, и по
// той же причине: четыре строки разметки против рассинхрона «на экране одно,
// в памяти другое».
//
// Пока открыт один персонаж и банк пуст, ряда нет вовсе: карточка без выбора
// и цифра «0» ничего не сообщают. Первая же отложенная монета его показывает —
// иначе она пропала бы молча, а это то самое ложное обещание.
// ВЫБОР СЛОЖНОСТИ на стартовом экране. Ряд карточек, тот же вид, что у
// персонажей и у прилавка: игрок уже знает, что карточку жмут.
//
// Ряда нет, пока открыта одна сложность: карточка без выбора ничего не
// сообщает, а «ЗАКРЫТО» рядом с ней на первом же запуске читается как упрёк.
// Первая победа его и показывает — вместе с тем, что она открыла.
function showDiff(){
  const list=meta.diffList();
  const box=document.getElementById("diffBox");
  const visible=list.some(d=>d.unlocked&&d.key!==CONFIG.difficulties.starter);
  box.classList.toggle("hidden",!visible);
  if(!visible) return;
  const row=document.getElementById("diffList");
  row.innerHTML="";
  for(const d of list){
    const div=document.createElement("div");
    div.className="char-card diff"+(d.selected?" on":"")+(d.unlocked?"":" locked");
    div.innerHTML=
      '<div class="title">'+d.def.name+'</div>'+
      '<div class="desc">'+(d.unlocked?d.def.desc:"Пройди предыдущую")+'</div>'+
      (d.beaten?'<div class="done">ПРОЙДЕНО</div>':"");
    div.onclick=()=>{
      const ok=meta.selectDiff(d.key);
      // Закрытая сложность обязана звучать отказом: молчащая карточка
      // читается как «игра не заметила нажатие».
      audio.sfx(ok?"pickup":"hit",ok?1:0.4);
      if(!ok) return;
      // Рекорд принадлежит сложности: переключил — показывай её рекорд.
      records.setScope(meta.difficulty);
      showDiff(); showBest();
    };
    row.appendChild(div);
  }
}

// ЛАБОРАТОРИЯ: постоянная прокачка за банк.
//
// Открывается кнопкой со стартового экрана и живёт поверх него — стартовый
// экран остаётся под ней, потому что после покупки игрок обычно сразу жмёт
// «Играть», и возвращать его некуда.
function showLab(on){
  document.getElementById("labMenu").classList.toggle("hidden",!on);
  if(on) syncLab();
}

function syncLab(){
  document.getElementById("labCoins").textContent=meta.bank;
  const list=document.getElementById("labList");
  list.innerHTML="";
  for(const row of meta.labRows()){
    const div=document.createElement("div");
    div.className="lab-row"+(row.maxed?" maxed":(row.affordable?"":" poor"));
    const dots=Array.from({length:row.def.levels},(_,i)=>
      '<i class="'+(i<row.level?"on":"")+'"></i>').join("");
    div.innerHTML=
      '<img class="ico" src="assets/images/ui/icon_up_'+row.def.icon+'.png" alt="">'+
      '<div class="body">'+
        '<div class="title">'+row.def.name+'</div>'+
        '<div class="desc">'+row.def.desc+'</div>'+
        '<div class="dots">'+dots+'</div>'+
      '</div>'+
      (row.maxed
        ? '<div class="done">ВСЁ</div>'
        : '<div class="cost"><img src="assets/images/drops/drop_coin.png" alt="">'+row.cost+'</div>');
    div.onclick=()=>{
      const ok=meta.buyLab(row.key);
      // Отказ звучит. Молчащая карточка читается как «игра не заметила
      // нажатие», и игрок жмёт её ещё трижды вместо того, чтобы копить.
      audio.sfx(ok?"levelup":"hit",ok?1:0.4);
      if(!ok) return;
      syncLab(); showMeta();
      // Игрок за стартовым экраном пересобирается: иначе купленная прибавка
      // применилась бы только со следующего запуска игры, а фон показывал бы
      // прежнего героя.
      if(!started) init();
    };
    list.appendChild(div);
  }
}

function showMeta(){
  const box=document.getElementById("metaBox");
  box.classList.toggle("hidden",!meta.isVisible());
  if(!meta.isVisible()) return;
  document.getElementById("bankCoins").textContent=meta.bank;
  // Кнопка лаборатории показывается вместе с банком: пустая лаборатория при
  // нулевом счёте сообщала бы только о том, что играть ещё рано.
  document.getElementById("labBtn").classList.toggle("hidden",!meta.isVisible());
  const list=document.getElementById("charList");
  list.innerHTML="";
  for(const row of meta.roster()){
    const poor=!row.unlocked&&meta.bank<row.def.cost;
    const div=document.createElement("div");
    div.className="char-card"+(row.selected?" on":"")+
                  (row.unlocked?"":" locked")+(poor?" poor":"");
    div.innerHTML=
      '<img class="ico" src="assets/images/ui/icon_up_'+row.def.icon+'.png" alt="">'+
      '<div class="title">'+row.def.name+'</div>'+
      '<div class="desc">'+row.def.desc+'</div>'+
      (row.unlocked?"":'<div class="cost">'+row.def.cost+'</div>');
    div.onclick=()=>{
      // Открыт — просто выбираем; закрыт — пробуем купить. Отказ по деньгам
      // обязан звучать: молчащая карточка читается как «игра не заметила».
      const ok=row.unlocked?meta.select(row.id):meta.unlock(row.id);
      audio.sfx(ok?(row.unlocked?"pickup":"levelup"):"hit",ok?1:0.4);
      showMeta();
      // Игрок, стоящий за стартовым экраном, создаётся заново: иначе выбор
      // применился бы только со следующего забега, а фон показывал бы старого
      if(ok&&!started) init();
    };
    list.appendChild(div);
  }
}
showBest(); showMeta(); showDiff();

document.getElementById("playBtn").onclick=startRun;
// ПОЛЗУНКИ ГРОМКОСТИ. Пара «ползунок — цифра» на каждую громкость; сам список
// собран здесь, чтобы syncSettings и обработчик ходили по одному и тому же.
const SLIDERS=[
  ["music",document.getElementById("volMusic"),document.getElementById("volMusicVal")],
  ["sfx",  document.getElementById("volSfx"),  document.getElementById("volSfxVal")]
];
for(const [kind,el,val] of SLIDERS){
  // input, а не change: громкость обязана меняться ПОКА тянешь. Ползунок,
  // который слышно только после отпускания, невозможно настроить на слух.
  el.addEventListener("input",()=>{
    const pct=Number(el.value)||0;
    settings.set(kind,pct/100);
    val.textContent=pct;
    el.closest(".vol-row").classList.toggle("off",pct===0);
    // Эффекты проверяются на слух тем же звуком, которым игрок и недоволен:
    // подвинул ползунок — сразу слышно, насколько тише стало.
    if(kind==="sfx"&&pct>0) audio.sfx("shoot");
  });
}
document.getElementById("settingsClose").onclick=()=>{
  // С паузы панель закрывается вместе с самой паузой: закрыть её отдельно и
  // остаться в замершем мире значило бы получить второй, невидимый способ
  // стоять на месте.
  if(paused) togglePause(false); else showSettings(false);
};
document.getElementById("soundBtn").onclick=()=>showSettings(true);
document.getElementById("labBtn").onclick=()=>showLab(true);
document.getElementById("labClose").onclick=()=>showLab(false);
// Та же трата с пальца. Подсказку «ПРОБЕЛ» на сенсорном экране прячем: клавиши
// там нет, а подпись к несуществующей кнопке — то же ложное обещание.
if(input.isMobile) document.body.classList.add("touch");
HUD.burstBtn.addEventListener("click",(e)=>{ e.preventDefault(); tryBurst(); });
document.getElementById("pauseBtn").addEventListener("click",(e)=>{ e.preventDefault(); togglePause(); });
HUD.upgradeBtn.addEventListener("click",(e)=>{ e.preventDefault(); openUpgradeMenu(); });
document.getElementById("shopReroll").onclick=()=>shop.reroll(player);
document.getElementById("shopLeave").onclick=()=>shop.close();
// Кнопка вместо надписи «R — рестарт»: на телефоне клавиши нет, и экран
// смерти был тупиком — забег не перезапустить иначе как перезагрузкой.
// РЕКЛАМА ЖИВЁТ ЗДЕСЬ, и это единственное её место в игре.
//
// Кнопка «ЗАНОВО» — самая честная пауза, какая в этой игре есть: забег
// кончился, цифры прочитаны, следующий ещё не начался. Показывать блок в
// момент смерти было бы рекламой поверх события, ради которого играли, а
// посреди боя реклама запрещена и правилами площадки, и здравым смыслом.
//
// commercialBreak зовёт продолжение в любом случае — даже если блока не было
// вовсе (площадка сама решает, показывать ли, и чаще всего не показывает).
document.getElementById("restartBtn").onclick=()=>{
  if(gameOver) platform.commercialBreak(()=>init());
};
document.getElementById("menuBtn").onclick=()=>{
  if(gameOver) platform.commercialBreak(()=>backToMenu());
};

const loop=new Loop(update,draw,CONFIG.maxFps);
init();
loop.start();
console.log("Грибной Сумрак запущен! WASD/джойстик — движение, мышь/авто-прицел — стрельба, M — звук, R — рестарт");
