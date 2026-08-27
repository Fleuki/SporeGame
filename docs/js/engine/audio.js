// ЗВУК.
//
// Раньше этот класс умел только проигрывать файлы, а CONFIG.assets.sounds был
// пуст — то есть игра была полностью беззвучной. В играх этого жанра половина
// ощущения от боя как раз в звуке: щелчок выстрела, хруст попадания, всплеск
// подобранного опыта.
//
// Эффекты синтезируются через Web Audio прямо в браузере: ничего не надо
// грузить и ничего не весит. Музыка — записанные треки, но играет она ТАМ ЖЕ,
// в том же звуковом контексте, а не медиа-элементом.
//
// ВЕСЬ ЗВУК ИГРЫ ИДЁТ ЧЕРЕЗ WEB AUDIO API, И МЕДИА-ЭЛЕМЕНТОВ НЕТ НИ ОДНОГО.
// Это не архитектурный вкус, а требование площадки (пп. 1.6.1.6 и 1.6.2.5):
// любой audio- или video-тег поднимает системный плеер на десктопе и карточку в
// шторке уведомлений на телефоне. Подробности — у playFile ниже.

// Рецепт эффекта:
//   type   — форма волны осциллятора (или noise: true — белый шум)
//   f0,f1  — частота в начале и в конце (звук скользит между ними)
//   dur    — длительность в секундах
//   gain   — громкость
//   seq    — вместо f0/f1: последовательность нот с шагом step (арпеджио)
const RECIPES = {
  // Выстрел тише остальных нарочно: он звучит чаще всех вместе взятых,
  // и на прежних 0.05 три ствола перекрикивали и попадания, и музыку
  shoot:   { type:"square",   f0:440,  f1:170,  dur:0.07, gain:0.032 },
  hit:     { type:"square",   f0:820,  f1:380,  dur:0.05, gain:0.04 },
  crit:    { type:"square",   f0:1500, f1:620,  dur:0.10, gain:0.08 },
  kill:    { noise:true,      f0:1600, f1:180,  dur:0.16, gain:0.11 },
  boom:    { noise:true,      f0:600,  f1:50,   dur:0.34, gain:0.20 },
  hurt:    { type:"sawtooth", f0:240,  f1:70,   dur:0.20, gain:0.14 },
  shield:  { type:"triangle", f0:900,  f1:1500, dur:0.16, gain:0.10 },
  pickup:  { type:"triangle", f0:700,  f1:1150, dur:0.07, gain:0.05 },
  // coin никем не проигрывается: монеты убраны до магазина (ЭТАП 2).
  // Рецепт оставлен здесь же, где его искать, когда валюта вернётся.
  coin:    { type:"square",   f0:1050, f1:1750, dur:0.09, gain:0.05 },
  levelup: { type:"triangle", seq:[523,659,784,1047], step:0.065, dur:0.16, gain:0.10 },
  // Эволюция ствола — событие раз в забег, и звучит она длиннее и выше
  // обычного уровня: та же мажорная лесенка, но на октаву и с оттяжкой
  evolve:  { type:"triangle", seq:[523,784,1047,1319,1568], step:0.075, dur:0.22, gain:0.12 },
  boss:    { noise:true,      f0:180,  f1:35,   dur:0.9,  gain:0.22 },
  // Выброс спор. Шум, уходящий ВВЕРХ, — единственный такой в наборе: взрывы и
  // смерти здесь все падают по частоте, и восходящий выдох ни с одним из них
  // не спутать, даже когда на экране рвётся всё сразу.
  burst:   { noise:true,      f0:120,  f1:900,  dur:0.28, gain:0.17 },
  wave:    { type:"triangle", seq:[392,523], step:0.10, dur:0.20, gain:0.08 }
};

// Минимальный зазор между двумя одинаковыми звуками. Без него три ствола и
// десяток попаданий за кадр сливаются в треск.
const THROTTLE = 0.035;

// ...но одного зазора на всех мало, и это выяснилось живой игрой: «звуки
// выстрелов просто каждую секунду вылетают на прокаченном персонаже, музыку
// не слышно». Так и есть — к десятой минуте три ствола с прокачанной
// скорострельностью стреляют почти каждый кадр, и выстрел, пролезающий раз в
// 35 миллисекунд, превращается в сплошной треск поверх всего остального.
//
// Зазор поэтому свой у каждого звука. Логика простая: чем чаще событие, тем
// длиннее зазор — событие, которое случается тридцать раз в секунду, не
// сообщает ничего и обязано звучать как фон, а не как реплика.
const THROTTLES = {
  shoot: 0.16,   // выстрел: реплика превращается в ритм, а не в очередь
  hit:   0.09,   // попадание: их столько же, сколько выстрелов
  kill:  0.07    // смерть врага — событие поважнее, но в толпе их десятки
};

