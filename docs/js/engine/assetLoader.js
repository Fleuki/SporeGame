export class AssetLoader {
  constructor(){ this.images=new Map(); this.sounds=new Map(); this.deferred=new Set(); this.loaded=0; this.total=0; }
  // optional — ассет, которого может не быть (ещё не нарисован). Игра обязана
  // работать без него, поэтому в консоль он падает заметкой, а не жалобой.
  loadImage(key,src,optional=false){
    return new Promise((resolve)=>{
      const img=new Image();
      img.onload=()=>{ this.images.set(key,img); this.loaded++; resolve(img); };
      img.onerror=()=>{
        if(optional) console.info("Необязательный ассет не найден, игра идёт без него:",src);
        else console.warn("Не загрузилось:",src);
        resolve(null);
      };
      img.src=src; this.total++;
    });
  }
  // ЗВУК СЧИТАЕТСЯ ГОТОВЫМ СРАЗУ, А НЕ ПО СОБЫТИЮ ЗАГРУЗКИ.
  //
  // Это выглядит неправильно ровно до одного факта: Safari на iPhone НЕ
  // БУФЕРИЗУЕТ звук заранее. `preload="auto"` там просьба, которую браузер
  // игнорирует, чтобы не тратить мобильный трафик, — данные он начинает
  // тянуть только по вызову play(). Значит `canplay` не приходит никогда, и
  // ждущий его загрузчик навсегда остаётся в состоянии «файла нет».
  //
  // А «файла нет» в этой игре означает не тишину, а СИНТЕЗИРОВАННУЮ ЗАГЛУШКУ
  // (см. AudioManager.applyMusic). Со стороны это выглядело так: на
  // компьютере играет написанный трек, на телефоне — арпеджио из осциллятора,
  // и никакой ошибки при этом нигде нет. Поймано живой игрой, дословно:
  // «музыка как будто не моя, другую какую-то слышу».
  //
  // Здесь до этого уже был один заход на ту же грабку — переход с
  // canplaythrough на canplay. Он чинил браузеры, которые тянут только
  // заголовок, но не тот, который не тянет вообще ничего.
  //
  // Поэтому элемент кладётся в набор сразу: воспроизведение начнёт качать
  // файл само, и начнёт вовремя — play() у музыки зовётся из нажатия
  // «Играть», то есть из того самого жеста, которого ждёт мобильный браузер.
  // Ошибка (файла нет, сеть отвалилась) убирает элемент обратно и зовёт
  // onSoundError — тогда и включится заглушка, теперь уже по делу.
  //
  // defer — трек, который в первую минуту забега не нужен. Замер загрузки
  // показал, за что это платилось: все четыре трека (7.2 МБ) уходили в сеть
  // на 0.3-й секунде, ЕЩЁ НА СТАРТОВОМ ЭКРАНЕ, — то есть человек, который
  // посмотрел на название и закрыл вкладку, успевал скачать всю музыку игры.
  // На телефоне с мобильным интернетом это те самые секунды, за которые с
  // портала уходят. С preload="none" браузер не трогает файл до load()/play():
  // тему забега тянет сама игра по нажатию «Играть», остальные три просит
  // warmSounds() уже в забеге.
  //
  // На iPhone это ничего не меняет: Safari и так игнорировал preload="auto"
  // (см. выше). Меняется поведение настольных браузеров и Android.
  loadSound(key,src,defer=false){
    return new Promise((resolve)=>{
      const audio=new Audio();
      audio.preload=defer?"none":"auto";
      if(defer) this.deferred.add(key);
      audio.onerror=()=>{
        console.warn("Не загрузился звук:",src);
        this.sounds.delete(key);
        this.onSoundError?.(key);
        resolve(null);
      };
      audio.src=src;
      this.sounds.set(key,audio); this.loaded++; this.total++;
      resolve(audio);
    });
  }
  getImage(key){ return this.images.get(key); }
  getSound(key){ return this.sounds.get(key); }
  // ДОГРУЗИТЬ ОТЛОЖЕННОЕ. Зовётся из забега, а не из загрузки страницы (см.
  // loadSound) и намеренно с задержкой: боссовый трек в 2.2 МБ, начатый в ту
  // же секунду, что и тема забега, отнимал бы канал у трека, который нужен
  // ПРЯМО СЕЙЧАС. Босс выходит на 2:45 — времени на скачивание вдоволь.
  //
  // Играющий элемент не трогаем: load() перезапускает медиа с нуля, то есть
  // оборвал бы музыку в момент вызова.
  warmSounds(){
    for(const key of [...this.deferred]){
      const el=this.sounds.get(key);
      this.deferred.delete(key);
      if(!el||!el.paused) continue;
      try{ el.preload="auto"; el.load(); }catch{}
    }
  }
  async loadAll(cfg){
    const promises=[];
    const optional=new Set(cfg.optional||[]);
    const defer=new Set(cfg.deferSounds||[]);
    for(const [k,p] of Object.entries(cfg.images||{})) promises.push(this.loadImage(k,p,optional.has(k)));
    for(const [k,p] of Object.entries(cfg.sounds||{})) promises.push(this.loadSound(k,p,defer.has(k)));
    await Promise.all(promises);
    console.log("Ассеты:",this.loaded,"/",this.total);
  }
}