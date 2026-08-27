// БРАУЗЕРНОЙ ПРОКРУТКИ В ИГРЕ БЫТЬ НЕ ДОЛЖНО (п. 1.10.2 требований площадки).
//
// Замечание с модерации дословно: «браузерная прокрутка присутствует во время
// игры». Ловится это не одним выключателем, а тремя разными путями, и каждый
// надо закрыть отдельно:
//   — сам документ выше окна (лечится вёрсткой — см. style.css, html/body
//     прибиты `position: fixed`);
//   — инерционный скролл и pull-to-refresh на телефоне (палец по экрану);
//   — колесо мыши и клавиши-стрелки/пробел/PageDown на десктопе.
//
// Здесь закрыты второй и третий. Первый — в CSS: одно без другого не работает.
//
// ЧТО ЭТО НЕ ДОЛЖНО СЛОМАТЬ. Внутренняя прокрутка ПАНЕЛЕЙ игры (прокачка,
// лавка, лаборатория, экран итогов, стартовый экран на низком окне) — это не
// браузерная прокрутка страницы, а часть интерфейса: панель с восемью
// карточками на телефоне иначе просто не помещается. Поэтому жест не
// запрещается вслепую, а сначала спрашивается, есть ли под пальцем элемент,
// которому вправду есть куда прокручиваться.

// Ближайший предок, который РЕАЛЬНО прокручивается: и содержимое выше рамки,
// и прокрутка ему разрешена стилями. Именно «реально»: у панели, влезающей в
// экран целиком, `overflow-y: auto` стоит всегда, но прокручивать в ней
// нечего — и жест над ней обязан быть запрещён, как над любым другим местом.
function scrollableUnder(node){
  for(let el=node instanceof Element?node:null; el; el=el.parentElement){
    if(el===document.body||el===document.documentElement) break;
    if(el.scrollHeight>el.clientHeight+1){
      const oy=getComputedStyle(el).overflowY;
      if(oy==="auto"||oy==="scroll") return el;
    }
  }
  return null;
}

// Поля ввода игре не принадлежат: ползунки громкости двигаются стрелками, и
// отнимать у них клавиши нельзя.
function isField(el){
  return el instanceof Element &&
         /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

// Клавиши, которыми страницу прокручивают. Стрелки и пробел игра разбирает
// сама (см. engine/input.js) и там же гасит — здесь они на случай, когда
// фокус ушёл на кнопку или в панель и до игрового обработчика не дошло.
const SCROLL_KEYS=new Set([" ","Spacebar","PageUp","PageDown","Home","End",
                           "ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]);

export function lockScroll(){
  // passive:false обязателен: без него браузер вправе не слушать
  // preventDefault, и на телефоне страница поедет всё равно.
  document.addEventListener("touchmove",(e)=>{
    // Двумя пальцами — это зум, и он запрещён всегда: масштаб игры задаёт
    // сама игра (см. fitCanvas), а раздвинутый пальцами кадр прокручивается.
    if(e.touches.length>1||!scrollableUnder(e.target)) e.preventDefault();
  },{passive:false});

  window.addEventListener("wheel",(e)=>{
    if(!scrollableUnder(e.target)) e.preventDefault();
  },{passive:false});

  document.addEventListener("keydown",(e)=>{
    if(!SCROLL_KEYS.has(e.key)||isField(e.target)) return;
    if(scrollableUnder(e.target)) return;
    e.preventDefault();
  });

  // Жест масштабирования Safari — отдельное событие, touch-action его не
  // ловит: без этого страницу на iPhone можно раздвинуть двумя пальцами и
  // получить прокрутку там, где её только что запретили.
  for(const ev of ["gesturestart","gesturechange","gestureend"]){
    document.addEventListener(ev,(e)=>e.preventDefault(),{passive:false});
  }

  // Выделение текста и контекстное меню (п. 1.6). Холст своё меню гасил и
  // раньше, но интерфейс игры — это разметка, и долгий тап по кнопке на
  // телефоне открывал системное меню поверх боя.
  document.addEventListener("contextmenu",(e)=>e.preventDefault());
  document.addEventListener("selectstart",(e)=>{ if(!isField(e.target)) e.preventDefault(); });
  document.addEventListener("dragstart",(e)=>e.preventDefault());

  // ПОСЛЕДНИЙ РУБЕЖ. Прокрутить страницу можно и не жестом: фокус на кнопке
  // ниже сгиба, поиск по странице, всплывшая клавиатура. Если документ всё же
  // уехал — возвращаем его на место.
  window.addEventListener("scroll",()=>{
    if(window.scrollX||window.scrollY) window.scrollTo(0,0);
  },{passive:true});
}