// === МУЗЫКА ============================================================
//
// Её не было вовсе: CONFIG.assets.sounds пуст, и всё, что звучало, — это
// разовые эффекты. В этом жанре музыка держит темп сильнее половины
// визуальных правок: без неё затишье между стычками читается не как передышка,
// а как «игра подвисла», а выход босса — как ещё один враг покрупнее.
//
// Треки СИНТЕЗИРУЮТСЯ, как и эффекты, и по той же причине: ничего не грузится
// и ничего не весит. Файл на четыре минуты в этом проекте перевесил бы всю
// графику вместе взятую (1.2 МБ), а зациклить его без слышимого шва всё равно
// не выйдет — у сгенерированного трека почти никогда не сходятся края.
//
// Устройство минимальное и намеренно такое: бас на каждую долю, редкие ноты
// сверху и педаль, меняющаяся раз в такт. Мелодии здесь нет и не должно быть —
// мелодию за час игры запоминаешь и начинаешь слышать вместо игры.
//
// step — доля в секундах; steps — сколько долей в такте; root — тоника в Гц;
// bass/lead — ступени минорной гаммы (null — пауза) по долям такта.
const SCALE=[0,2,3,5,7,8,10];       // натуральный минор: полутона от тоники
const TRACKS={
  // ЗАБЕГ. Медленно и низко: музыка обязана быть фоном, поверх которого
  // слышно выстрел и хруст попадания, а не наоборот.
  run: {
    // root — НЕ самая низкая нота, которую можно взять. Первая версия стояла
    // на 55 Гц (ля контроктавы): на встроенных динамиках ноутбука и телефона
    // это не бас, а тишина — там просто нет отдачи ниже сотни герц. Ми большой
    // октавы слышно везде и оно всё ещё ниже любого игрового эффекта.
    step:0.30, steps:8, root:82.4,
    gain:0.5,
    bass:[0,null,0,null,4,null,3,null],
    lead:[null,null,7,null,null,9,null,7],
    // Педаль: длинная нота под всем тактом, тон меняется по кругу.
    pad:[0,3,5,3]
  },
  // БОСС. Быстрее, выше и без пауз в басу: разница слышна с первой доли, и
  // выход босса становится событием ещё до того, как он войдёт в кадр.
  boss: {
    // Кварта выше забега (ля): смена тоники слышна как «стало выше и злее»
    // даже тому, кто не различает трек от трека
    step:0.22, steps:8, root:110,
    gain:0.62,
    bass:[0,0,5,0,0,0,6,5],
    lead:[7,null,10,null,11,null,10,7],
    pad:[0,5,0,6]
  }
};

// НАСТОЯЩИЕ ТРЕКИ, ЕСЛИ ОНИ ЕСТЬ. Синтез выше был не выбором, а вынужденной
// мерой: файлов не было вовсе. Как только в CONFIG.assets.sounds появляется
// запись, она вытесняет синтез — и наоборот, пока файла нет или он ещё
// грузится, играет синтез. Ни одной правки в main для этого не нужно.
//
// Трек весит миллионы байт против килобайтов у графики, и это осознанная
// плата: музыка в этом жанре держит темп сильнее половины визуальных правок.
// Игру она не задерживает — загрузчик не блокирует запуск, а до прихода файла
// звучит синтез.
const MUSIC_FILES={ run:"music_run", boss:"music_boss", death:"music_death",
                    victory:"music_victory" };

// Треки, у которых НЕТ подмены темой забега. Обычный трек, файла которого не
// оказалось, играет тему забега — это лучше, чем тишина, и лучше, чем скачок
// в синтез посреди боя. Но на экране итогов бодрая тема забега поверх «СПОРЫ
// ПОБЕДИЛИ» отменяет собой всё, что этот экран говорит, — так что если файла
// смерти нет, правильный ответ тишина.
//
// У ПОБЕДЫ то же правило и по той же причине, только сильнее: тема забега над
// «СУМРАК РАССЕЯН» отменяет победу, а тема смерти над ней звучит
// издевательством. Файла победы пока нет вовсе — значит там тишина, и это
// сознательный выбор, а не забытая строчка. Промпт на трек лежит в
// ASSET_PROMPTS.md, раздел «Музыка»; когда файл появится, всё, что нужно, —
// положить его в assets/sounds и вписать одну строку в CONFIG.assets.sounds.
const NO_FALLBACK=new Set(["death","victory"]);

