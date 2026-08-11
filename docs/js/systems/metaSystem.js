import { CONFIG } from "../config.js";
import { Store } from "../engine/store.js";

// МЕТА-ПРОГРЕССИЯ: то, что переносится ИЗ забега в забег.
//
// Рекорд уже дал забегу с чем сравниться, но между забегами по-прежнему не
// оставалось НИЧЕГО: умер — и следующий начинается ровно с той же точки, что
// первый. Здесь появляется вторая, длинная линия: монеты, которые игрок не
// потратил в лавке, уходят в банк, а на банк открываются персонажи.
//
// ГЛАВНАЯ ОПАСНОСТЬ ЭТОГО МЕХАНИЗМА — и она же причина, почему он устроен так
// скупо. Мета-прогрессия обещает, что следующий забег будет ЛЕГЧЕ. Если она
// даёт слишком много, текущий забег обесценивается: играешь не ради него, а
// ради накопления. Поэтому здесь нет и не должно быть постоянных прибавок к
// урону, HP и скорости — банк покупает не силу, а ДРУГОЙ СПОСОБ играть.
// Персонаж — это перекос характеристик и другой стартовый ствол, то есть
// решение, а не преимущество.
//
// Второе следствие того же правила: копится только НЕПОТРАЧЕННОЕ. Монета,
// вложенная в лавку, работала в том забеге и в банк не попадает — иначе
// выгодной стратегией стало бы не покупать ничего и умирать пораньше.
//
// localStorage может быть недоступен целиком (приватное окно, жёсткие
// настройки, iframe). Игра от этого не должна ломаться: банк тогда живёт
// только в памяти вкладки, а забег идёт как шёл. Ровно та же логика, что в
// RecordSystem, и по той же причине.

const KEY="sporegame.meta";

export class MetaSystem {
  constructor(){ this.adopt(this.load()); }

  // Хранилище подменили уже после первого чтения (площадка отдаёт своё
  // промисом — см. Store.use): банк, персонажи и сложности читаются заново.
  // Звать это можно только до забега — на стартовом экране.
  reload(){ this.adopt(this.load()); }

  adopt(s){
    this.bank=s?.bank||0;
    // Стартовый персонаж открыт всегда: список открытого не может быть пустым,
    // иначе играть будет некем.
    this.unlocked=new Set(s?.unlocked||[]);
    this.unlocked.add(CONFIG.characters.starter);
    // Выбранный — только тот, который открыт: сохранение могло прийти из
    // версии игры, где персонаж был, а сейчас его нет.
    this.selected=this.has(s?.selected)?s.selected:CONFIG.characters.starter;

    // СЛОЖНОСТИ. Открываются не за банк, а ПОБЕДОЙ: за деньги здесь не
    // продаётся ничего, кроме другого способа играть, а сложность — это
    // вообще не покупка, это разрешение, которое выдаёт сама игра.
    const D=CONFIG.difficulties;
    this.beaten=new Set((s?.beaten||[]).filter(k=>D.list[k]));
    this.difficulty=this.diffUnlocked(s?.difficulty)?s.difficulty:D.starter;
  }

  // --- сложности --------------------------------------------------------
  // Открыта первая и каждая следующая за пройденной предыдущей. Правило одно
  // на всё: список сложностей — это ЛЕСТНИЦА, а не набор галочек, и перепрыгнуть
  // ступень нельзя даже сохранением из другой версии игры.
  diffUnlocked(key){
    const D=CONFIG.difficulties, i=D.order.indexOf(key);
    if(i<0) return false;
    if(i===0) return true;
    return this.beaten.has(D.order[i-1]);
  }

  diffList(){
    return CONFIG.difficulties.order.map(key=>({
      key, def:CONFIG.difficulties.list[key],
      unlocked:this.diffUnlocked(key),
      beaten:this.beaten.has(key),
      selected:this.difficulty===key
    }));
  }

  diffDef(key){
    const D=CONFIG.difficulties;
    return D.list[key]||D.list[D.starter];
  }
  curDiff(){ return this.diffDef(this.difficulty); }

  selectDiff(key){
    if(!this.diffUnlocked(key)) return false;
    this.difficulty=key; this.save();
    return true;
  }

  // Победа на сложности. Возвращает ключ ОТКРЫВШЕЙСЯ следующей — экран итогов
  // обязан о ней сказать: молча открытая ступень равна неоткрытой.
  beat(key){
    const D=CONFIG.difficulties, i=D.order.indexOf(key);
    if(i<0) return null;
    const fresh=!this.beaten.has(key);
    this.beaten.add(key); this.save();
    const next=D.order[i+1];
    return fresh&&next?next:null;
  }

  load(){
    try{
      const raw=Store.getItem(KEY);
      return raw?JSON.parse(raw):null;
    }catch{ return null; }
  }

  save(){
    try{
      Store.setItem(KEY,JSON.stringify({
        bank:this.bank, unlocked:[...this.unlocked], selected:this.selected,
        beaten:[...this.beaten], difficulty:this.difficulty
      }));
    }catch{}
  }

  // Список персонажей в порядке показа — вместе с тем, открыт ли каждый.
  // Порядок берётся из CONFIG.characters.order, а не из порядка ключей
  // объекта: порядок ключей — это случайность записи, а на экране выбора
  // персонажи должны идти от простого к странному.
  roster(){
    return CONFIG.characters.order.map(id=>({
      id, def:CONFIG.characters.list[id],
      unlocked:this.unlocked.has(id),
      selected:this.selected===id
    }));
  }

  has(id){ return !!id&&this.unlocked.has(id); }

  def(id){ return CONFIG.characters.list[id]||CONFIG.characters.list[CONFIG.characters.starter]; }
  current(){ return this.def(this.selected); }

  select(id){
    if(!this.has(id)) return false;
    this.selected=id; this.save();
    return true;
  }

  // Покупка персонажа. Возвращает false, если не открыт по деньгам, — по
  // этому стартовый экран решает, играть ли звук отказа. Купленный сразу
  // становится выбранным: игрок нажал на него, значит хочет им играть, и
  // второе нажатие ради того же — лишний шаг.
  unlock(id){
    const def=CONFIG.characters.list[id];
    if(!def||this.unlocked.has(id)) return false;
    if(this.bank<def.cost) return false;
    this.bank-=def.cost;
    this.unlocked.add(id);
    this.selected=id;
    this.save();
    return true;
  }

  // Итог забега. Кладём в банк ТО, ЧТО ОСТАЛОСЬ В КОШЕЛЬКЕ, а не заработанное
  // за забег: см. комментарий в шапке. Возвращает внесённую сумму — экран
  // итогов показывает её строкой, иначе прибавка к банку проходит незаметно и
  // читается как «монеты просто пропали».
  deposit(coins){
    const n=Math.max(0,Math.floor(coins||0));
    if(!n) return 0;
    this.bank+=n; this.save();
    return n;
  }

  // Есть ли вообще что показывать на стартовом экране. Пока открыт один
  // персонаж и банк пуст, выбор персонажа — это ряд из одной карточки и
  // цифра «0»: шум, который ничего не сообщает.
  //
  // Но как только в банке появились монеты, ряд обязан показаться сразу же:
  // иначе первая же отложенная монета исчезнет в никуда, а это ровно то
  // ложное обещание, которого в проекте быть не должно.
  isVisible(){ return this.bank>0||this.unlocked.size>1; }
}
