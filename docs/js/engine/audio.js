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

export class AudioManager {
  constructor(loader){
    this.loader=loader; this.musicVolume=0.4; this.sfxVolume=0.6;
    this.currentMusic=null; this.muted=false;
    this.ctx=null; this.master=null; this.noise=null;
    this.lastAt=new Map();
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
    return this.ctx;
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
  stopMusic(){ if(this.currentMusic){ this.currentMusic.pause(); this.currentMusic.currentTime=0; this.currentMusic=null; } }
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
