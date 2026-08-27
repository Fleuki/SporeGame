export class AssetLoader {
  constructor(){
    this.images=new Map();
    // ЗВУК ХРАНИТСЯ РАСКОДИРОВАННЫМ БУФЕРОМ, А НЕ МЕДИА-ЭЛЕМЕНТОМ.
    // Почему именно так — в шапке loadSound.
    this.sounds=new Map();      // key → AudioBuffer, готовый к проигрыванию
    this.urls=new Map();        // key → адрес файла: буфер приходит позже
    this.deferred=new Set();
    this.inflight=new Set();
    this.loaded=0; this.total=0;
  }
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
  // МУЗЫКА ГРУЗИТСЯ ФАЙЛОМ И ДЕКОДИРУЕТСЯ В БУФЕР. НИКАКИХ МЕДИА-ЭЛЕМЕНТОВ.
  //
  // Здесь стоял конструктор Audio, и он стоил игре двух отказов на модерации
  // сразу (пп. 1.6.2.5 и 1.6.1.6): любой HTMLAudioElement поднимает системный
  // плеер — на десктопе окошко управления медиа, на телефоне карточку в шторке
  // уведомлений. С точки зрения площадки игра, которую можно поставить на
  // паузу из панели уведомлений, — это не игра, а плеер, и требование звучит
  // прямо: весь звук через Web Audio API.
  //
  // Что из этого следует по коду: файл надо получить самому (fetch), самому
  // раскодировать в AudioBuffer и самому же проигрывать через
  // AudioBufferSourceNode (см. SoundManager.playFile). Декодированием
  // занимается звук, а не загрузчик, — сюда он отдаёт свою функцию в
  // `decodeSound`.
  //
  // ЗАГРУЗЧИК НЕ ЖДЁТ ЗВУКА. Обещание разрешается сразу, ещё до того как файл
  // ушёл в сеть: музыка не должна задерживать `LoadingAPI.ready()` — площадка
  // держит свой экран загрузки ровно до него, и четыре мегабайта музыки
  // означали бы четыре лишние секунды крутилки над готовой игрой. Пока файла
  // нет, играет синтез (см. SoundManager.applyMusic) — ровно тот же откат, что
  // и раньше.
  //
  // defer — трек, который в первую минуту забега не нужен. Замер загрузки
  // показал, за что это платилось: все четыре трека (7.2 МБ) уходили в сеть
  // на 0.3-й секунде, ЕЩЁ НА СТАРТОВОМ ЭКРАНЕ, — то есть человек, который
  // посмотрел на название и закрыл вкладку, успевал скачать всю музыку игры.
  // Отложенные не трогаются вовсе, пока их не попросит warmSounds() из забега
  // или сам звук, когда трек понадобился.
  loadSound(key,src,defer=false){
    this.urls.set(key,src);
    this.total++; this.loaded++;
    if(defer) this.deferred.add(key);
    else this.requestSound(key);
    return Promise.resolve(null);
  }
  // ПРИНЕСТИ ФАЙЛ. Зовётся и загрузчиком (для неотложенных треков), и самим
  // звуком в тот момент, когда трек понадобился. Повторный вызов для уже
  // принесённого или летящего ключа ничего не делает — на этом держится
  // право звать его хоть каждый кадр.
  requestSound(key){
    if(this.sounds.has(key)||this.inflight.has(key)) return;
    const url=this.urls.get(key);
    if(!url||!this.decodeSound) return;
    this.deferred.delete(key);
    this.inflight.add(key);
    fetch(url)
      .then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.arrayBuffer(); })
      .then(bytes=>this.decodeSound(bytes))
      .then(buffer=>{
        this.inflight.delete(key);
        if(!buffer) throw new Error("пустой буфер");
        this.sounds.set(key,buffer);
        this.onSoundReady?.(key);
      })
      .catch((e)=>{
        // Файла нет, сеть отвалилась, декодер не справился — все три случая
        // означают одно и то же: играет синтез. Ошибка приходит уже после
        // того, как игра пошла, поэтому звук о ней узнаёт колбэком.
        this.inflight.delete(key);
        this.sounds.delete(key);
        console.warn("Не загрузился звук:",url,String(e&&e.message||e));
        this.onSoundError?.(key);
      });
  }
  getImage(key){ return this.images.get(key); }
  getSound(key){ return this.sounds.get(key); }
  // ДОГРУЗИТЬ ОТЛОЖЕННОЕ. Зовётся из забега, а не из загрузки страницы (см.
  // loadSound) и намеренно с задержкой: боссовый трек в 2.2 МБ, начатый в ту
  // же секунду, что и тема забега, отнимал бы канал у трека, который нужен
  // ПРЯМО СЕЙЧАС. Босс выходит на 2:45 — времени на скачивание вдоволь.
  warmSounds(){
    for(const key of [...this.deferred]) this.requestSound(key);
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
