// РЕКОРД ЗАБЕГА.
//
// Забег заканчивался — и всё. Ни следа, ни повода начать заново: экран
// поражения показывал цифры, которые ни с чем не сравнивались. Одна строка
// «в прошлый раз было 6:40» превращает «поиграл» в «ещё раз», и это самый
// дешёвый способ дать игре причину для второго запуска.
//
// Мерилом взято ВРЕМЯ, а не уровень и не убийства. Время — единственная мера
// прогресса в этой игре (волн нет, см. SpawnSystem), по нему считается вся
// сложность, и обмануть его нельзя: отсидеться в углу не выйдет, поток врагов
// растёт сам. Уровень и убийства показываются рядом, но рекорд ставит время.
//
// localStorage может быть недоступен вовсе — в приватном окне, при жёстких
// настройках, внутри iframe. Игра от этого страдать не должна: рекорда просто
// не будет, а забег пойдёт как шёл.

const KEY="sporegame.best";

export class RecordSystem {
  constructor(){ this.best=this.load(); }

  load(){
    try{
      const raw=localStorage.getItem(KEY);
      if(!raw) return null;
      const b=JSON.parse(raw);
      return (typeof b?.time==="number")?b:null;
    }catch{ return null; }
  }

  // Возвращает true, если рекорд побит: по этому экран поражения решает,
  // показывать ли «НОВЫЙ РЕКОРД»
  submit(run){
    const beaten=!this.best||run.time>this.best.time;
    if(beaten){
      this.prev=this.best;
      this.best={time:run.time,level:run.level,kills:run.kills};
      try{ localStorage.setItem(KEY,JSON.stringify(this.best)); }catch{}
    } else {
      this.prev=this.best;
    }
    return beaten;
  }
}