// Зациклены не все. Тема смерти играет один раз и затихает: экран итогов —
// это конец, а музыка, идущая по кругу, превращает его в ожидание.
const MUSIC_LOOP={ death:false, victory:false };

// ЧАСТОТА, В КОТОРОЙ МУЗЫКА ЛЕЖИТ В ПАМЯТИ, ЗАНИЖЕНА НАРОЧНО.
//
// Файл на диске весит мегабайты, а РАСКОДИРОВАННЫЙ — десятки: восьмиминутная
// тема забега в 44.1 кГц занимает 85 МБ оперативной памяти против 3.7 МБ на
// диске. Пока музыка играла медиа-элементом, этого счёта не было вовсе —
// браузер тянул файл потоком и в память клал секунды. Web Audio так не умеет:
// AudioBufferSourceNode играет только целиком раскодированный буфер.
//
// Треки записаны в 64 кбит/с моно — кодировщик на таком потоке режет всё выше
// 12-15 кГц, то есть в исходнике попросту нет ничего, что не поместилось бы в
// 32 кГц (16 кГц по Найквисту). Декодирование в эту частоту не слышно ничем и
// снимает четверть памяти; забег с боссом держит около 100 МБ вместо 137.
const MUSIC_RATE=32000;

// Частота ступени гаммы. Ступени идут дальше семи: 7 — это тоника октавой
// выше, а не ошибка индекса.
function noteHz(root,step){
  const oct=Math.floor(step/SCALE.length);
  return root*Math.pow(2,(SCALE[((step%SCALE.length)+SCALE.length)%SCALE.length]+oct*12)/12);
}

export class SoundManager {
  constructor(loader){
    // Музыка громче прежнего (0.4), эффекты тише (0.6): при трёх стволах
    // эффекты забивали трек целиком, и «музыки не слышно» было правдой
    this.loader=loader; this.musicVolume=0.52; this.sfxVolume=0.5;
    // ДЕКОДИРУЕТ МУЗЫКУ ЗВУК, А НЕ ЗАГРУЗЧИК: звуковой контекст живёт здесь.
    // Загрузчик приносит байты и зовёт эту функцию — см. AssetLoader.
    if(loader) loader.decodeSound=(bytes)=>this.decode(bytes);
    // ЧТО ИГРАЕТ ФАЙЛОМ. Раньше здесь лежал медиа-элемент — тот самый, из-за
    // которого игра дважды вернулась с модерации (системный плеер на десктопе,
    // карточка в шторке уведомлений на телефоне). Теперь это обычный узел
    // звукового контекста, и никакого медиа-элемента в игре нет вовсе.
    this.fileKey=null; this.fileSrc=null; this.fileLoop=true; this.fileStart=0;
    // ГДЕ ОСТАНОВИЛСЯ КАЖДЫЙ ТРЕК. Узел одноразовый: остановленный источник
    // не запустить снова, на его место создаётся новый. Значит место в треке
    // приходится помнить самим — на этом держится правило «переключение трека
    // не перематывает его в начало» (см. stopFile).
    this.at=new Map();
    this.muted=false;
    // Временная остановка по внешней причине — см. suspend(): сворачивание
    // вкладки, реклама, пауза. От muted отличается тем, что это НЕ решение
    // игрока и снимается само.
    this.suspended=false;
    this.ctx=null; this.master=null; this.noise=null; this.fileGain=null;
    this.lastAt=new Map();
    // МУЗЫКА. wanted — какой трек должен играть; играть он начнёт, только
    // когда появится звуковой контекст, а до первого нажатия его нет вовсе.
    // Поэтому просьбу запоминаем, а не теряем: main зовёт music() из startRun,
    // то есть ровно из того нажатия, которое контекст и разбудит.
    this.wanted=null; this.track=null;
    this.musicGain=null; this.musicTimer=null;
    this.nextAt=0; this.beat=0;
    // Сейчас звучит синтез, то есть настоящего файла ещё нет. По этому флагу
    // music() каждый кадр переспрашивает, не догрузился ли он.
    this.onSynth=false;
    // Браузер не даёт создать звук до действия пользователя — включаемся на
    // первом же нажатии и больше не слушаем.
    // Слушаем ВСЕ жесты, а не только первый. Первого хватало, пока музыка
    // была синтезом: контекст, однажды разбуженный, не засыпал. Телефон его
    // усыпляет — при сворачивании вкладки, звонке, блокировке экрана, — и
    // единственное место, где его разрешено будить обратно, это жест.
    const wake=()=>{ this.unlock(); };
    for(const ev of ["pointerdown","keydown","touchstart"]){
      window.addEventListener(ev,wake,{passive:true});
    }
  }

