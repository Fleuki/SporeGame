// НАСТРОЙКИ ЗВУКА: две громкости, музыка и эффекты, отдельно.
//
// До этого громкость была одна на всё и жёстко зашита в AudioManager, а
// единственным управлением была клавиша «M» — то есть выбор между «всё» и
// «ничего». Живая игра показала, зачем нужна середина: три ствола с
// прокачанной скорострельностью перекрикивали музыку, и человек, которому
// мешают выстрелы, вынужден был глушить заодно и трек, ради которого всё
// затевалось.
//
// Хранится через Store (engine/store.js) рядом с рекордом и банком.
// Хранилище может быть недоступно
// вовсе — приватное окно, жёсткие настройки, iframe, — и это НЕ должно ломать
// игру: настройки просто не переживут вкладку, а звучать всё будет как звучало.

const KEY="sporegame.audio";

// Значения по умолчанию — те самые, что стояли в AudioManager числами.
// Держим их здесь: раз громкость теперь настраивается, её начальная точка
// принадлежит настройкам, а не звуку.
const DEFAULTS={ music: 0.52, sfx: 0.5 };

import { Store } from "../engine/store.js";

export class SettingsSystem {
  constructor(audio){
    this.audio=audio;
    this.values={...DEFAULTS,...this.load()};
    this.apply();
  }

  // Хранилище подменили уже после первого чтения (площадка отдаёт своё
  // промисом — см. Store.use): громкости перечитываются и применяются.
  reload(){
    this.values={...DEFAULTS,...this.load()};
    this.apply();
  }

  load(){
    try{
      const raw=Store.getItem(KEY);
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
    Store.setItem(KEY,JSON.stringify(this.values));
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
