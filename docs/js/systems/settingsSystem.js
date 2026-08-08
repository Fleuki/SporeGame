// НАСТРОЙКИ ЗВУКА: две громкости, музыка и эффекты, отдельно.
//
// До этого громкость была одна на всё и жёстко зашита в AudioManager, а
// единственным управлением была клавиша «M» — то есть выбор между «всё» и
// «ничего». Живая игра показала, зачем нужна середина: три ствола с
// прокачанной скорострельностью перекрикивали музыку, и человек, которому
// мешают выстрелы, вынужден был глушить заодно и трек, ради которого всё
// затевалось.
//
// Хранится в localStorage рядом с рекордом и банком. Он может быть недоступен
// вовсе — приватное окно, жёсткие настройки, iframe, — и это НЕ должно ломать
// игру: настройки просто не переживут вкладку, а звучать всё будет как звучало.

const KEY="sporegame.audio";

// Значения по умолчанию — те самые, что стояли в AudioManager числами.
// Держим их здесь: раз громкость теперь настраивается, её начальная точка
// принадлежит настройкам, а не звуку.
const DEFAULTS={ music: 0.52, sfx: 0.5 };

export class SettingsSystem {
  constructor(audio){
    this.audio=audio;
    this.values={...DEFAULTS,...this.load()};
    this.apply();
  }

  load(){
    try{
      const raw=localStorage.getItem(KEY);
      if(!raw) return {};
      const v=JSON.parse(raw);
      const out={};
      // Читаем по одному значению и проверяем каждое: в хранилище могло
      // остаться что угодно от прошлых версий, и одна кривая запись не должна
      // отнимать звук целиком.
      for(const k of ["music","sfx"]){
        if(typeof v?.[k]==="number"&&isFinite(v[k])) out[k]=Math.min(1,Math.max(0,v[k]));
      }
      return out;
    }catch{ return {}; }
  }

  save(){
    try{ localStorage.setItem(KEY,JSON.stringify(this.values)); }catch{}
  }

  // Громкость применяется СРАЗУ, а не по кнопке «сохранить»: ползунок, который
  // не слышно, пока его не отпустишь, невозможно настроить на слух.
  set(kind,value){
    const v=Math.min(1,Math.max(0,value));
    this.values[kind]=v;
    this.apply();
    this.save();
    return v;
  }

  apply(){
    this.audio.setVolumes(this.values.music,this.values.sfx);
  }
}