  // --- синтез ---------------------------------------------------------
  // Создать и разбудить контекст можно только из обработчика жеста. Пытаться
  // делать это из sfx() бессмысленно: до первого нажатия каждый выстрел просто
  // засорял бы консоль предупреждением автоплея.
  unlock(){
    if(!this.ctx){
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC) return null;
      this.ctx=new AC();
      this.master=this.ctx.createGain();
      this.master.gain.value=this.muted?0:1;
      this.master.connect(this.ctx.destination);
      // Секунда белого шума, переиспользуется всеми шумовыми эффектами
      const len=Math.floor(this.ctx.sampleRate);
      this.noise=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
      const data=this.noise.getChannelData(0);
      for(let i=0;i<len;i++) data[i]=Math.random()*2-1;
    }
    // Пока звук остановлен снаружи (реклама, свёрнутая вкладка, пауза),
    // жест НЕ будит его обратно: касание ползунка громкости на паузе или
    // тычок в экран поверх рекламного ролика вернули бы музыку в тот самый
    // момент, ради которого её и глушили.
    if(this.suspended) return this.ctx;
    if(this.ctx.state==="suspended") this.ctx.resume().catch(()=>{});
    // Просьба сыграть трек могла прийти раньше, чем появился контекст —
    // например, из того же нажатия «Играть», которое его и разбудило
    // ...в том числе трека ФАЙЛОМ: до этой секунды контекста не существовало,
    // а играть буфер негде и нечем. Сейчас он есть — и applyMusic сам решит,
    // что играть, файл или синтез.
    if(this.wanted&&!this.musicTimer&&!this.fileSrc) this.applyMusic();
    return this.ctx;
  }

  // --- музыка -----------------------------------------------------------
  // Какой трек должен играть. null — тишина. Вызывать можно каждый кадр:
  // повтор того же имени ничего не делает.
  // Вызывать можно каждый кадр: смена имени переключает трек, а совпадение
  // стоит одного поиска в Map. Спрашивать КАЖДЫЙ раз нужно затем, что файл
  // мог догрузиться уже после начала забега — тогда он вытесняет синтез
  // прямо посреди игры, и это единственное место, где это можно заметить.
  music(name){
    const changed=this.wanted!==name;
    this.wanted=name;
    if(changed||this.onSynth) this.applyMusic();
  }

  // Что играть на самом деле: файл, если он загружен, иначе синтез.
  //
  // У трека без своего файла берётся файл забега. Это не лень: переход от
  // записанной музыки к синтезированному арпеджио в момент выхода босса
  // звучит как поломка, а не как смена темы. Своего файла нет — играет файл
  // забега, и выход босса объявлен рёвом, тряской, именем и полосой здоровья.
  applyMusic(){
    const name=this.wanted;
    // Тишина — это конец забега или меню, и следующий забег обязан начать
    // тему сначала: только здесь трек перематывается в ноль.
    if(!name){ this.stopMusicLoop(); this.stopFile(true); this.onSynth=false; return; }
    // Откат идёт по ЗАГРУЖЕННОСТИ файла, а не по наличию имени в таблице.
    // MUSIC_FILES.boss существует всегда, файла под ним может не быть — и
    // проверка «есть ли имя» пропускала боссовый трек в синтез.
    let key=MUSIC_FILES[name];
    // Трек мог быть отложен и не качаться вовсе (CONFIG.assets.deferSounds) —
    // тогда просьба сыграть его и есть тот момент, когда его пора принести.
    // Повторные просьбы загрузчик отбрасывает сам.
    if(key) this.loader?.requestSound?.(key);
    if(!key||!this.loader?.getSound(key)){
      // Своего файла нет: у обычного трека подменяем темой забега, у трека
      // смерти — молчим (см. NO_FALLBACK)
      if(NO_FALLBACK.has(name)){ this.stopMusicLoop(); this.stopFile(true); this.onSynth=false; return; }
      key=MUSIC_FILES.run;
      this.loader?.requestSound?.(key);
    }
    // Файл есть, но играть его пока негде: контекст создаётся только из жеста
    // игрока. Тогда уходим в синтез и ждём unlock — он позовёт сюда снова.
    if(this.loader?.getSound(key)&&this.ctx){
      this.stopMusicLoop();
      this.onSynth=false;
      // track ставится и здесь, а не только в синтезе. Это отладочный
      // указатель («что играет сейчас»), и с одним треком он врал безобидно:
      // при играющем ФАЙЛЕ он оставался null, то есть выглядел как тишина.
      // Проверить музыку иначе нельзя — звукового устройства у headless-
      // браузера нет, — и указатель, который врёт, хуже отсутствующего.
      this.track=name;
      this.playFile(key,MUSIC_LOOP[name]!==false);
      return;
    }
    // Файла нет или ещё не пришёл — играет синтез, и мы помним, что ждём
    this.stopFile();
    this.onSynth=true;
    if(!this.ctx||this.ctx.state!=="running") return;   // сыграем после unlock
    this.startMusicLoop();
  }

  startMusicLoop(){
    const ctx=this.ctx; if(!ctx) return;
    if(!this.musicGain){
      this.musicGain=ctx.createGain();
      this.musicGain.gain.value=this.musicVolume;
      // Под master: выключение звука по «M» гасит и музыку тоже, одним местом
      this.musicGain.connect(this.master);
    }
    // Смена трека начинается с ближайшей доли, а не с текущей миллисекунды:
    // такт, оборванный посередине, слышен как сбой.
    this.track=this.wanted; this.beat=0;
    this.nextAt=Math.max(this.nextAt,ctx.currentTime+0.06);
    // Возвращаем громкость: её гасит stopMusicLoop, и без этого второй забег
    // шёл бы в тишине
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(this.musicVolume,ctx.currentTime,0.1);
    if(this.musicTimer) return;
    // Планировщик: раз в 60 мс раскладывает ноты на четверть секунды вперёд.
    // Планировать из requestAnimationFrame нельзя — вкладка в фоне его
    // останавливает, а звук продолжает идти и обрывается на полутакте.
    this.musicTimer=setInterval(()=>this.scheduleMusic(),60);
    this.scheduleMusic();
  }

  stopMusicLoop(){
    if(this.musicTimer){ clearInterval(this.musicTimer); this.musicTimer=null; }
    this.track=null;
    // Ноты, уже разложенные по времени, отменить нельзя — педаль тянется на
    // весь такт, то есть до двух с половиной секунд поверх экрана итогов.
    // Гасим не планировщиком, а громкостью.
    if(this.musicGain&&this.ctx){
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(0,this.ctx.currentTime,0.12);
    }
  }

  scheduleMusic(){
    const ctx=this.ctx, T=TRACKS[this.track];
    if(!ctx||!T||ctx.state!=="running") return;
    // ОТСТАВШИЕ ДОЛИ ПРОПУСКАЕМ, а не доигрываем. Во вкладке в фоне
    // setInterval душат до одного раза в секунду, и без этой строки очередь
    // накопленных долей вывалилась бы в один кадр аккордом из десятка нот.
    if(this.nextAt<ctx.currentTime) this.nextAt=ctx.currentTime+0.02;
    while(this.nextAt<ctx.currentTime+0.25){
      const i=this.beat%T.steps;
      const at=Math.max(this.nextAt,ctx.currentTime+0.02);
      // Бас — короткий низкий импульс, он же метроном забега
      if(T.bass[i]!=null) this.tone(at,noteHz(T.root,T.bass[i]),T.step*1.5,"triangle",0.5*T.gain);
      // Верхний голос звучит редко и тише: он расставляет акценты, а не поёт
      if(T.lead[i]!=null) this.tone(at,noteHz(T.root,T.lead[i]+7),T.step*1.1,"sine",0.16*T.gain);
      // Педаль меняется раз в такт и тянется весь такт целиком
      if(i===0){
        const p=T.pad[Math.floor(this.beat/T.steps)%T.pad.length];
        this.tone(at,noteHz(T.root,p)*2,T.step*T.steps,"sawtooth",0.06*T.gain,420);
      }
      this.nextAt+=T.step;
      this.beat++;
    }
  }

  // Одна музыкальная нота: та же огибающая, что у эффектов, но с мягкой
  // атакой — щелчок в начале ноты в фоновом треке слышен как помеха.
  // cutoff — если задан, ноту глушит фильтр: так педаль остаётся гулом на
  // заднем плане и не спорит с выстрелами.
  tone(at,hz,dur,type,gain,cutoff=0){
    const ctx=this.ctx;
    const env=ctx.createGain();
    env.gain.setValueAtTime(0.0001,at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002,gain),at+Math.min(0.08,dur*0.25));
    env.gain.exponentialRampToValueAtTime(0.0001,at+dur);
    const osc=ctx.createOscillator();
    osc.type=type; osc.frequency.setValueAtTime(hz,at);
    if(cutoff){
      const f=ctx.createBiquadFilter();
      f.type="lowpass"; f.frequency.value=cutoff;
      osc.connect(f); f.connect(env);
    } else osc.connect(env);
    env.connect(this.musicGain);
    osc.start(at); osc.stop(at+dur+0.03);
    osc.onended=()=>{ try{ osc.disconnect(); env.disconnect(); }catch(e){} };
  }

  // volume — множитель поверх рецепта: тише для дальних событий
  sfx(name,volume=1){
    if(this.muted) return;
    const r=RECIPES[name]; if(!r) return;
    const ctx=this.ctx; if(!ctx||ctx.state!=="running") return;
    const now=ctx.currentTime;
    if(now-(this.lastAt.get(name)??-1)<(THROTTLES[name]??THROTTLE)) return;
    this.lastAt.set(name,now);
    const g=r.gain*this.sfxVolume*volume;
    if(r.seq) r.seq.forEach((f,i)=>this.blip(now+i*r.step,r,f,null,g));
    else this.blip(now,r,r.f0,r.f1,g);
  }

  blip(at,r,f0,f1,gain){
    const ctx=this.ctx;
    const env=ctx.createGain();
    env.gain.setValueAtTime(0.0001,at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002,gain),at+0.008);
    env.gain.exponentialRampToValueAtTime(0.0001,at+r.dur);
    env.connect(this.master);

    let src;
    if(r.noise){
      // Шум сам по себе — просто «пшш»; характер ему задаёт фильтр, который
      // съезжает вниз по частоте: так получается и хруст, и взрыв.
      src=ctx.createBufferSource(); src.buffer=this.noise; src.loop=true;
      const filt=ctx.createBiquadFilter(); filt.type="lowpass"; filt.Q.value=6;
      filt.frequency.setValueAtTime(f0,at);
      filt.frequency.exponentialRampToValueAtTime(Math.max(30,f1??f0),at+r.dur);
      src.connect(filt); filt.connect(env);
    } else {
      src=ctx.createOscillator(); src.type=r.type||"square";
      src.frequency.setValueAtTime(f0,at);
      if(f1!=null) src.frequency.exponentialRampToValueAtTime(Math.max(20,f1),at+r.dur);
      src.connect(env);
    }
    src.start(at); src.stop(at+r.dur+0.02);
    src.onended=()=>{ try{ src.disconnect(); env.disconnect(); }catch(e){} };
  }

  // --- музыкальные файлы --------------------------------------------
  // ЗДЕСЬ БЫЛ HTMLAudioElement, И ИМЕННО ОН ВЕРНУЛ ИГРУ С МОДЕРАЦИИ ДВАЖДЫ.
  //
  // Замечания дословно: «в десктопной версии игры отображается системный
  // плеер» (п. 1.6.2.5) и «на мобильных устройствах плеер игры отображается в
  // панели уведомлений» (п. 1.6.1.6). Причина у обоих одна и лечится не
  // настройкой, а удалением: любой медиа-элемент — audio-тег, video-тег, конструктор
  // Audio — регистрируется у операционной системы как проигрыватель. Ни
  // `controls=false`, ни `playsInline`, ни `navigator.mediaSession` этого не
  // отменяют: карточка в шторке появляется от самого факта воспроизведения.
  //
  // Поэтому медиа-элементов в игре нет ВООБЩЕ НИ ОДНОГО, а музыка играет так
  // же, как эффекты, — узлом звукового контекста. Заодно само собой ушло
  // всё, что раньше приходилось чинить руками:
  //   — маршрут через контекст (routeThroughContext) — теперь он единственный;
  //   — переключатель «без звука» на iPhone, глушивший медиа-элемент мимо контекста;
  //   — отказ автоплея с повтором по ближайшему касанию (tryPlay/armRetry):
  //     буферу разрешение не нужно, его требует только сам контекст, и его
  //     спрашивает unlock().
  //
  // Цена одна и она честная: буфер лежит в памяти целиком (см. MUSIC_RATE).

  // ДЕКОДИРОВАНИЕ. Отдельный ОФФЛАЙНОВЫЙ контекст, а не игровой, по двум
  // причинам: он существует до первого жеста игрока (то есть музыку можно
  // готовить, пока человек читает стартовый экран), и он задаёт частоту, в
  // которой буфер ляжет в память.
  decodeCtx(){
    if(this._dec!==undefined) return this._dec;
    this._dec=null;
    const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    if(OAC){ try{ this._dec=new OAC(1,1,MUSIC_RATE); }catch{ this._dec=null; } }
    return this._dec;
  }

  decode(bytes){
    const ctx=this.decodeCtx()||this.ctx;
    if(!ctx) return Promise.reject(new Error("нет контекста для декодирования"));
    // Обещание отдают не все: Safari годами умела только колбэки, и вызов там
    // возвращает undefined. Поддерживаем оба способа сразу.
    return new Promise((resolve,reject)=>{
      let pr;
      try{ pr=ctx.decodeAudioData(bytes,resolve,reject); }
      catch(e){ reject(e); return; }
      if(pr&&pr.then) pr.then(resolve,reject);
    });
  }

  // ЗАПУСТИТЬ ТРЕК ФАЙЛОМ. Источник одноразовый: остановленный узел не
  // запустить заново, поэтому на каждый запуск создаётся новый, а место в
  // треке берётся из this.at (см. stopFile).
  playFile(key,loop=true){
    const ctx=this.ctx, buf=this.loader?.getSound(key);
    if(!ctx||!buf) return;
    if(this.fileKey===key&&this.fileSrc) return;   // этот и так играет
    this.stopFile();
    if(!this.fileGain){
      this.fileGain=ctx.createGain();
      this.fileGain.connect(this.master);          // «M» гасит и музыку тоже
    }
    this.fileGain.gain.setValueAtTime(this.musicVolume,ctx.currentTime);
    let off=this.at.get(key)||0;
    // Трек мог доиграть до конца, пока его не было слышно: не зациклённый
    // начинаем сначала, зациклённый — с того же места внутри круга.
    if(off>=buf.duration) off=loop?off%buf.duration:0;
    const src=ctx.createBufferSource();
    src.buffer=buf; src.loop=loop;
    src.connect(this.fileGain);
    src.start(0,off);
    src.onended=()=>{
      // Трек кончился сам (такое бывает только у не зациклённых — тема смерти
      // и тема победы). Следующий раз он обязан начаться сначала.
      if(this.fileSrc!==src) return;
      try{ src.disconnect(); }catch{}
      this.fileSrc=null; this.fileKey=null; this.at.set(key,0);
    };
    this.fileSrc=src; this.fileKey=key; this.fileLoop=loop;
    this.fileStart=ctx.currentTime-off;
  }

  // СКОЛЬКО ТРЕК УЖЕ ОТЫГРАЛ. Считается по часам контекста, а они замирают
  // вместе с ним (suspend), — поэтому свёрнутая вкладка или рекламный ролик
  // не «прокручивают» музыку в тишине.
  musicTime(){
    if(!this.fileSrc||!this.ctx) return 0;
    const buf=this.fileSrc.buffer;
    let t=this.ctx.currentTime-this.fileStart;
    if(this.fileLoop&&buf&&buf.duration>0) t%=buf.duration;
    return Math.max(0,t);
  }

  // ПЕРЕКЛЮЧЕНИЕ ТРЕКА НЕ ПЕРЕМАТЫВАЕТ ЕГО В НАЧАЛО. Пока трек был один, это
  // ничего не значило; со вторым — значит вот что: босс выходит раз в 165
  // секунд, и тема забега начиналась бы заново после каждого. Восьмиминутный
  // трек в таком забеге никогда не добрался бы дальше третьей минуты, то есть
  // пять минут написанной музыки не услышал бы ни один игрок. То же и с
  // боссовым: его добивают за полминуты, и без памяти о месте второй и третий
  // босс играли бы ровно то же вступление.
  //
  // reset=true оставлен для конца забега: НОВЫЙ забег обязан начинаться с
  // начала темы, иначе первый же рестарт стартует с середины.
  stopFile(reset=false){
    const src=this.fileSrc, key=this.fileKey;
    if(!src) return;
    this.at.set(key,reset?0:this.musicTime());
    this.fileSrc=null; this.fileKey=null;
    src.onended=null;
    try{ src.stop(); }catch{}
    try{ src.disconnect(); }catch{}
  }

  // Разовый звук файлом. Своих файлов у эффектов нет (все четыре записи —
  // музыка), но правило то же: буфер, а не элемент.
  playSfx(key){
    if(this.muted) return;
    const buf=this.loader?.getSound(key);
    const ctx=this.ctx;
    if(!buf||!ctx||ctx.state!=="running"){ this.sfx(key); return; }   // нет файла — синтез
    const g=ctx.createGain();
    g.gain.value=this.sfxVolume;
    g.connect(this.master);
    const src=ctx.createBufferSource();
    src.buffer=buf; src.connect(g); src.start(0);
    src.onended=()=>{ try{ src.disconnect(); g.disconnect(); }catch{} };
  }

  // ФАЙЛ ПРИШЁЛ УЖЕ ПОСЛЕ ТОГО, КАК ТРЕК ПОПРОСИЛИ. Пока он летел, играл
  // синтез (или тишина на экране итогов) — теперь его пора вытеснить. Для
  // забега это делает и без того ежекадровый music(), но экран итогов кадров
  // не крутит: без этого колбэка тема смерти не заиграла бы никогда.
  soundReady(key){
    if(!this.wanted) return;
    if(MUSIC_FILES[this.wanted]===key||MUSIC_FILES.run===key) this.applyMusic();
  }

  // ФАЙЛ ПРОПАЛ. Ошибка сети или отсутствующий файл приходят уже после того,
  // как игра пошла, иногда посреди забега. Тогда трек надо пересобрать:
  // applyMusic сам увидит, что буфера больше нет, и включит синтез.
  soundLost(key){
    if(MUSIC_FILES[this.wanted]===key||MUSIC_FILES.run===key){
      this.stopFile();
      this.applyMusic();
    }
  }

  // ГРОМКОСТЬ ИЗВНЕ. Числа больше не принадлежат этому классу: их хранит и
  // помнит SettingsSystem, а здесь остаётся только применение.
  //
  // Музыка правится в двух местах сразу, и это не дублирование: играть может
  // либо файл (fileGain), либо синтез (musicGain) — какой именно, знает
  // applyMusic, а ползунку до этого дела быть не должно. Оба узла висят под
  // master, поэтому выключение звука по «M» их не касается.
  setVolumes(music,sfx){
    if(typeof music==="number") this.musicVolume=Math.min(1,Math.max(0,music));
    if(typeof sfx==="number") this.sfxVolume=Math.min(1,Math.max(0,sfx));
    if(!this.ctx) return;
    // setTargetAtTime, а не присваивание: скачок громкости слышен щелчком
    for(const g of [this.musicGain,this.fileGain]){
      if(g) g.gain.setTargetAtTime(this.musicVolume,this.ctx.currentTime,0.05);
    }
  }

  toggleMute(){
    this.muted=!this.muted;
    // Одной ручкой на всё: и файл, и синтез, и эффекты идут через master.
    if(this.master) this.master.gain.value=this.muted?0:1;
    return this.muted;
  }

  // ЗВУК ЗАМОЛКАЕТ ЦЕЛИКОМ И ВОЗВРАЩАЕТСЯ ТУДА ЖЕ, ГДЕ ОСТАНОВИЛСЯ.
  //
  // Это не «ещё один mute», и разница принципиальная: mute — решение игрока,
  // оно живёт до следующего его нажатия, а это — временная остановка по
  // внешней причине. Причин три, и все три требуют одного и того же:
  //   — вкладку свернули (требование площадки: свёрнутая игра не звучит);
  //   — показывается полноэкранная реклама (там своё звуковое сопровождение,
  //     и музыка игры поверх него читается как поломка);
  //   — игра на паузе.
  //
  // ОСТАНАВЛИВАЕТСЯ ОДИН КОНТЕКСТ — И В НЁМ ВСЁ СРАЗУ. Пока музыка была
  // файлом, её приходилось глушить отдельно от синтеза: медиа-элемент играл
  // мимо контекста и переживал его усыпление. Теперь источник один, и вместе
  // с контекстом замирают и трек, и отложенные ноты, и часы, по которым
  // считается место в треке (см. musicTime) — вернувшись через минуту, игрок
  // попадает ровно туда, где остановился.
  //
  // Глушить только громкость нельзя: звук, играющий в ноль, продолжает
  // расходовать батарею и продолжает ИДТИ.
  suspend(on){
    if(this.suspended===!!on) return;
    this.suspended=!!on;
    try{
      if(on){ if(this.ctx&&this.ctx.state==="running") this.ctx.suspend(); }
      else if(this.ctx&&this.ctx.state==="suspended") this.ctx.resume();
    }catch{}
  }
}
