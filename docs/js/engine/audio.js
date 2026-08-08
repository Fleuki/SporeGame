// ЗВУК.
//
// Раньше этот класс умел только проигрывать файлы, а CONFIG.assets.sounds был
// пуст — то есть игра была полностью беззвучной. В играх этого жанра половина
// ощущения от боя как раз в звуке: щелчок выстрела, хруст попадания, всплеск
// подобранного опыта.
//
// Файлов у нас нет, поэтому эффекты синтезируются через WebAudio прямо в
// браузере: ничего не надо грузить и ничего не весит. Загрузка файлов при этом
// никуда не делась — если в CONFIG.assets.sounds появятся треки, playMusic и
// playSfx подхватят их.

// Рецепт эффекта:
//   type   — форма волны осциллятора (или noise: true — белый шум)
//   f0,f1  — частота в начале и в конце (звук скользит между ними)
//   dur    — длительность в секундах
//   gain   — громкость
//   seq    — вместо f0/f1: последовательность нот с шагом step (арпеджио)
const RECIPES = {
  shoot:   { type:"square",   f0:440,  f1:170,  dur:0.07, gain:0.05 },
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
const MUSIC_FILES={ run:"music_run", boss:"music_boss" };

// Частота ступени гаммы. Ступени идут дальше семи: 7 — это тоника октавой
// выше, а не ошибка индекса.
function noteHz(root,step){
  const oct=Math.floor(step/SCALE.length);
  return root*Math.pow(2,(SCALE[((step%SCALE.length)+SCALE.length)%SCALE.length]+oct*12)/12);
}

export class AudioManager {
  constructor(loader){
    this.loader=loader; this.musicVolume=0.4; this.sfxVolume=0.6;
    this.currentMusic=null; this.muted=false;
    this.ctx=null; this.master=null; this.noise=null;
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
    const wake=()=>{ this.unlock(); };
    for(const ev of ["pointerdown","keydown","touchstart"]){
      window.addEventListener(ev,wake,{once:true,passive:true});
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
    if(this.ctx.state==="suspended") this.ctx.resume().catch(()=>{});
    // Просьба сыграть трек могла прийти раньше, чем появился контекст —
    // например, из того же нажатия «Играть», которое его и разбудило
    if(this.wanted&&!this.musicTimer&&!this.currentMusic) this.applyMusic();
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
    if(!name){ this.stopMusicLoop(); this.stopMusic(true); this.onSynth=false; return; }
    // Откат идёт по ЗАГРУЖЕННОСТИ файла, а не по наличию имени в таблице.
    // MUSIC_FILES.boss существует всегда, файла под ним может не быть — и
    // проверка «есть ли имя» пропускала боссовый трек в синтез.
    let key=MUSIC_FILES[name];
    if(!key||!this.loader?.getSound(key)) key=MUSIC_FILES.run;
    if(this.loader?.getSound(key)){
      this.stopMusicLoop();
      this.onSynth=false;
      // track ставится и здесь, а не только в синтезе. Это отладочный
      // указатель («что играет сейчас»), и с одним треком он врал безобидно:
      // при играющем ФАЙЛЕ он оставался null, то есть выглядел как тишина.
      // Проверить музыку иначе нельзя — звукового устройства у headless-
      // браузера нет, — и указатель, который врёт, хуже отсутствующего.
      this.track=name;
      this.playMusic(key);
      return;
    }
    // Файла нет или ещё не пришёл — играет синтез, и мы помним, что ждём
    this.stopMusic();
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
    if(now-(this.lastAt.get(name)??-1)<THROTTLE) return;
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

  // --- файлы (на случай, если появятся треки) --------------------------
  playMusic(key,loop=true){
    const audio=this.loader.getSound(key); if(!audio||this.currentMusic===audio) return;
    this.stopMusic(); audio.loop=loop; audio.volume=this.muted?0:this.musicVolume; audio.play().catch(()=>{}); this.currentMusic=audio;
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
  stopMusic(reset=false){
    if(!this.currentMusic) return;
    this.currentMusic.pause();
    if(reset) this.currentMusic.currentTime=0;
    this.currentMusic=null;
  }
  playSfx(key){
    if(this.muted) return;
    const audio=this.loader.getSound(key);
    if(!audio){ this.sfx(key); return; }   // файла нет — играем синтезом
    const clone=audio.cloneNode(); clone.volume=this.sfxVolume; clone.play().catch(()=>{});
  }
  toggleMute(){
    this.muted=!this.muted;
    if(this.currentMusic) this.currentMusic.volume=this.muted?0:this.musicVolume;
    if(this.master) this.master.gain.value=this.muted?0:1;
    return this.muted;
  }
}
