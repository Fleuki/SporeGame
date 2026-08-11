// ХРАНИЛИЩЕ ИГРЫ — ОДНА ДВЕРЬ ВМЕСТО ТРЁХ ОБРАЩЕНИЙ К localStorage.
//
// Рекорд, банк и громкости лежали каждый в своём `localStorage.getItem`, и
// каждое обращение было обёрнуто в try/catch «на случай приватного окна».
// Пока игра открывалась со своего адреса, дальше этого можно было не идти.
//
// На Яндекс Играх — идти надо. Игра там живёт в чужом iframe, и localStorage
// в нём принадлежит не ей: браузеры на движке WebKit (весь iOS и Safari на
// маке) режут стороннее хранилище, а сам SDK Яндекса про это предупреждает
// дословно — «localStorage is broken on iOS/MacOS, please use
// ysdk.getStorage()». Наш try/catch в этом случае честно отработает и вернёт
// пустоту: игра не упадёт, но у половины игроков площадки не будет ни
// рекорда, ни банка, ни открытых персонажей — молча, без единой ошибки.
//
// Поэтому хранилище стало ПОДМЕНЯЕМЫМ. По умолчанию это localStorage (или
// память, если и его нет), а площадка, у которой есть своё, подставляет своё
// через use() — и тогда всё, что уже прочитано из пустоты, перечитывается
// заново (см. onSwap).

// Память — последний рубеж. Забег с ней отыграется целиком, не переживёт
// только перезагрузку страницы: это ровно то поведение, которое было раньше
// при недоступном localStorage, и терять его незачем.
const memory=new Map();
const memoryImpl={
  getItem:(k)=>memory.has(k)?memory.get(k):null,
  setItem:(k,v)=>{ memory.set(k,String(v)); },
  removeItem:(k)=>{ memory.delete(k); },
};

// ПРОВЕРЯЕМ ЗАПИСЬЮ, А НЕ НАЛИЧИЕМ ОБЪЕКТА. Браузер может отдавать
// `window.localStorage` и бросать исключение на первой же записи — именно так
// ведёт себя Safari в приватном окне. Проверка «есть ли localStorage»
// пропустила бы это и уронила бы первое сохранение.
function detect(){
  try{
    const probe="sporegame.probe";
    localStorage.setItem(probe,"1");
    localStorage.removeItem(probe);
    return localStorage;
  }catch{ return null; }
}

const found=detect();
let impl=found||memoryImpl;
// Имя запоминается, а не вычисляется сравнением с localStorage. Разница
// важная: в заблокированном окружении САМО ОБРАЩЕНИЕ к window.localStorage
// бросает исключение, и «безобидная» проверка `impl===localStorage` роняет
// всё, что её позовёт. Поймано прогоном с наглухо закрытым хранилищем.
let label=found?"localStorage":"memory";

export const Store={
  // Что под фасадом: localStorage, память или хранилище площадки. Игре знать
  // незачем, прогону и разбору — полезно.
  get name(){ return label; },

  getItem(key){
    try{ return impl.getItem(key); }catch{ return null; }
  },
  setItem(key,value){
    try{ impl.setItem(key,String(value)); }catch{}
  },
  removeItem(key){
    try{ impl.removeItem(key); }catch{}
  },

  // ХРАНИЛИЩЕ ПЛОЩАДКИ ПРИХОДИТ ПОЗЖЕ ЧТЕНИЯ, и это не небрежность: SDK
  // отдаёт его промисом, а рекорд с банком читаются на первом кадре, до
  // всякой сети. Ждать SDK, чтобы показать стартовый экран, нельзя — игра
  // обязана открываться и там, где его нет вовсе.
  //
  // Поэтому порядок такой: читаем из того, что есть; пришло лучшее —
  // подменяем и перечитываем. onSwap вешает main.
  use(next){
    if(!next||next===impl) return false;
    try{
      const probe="sporegame.probe";
      next.setItem(probe,"1");
      next.removeItem(probe);
    }catch{ return false; }
    // То, что успели записать в память до подмены (первый забег на iPhone
    // укладывается в эти секунды целиком), переносим — иначе рекорд, только
    // что поставленный, пропал бы ровно в момент починки хранилища.
    if(impl===memoryImpl) for(const [k,v] of memory) { try{ next.setItem(k,v); }catch{} }
    impl=next; label="platform";
    this.onSwap?.();
    return true;
  },
  onSwap:null,
};
