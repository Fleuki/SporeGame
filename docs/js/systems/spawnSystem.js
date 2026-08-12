import { CONFIG } from "../config.js";
import { Enemy } from "../entities/enemy.js";
import { Boss } from "../entities/boss.js";

// СПАВН ВРАГОВ. Пришёл на смену WaveSystem.
//
// Волн больше нет. Раньше забег был нарезан на дискретные пачки: выпустить N
// врагов, дождаться, пока поле почти опустеет, пауза, следующая волна, босс
// каждую десятую. Номер волны при этом торчал наружу — в интерфейс, в выбор
// биома, в множители сложности, в экран поражения.
//
// Теперь единственная переменная — ВРЕМЯ забега. Враги идут потоком, темп и
// их характеристики растут плавно, босс выходит по таймеру. Ритм задают не
// границы волн, а чередование натиска и затишья (pushTime / lullTime): в
// тишине между стычками и живёт вся атмосфера.
export class SpawnSystem {
  // diff — множители выбранной сложности (CONFIG.difficulties). Приходят
  // снаружи, а не читаются из конфига здесь: сложность выбирается на стартовом
  // экране и обязана быть зафиксирована НА ВЕСЬ забег. Читай спавн её сам —
  // и смена сложности в меню посреди уже идущего забега (а туда можно попасть
  // с экрана итогов) меняла бы правила по ходу дела.
  constructor(camera,diff=null){
    this.camera=camera;
    this.diff=diff||CONFIG.difficulties.list[CONFIG.difficulties.starter];
    this.active=true;
    this.time=0;          // секунд с начала забега, тикает в update
    this.spawnTimer=0;    // кадров до следующего врага
    this.phaseTimer=0;    // секунд до смены натиск/затишье
    this.lull=false;      // сейчас затишье — никто не появляется
    this.bossesSpawned=0;
    this.reset();
  }

  reset(){
    this.time=0; this.spawnTimer=0; this.bossesSpawned=0;
    this.phaseTimer=CONFIG.spawn.pushTime; this.lull=false;
    // ФИНАЛ. Сказано ли уже про него и вышел ли последний босс.
    this.finalWarned=false; this.finalSpawned=false;
    // Правило текущей стычки (CONFIG.spawn.modifiers). null — обычный поток.
    this.mod=null;
  }

  // ПРАВИЛО СТЫЧКИ. Разыгрывается один раз на натиск и держится до затишья.
  //
  // Прошлое правило из розыгрыша исключается: две «Стаи» подряд читаются не
  // как правило, а как поломка генератора — игрок решает, что волки теперь
  // всегда, и перестаёт следить за объявлением.
  rollModifier(){
    const M=CONFIG.spawn.modifiers;
    if(this.time<M.unlockAt) return null;
    const prev=this.mod?.key;
    let total=0; const pool=[];
    for(const m of M.list){
      if(this.time<m.from) continue;
      if(m.key===prev) continue;
      total+=m.weight; pool.push([m,total]);
    }
    if(!pool.length) return null;
    const r=Math.random()*total;
    for(const [m,acc] of pool) if(r<acc) return m.key==="plain"?null:m;
    return null;
  }

  // Множитель правила по имени поля — чтобы не писать `this.mod&&this.mod.x||1`
  // в шести местах и не забыть его в седьмом
  modMult(field){ return this.mod?.[field]??1; }

  // 0 в начале забега, 1 после rampTime секунд. Все кривые темпа считаются
  // от неё, чтобы сложность не улетала линейно в бесконечность.
  ramp(t){ return Math.min(1,this.time/t); }

  // Множители характеристик врагов. Отдельным методом, чтобы их видели и
  // рядовые враги, и боссы, и интерфейс, если понадобится.
  scale(){
    const S=CONFIG.spawn, m=this.time/60;
    return {
      hp: S.baseHp*(1+m*S.hpPerMin)*this.modMult("hpMult")*this.diff.hpMult,
      damage: S.baseDamage*(1+m*S.dmgPerMin)*this.modMult("dmgMult")*this.diff.dmgMult,
      // Скорость упирается в потолок ДАЖЕ С ПРАВИЛОМ: враг быстрее игрока
      // превращает игру в безвыходную погоню, а не в бой, и «Стая» не должна
      // становиться исключением из этого.
      speed: Math.min(S.speedCapMult,(1+m*S.speedPerMin)*this.modMult("speedMult")),
      xp: this.modMult("xpMult")
    };
  }

  // Кадров между двумя спавнами прямо сейчас
  interval(){
    const S=CONFIG.spawn;
    return (S.intervalBase+(S.intervalMin-S.intervalBase)*this.ramp(S.rampTime))
           *this.modMult("intervalMult");
  }

  // Потолок живых врагов прямо сейчас.
  //
  // Две ступени, и вторая появилась из живого забега: до aliveRampTime потолок
  // растёт от aliveBase к aliveMax, а ПОСЛЕ — продолжает ползти по
  // aliveLatePerMin до aliveLateMax. Без второй ступени потолок замирал на
  // пятой минуте и держался до конца забега: двадцатая минута отличалась от
  // пятой только толщиной врагов, а игрок к этому времени растёт множителями
  // и просто перестаёт умирать.
  aliveLimit(){
    const S=CONFIG.spawn;
    let n=S.aliveBase+(S.aliveMax-S.aliveBase)*this.ramp(S.aliveRampTime);
    const late=this.time-S.aliveRampTime;
    if(late>0&&S.aliveLatePerMin){
      n=Math.min(S.aliveLateMax??n,n+late/60*S.aliveLatePerMin);
    }
    return Math.round(n*this.modMult("countMult")*this.areaScale()*this.diff.countMult);
  }

  // Потолок задан для ЭТАЛОННОГО кадра (900x700 при зуме 1.6). Кадр обычно
  // ровно такой по площади — её держит fitCanvas, — но у слишком вытянутых
  // окон форма упирается в CONFIG.camera.aspectCap, и дальше кадр растёт.
  // Тогда растёт и потолок: врагов на единицу площади должно остаться
  // столько же, иначе портретный телефон получил бы ту же толпу, размазанную
  // по полуторной арене, — то есть тихо облегчённую игру, ровно в том месте,
  // которое чинили ради честности.
  //
  // Меньше единицы множитель не бывает: узкий кадр не даёт права выпустить
  // МЕНЬШЕ врагов, чем задумано, — там уже работает сама площадь.
  areaScale(){
    const c=this.camera; if(!c||!c.w||!c.h) return 1;
    const ref=(CONFIG.screen.width/CONFIG.camera.zoom)*
              (CONFIG.screen.height/CONFIG.camera.zoom);
    return Math.max(1,c.w*c.h/ref);
  }

  // Секунд до следующего босса — это же показывает интерфейс, если надо
  nextBossIn(){ return Math.max(0,(this.bossesSpawned+1)*CONFIG.spawn.bossEvery-this.time); }

  // === ФИНАЛ ЗАБЕГА ===
  // Секунд до выхода последнего босса. Отрицательное — финал уже начался.
  finalIn(){
    const F=CONFIG.spawn.final;
    return F?F.at-this.time:Infinity;
  }
  // Идёт ли финал: последний босс вышел и ещё не убит. Пока он идёт, рядовой
  // поток молчит — единственный именной бой игры не должен тонуть в той же
  // толпе, что была все пятнадцать минут.
  inFinal(){ return this.finalSpawned; }

  // player нужен ради одного: толщина финального босса считается от уровня
  // игрока (см. ниже). Аргумент необязательный — без него финал выходит
  // базовым, и это честное поведение для любого вызова из прогона.
  tryFinal(enemies,player=null){
    const F=CONFIG.spawn.final;
    if(!F||this.finalSpawned) return null;
    if(!this.finalWarned&&this.time>=F.at-(F.warnAt||0)){
      this.finalWarned=true;
      return {type:"final_warn",seconds:Math.round(F.warnAt||0)};
    }
    if(this.time<F.at) return null;
    // Рядовой босс, вышедший перед самым финалом, ещё может быть жив. Ждём:
    // два босса разом — это не финал, это свалка, в которой не видно, кто из
    // них последний. Но ждём НЕ ДОЛЬШЕ waitBoss: конец забега не имеет права
    // зависеть от того, добил игрок предыдущего босса или бегает от него.
    if(enemies.some(e=>e instanceof Boss&&!e.dead)
       &&this.time<F.at+(F.waitBoss??30)) return null;
    this.finalSpawned=true;
    // Правило стычки снимается вместе с началом финала. Иначе «ТУМАН»,
    // выпавший на последнюю минуту, висит весь финальный бой: правило живёт
    // ровно один натиск, а натисков больше не будет.
    this.mod=null; this.lull=true;
    const p=this.camera.pointOutside(CONFIG.spawn.bossSpawnMargin);
    const boss=new Boss(p.x,p.y,F.boss);
    boss.isFinal=true;
    // ФИНАЛ РОС МЕДЛЕННЕЕ РЯДОВОГО БОССА, И ЭТО БЫЛА ДЫРА В КОДЕ, А НЕ В
    // БАЛАНСЕ. tryBoss умножает здоровье на время забега (bossHpPerMin), а
    // здесь эта строка просто отсутствовала: на 15:00 множитель равен 2.96,
    // то есть рядовой Улей, выйди он в ту же секунду, имел бы 5920 HP, а
    // финальный — 4800. Последний бой игры был слабее очередного.
    //
    // Живой игрой: «последнего босса убил буквально за 1-2 секунды».
    const byTime=1+Math.max(0,this.time-CONFIG.spawn.bossEvery)/60*CONFIG.spawn.bossHpPerMin;
    // ЧЕМ СИЛЬНЕЕ ИГРОК ПРИШЁЛ К ФИНАЛУ, ТЕМ ТОЛЩЕ ФИНАЛ.
    //
    // Без этого финал нельзя настроить вообще: разброс силы игроков к 15-й
    // минуте — больше чем десятикратный. Замер: бот, бравший первую попавшуюся
    // карточку, бьёт 208 единиц в секунду, а живой игрок с добитыми ветками и
    // выкупленной лавкой — около трёх тысяч. Один и тот же босс для первого
    // это семь минут долбёжки, для второго — полторы секунды.
    //
    // Считается по УРОВНЮ, а не по урону: уровень — это то, что игрок набрал
    // сам, его нельзя случайно получить и по нему видно, насколько далеко он
    // зашёл. Ниже порога прибавки нет вовсе — новичок, доползший до финала на
    // пятнадцатом уровне, дерётся с базовым боссом.
    const lv=Math.max(0,(player?.level||1)-(F.levelFrom||15));
    const byLevel=Math.min(F.levelCap||2, 1+lv*(F.levelStep||0.05));
    boss.maxHp*=(F.hpMult||1)*byTime*byLevel*(this.diff.finalHpMult||1);
    boss.hp=boss.maxHp;
    boss.damage*=this.scale().damage*(F.damageMult||1);
    return {type:"boss",boss,final:true,name:F.name};
  }

  update(dt,enemies,player,sporeEffects){
    if(!this.active) return null;
    this.time+=dt;

    // Финал важнее всего остального: он и есть конец забега
    const fin=this.tryFinal(enemies,player);
    if(fin) return fin;
    if(this.finalSpawned) return null;

    // Босс идёт вне очереди и вне затишья: он и есть главное событие забега
    const boss=this.tryBoss(enemies,player);
    if(boss) return boss;

    if(this.time<CONFIG.spawn.graceTime) return null;

    // Натиск и затишье чередуются по таймеру. Пока на поле остался кто-то
    // живой, затишье всё равно идёт — добивать отставших это не мешает.
    this.phaseTimer-=dt;
    let started=false;
    if(this.phaseTimer<=0){
      this.lull=!this.lull;
      this.phaseTimer=this.lull?CONFIG.spawn.lullTime:CONFIG.spawn.pushTime;
      // Правило разыгрывается на входе в натиск и снимается на входе в
      // затишье: в тишине между стычками никаких правил быть не должно,
      // иначе туман висит и тогда, когда бояться нечего.
      if(this.lull) this.mod=null;
      else { this.mod=this.rollModifier(); started=true; }
    }
    if(this.lull) return null;
    // О правиле игрок обязан узнать. Молча изменившиеся числа — это не
    // разнообразие, это ощущение, что игра барахлит.
    if(started&&this.mod) return {type:"push",mod:this.mod};

    const alive=enemies.reduce((n,e)=>n+(e.dead||e instanceof Boss?0:1),0);
    if(alive>=this.aliveLimit()) return null;

    this.spawnTimer--;
    if(this.spawnTimer<=0){
      this.spawnEnemy(enemies,sporeEffects);
      this.spawnTimer=this.interval();
    }
    return null;
  }

  // player нужен только для прибавки по уровню. Необязательный: без него
  // босс выходит базовым, и это правильное поведение по умолчанию — так же
  // устроен tryFinal.
  tryBoss(enemies,player=null){
    const S=CONFIG.spawn;
    if(this.time<(this.bossesSpawned+1)*S.bossEvery) return null;
    if(enemies.some(e=>e instanceof Boss&&!e.dead)) return null;
    // Рядовой босс не выходит на пороге финала: игрок, дожимающий одного
    // босса ровно в ту секунду, когда объявлен последний, не понимает, какой
    // из них какой, — а финал обязан читаться как отдельное событие.
    if(this.finalIn()<(S.final?.warnAt||0)) return null;
    this.bossesSpawned++;
    // ОЧЕРЕДЬ БОССОВ — просто список по кругу. Раньше здесь стояло
    // «каждый второй — Сердцевина», и добавить третьего значило бы переписать
    // условие; со списком третий добавляется одной строкой в конфиге.
    // Порядок и есть очередь: 165-я секунда, 330-я, 495-я, дальше по кругу.
    const type=S.bossOrder[(this.bossesSpawned-1)%S.bossOrder.length];
    // Босс появлялся ровно в центре арены — там же, где стоит игрок, — и
    // мгновенно наносил контактный урон. Ставим его за краем видимости.
    const p=this.camera.pointOutside(S.bossSpawnMargin);
    const boss=new Boss(p.x,p.y,type);
    // Босс четвёртой минуты и босс двадцатой — это разные бои
    const byTime=1+Math.max(0,this.time-S.bossEvery)/60*S.bossHpPerMin;
    // …а босс у сильного игрока и у слабого — тоже разные бои. Раньше этой
    // строки здесь не было, и рядовой босс рос только от времени: одинаково
    // и для добившего все ветки, и для взявшего четыре случайные карточки.
    const lv=Math.max(0,(player?.level||1)-(S.bossLevelFrom||8));
    const byLevel=Math.min(S.bossLevelCap||1.9,1+lv*(S.bossLevelStep||0.05));
    boss.maxHp*=byTime*byLevel; boss.hp=boss.maxHp; boss.damage*=this.scale().damage;
    return {type:"boss",boss};
  }

  // Кого выпускаем. Типы входят в поток по времени (unlock.<тип>.at), а их
  // доли плавно меняются от стартовых к поздним (unlock.<тип>.weight).
  //
  // Раньше здесь стояла лесенка из вложенных Math.random() с порогами
  // 0.6/0.7/0.75, где каждое следующее условие перетирало предыдущее.
  // Посчитать по ней реальную долю типа было невозможно, а именно доли и есть
  // сложность: толпа медленных мешков и толпа волков с трубачами — это два
  // совершенно разных боя при одинаковом числе врагов на экране.
  pickType(enemies){
    const S=CONFIG.spawn;
    const k=Math.min(1,this.time/S.weightRamp);
    const only=this.mod?.only;
    let total=0;
    const pool=[];
    for(const key in S.unlock){
      const u=S.unlock[key];
      // Правило может сузить состав до одного-двух типов. Время разблокировки
      // при этом НЕ игнорируется: «Стая» до появления волков выдала бы пустой
      // пул и молча свалилась бы в спороносца.
      if(only&&!only.includes(key)) continue;
      if(this.time<u.at) continue;
      // Тип, упёршийся в свой потолок живых, из розыгрыша выпадает. Правило
      // может этот потолок поднять — на том и стоит «Хор».
      //
      // maxAlivePer — раз во сколько секунд потолок прибавляет единицу, а
      // maxAliveCap — предел, за который эта прибавка не пускает. Нужно
      // ровно трубачу: тройка стрелков, страшная на второй минуте, к десятой
      // не значит ничего, а других причин двигаться у игрока к тому времени
      // почти не остаётся.
      let cap=u.maxAlive!=null?u.maxAlive:null;
      if(cap!=null&&u.maxAlivePer){
        cap=Math.min(u.maxAliveCap??Infinity,cap+Math.floor(this.time/u.maxAlivePer));
      }
      if(cap!=null) cap*=this.modMult("maxAliveMult");
      if(cap!=null&&this.countAlive(enemies,key)>=cap) continue;
      const w=u.weight[0]+(u.weight[1]-u.weight[0])*k;
      if(w<=0) continue;
      total+=w; pool.push([key,total]);
    }
    if(!pool.length) return "spore_bearer";
    const r=Math.random()*total;
    for(const [key,acc] of pool) if(r<acc) return key;
    return pool[pool.length-1][0];
  }

  countAlive(enemies,key){
    let n=0;
    for(const e of enemies) if(!e.dead&&e.typeKey===key) n++;
    return n;
  }

  spawnEnemy(enemies,sporeEffects){
    // Спавн привязан к камере, а не к фиксированной арене: враги всегда
    // появляются сразу за краем экрана, куда бы игрок ни ушёл.
    const p=this.camera.pointOutside(CONFIG.spawn.spawnMargin);
    // Элита от заражения и элита от правила «Отборные» — одно и то же
    // свойство, поэтому берётся максимум, а не сумма: иначе на 100% спор
    // шанс перевалил бы за единицу и правило перестало бы что-либо значить.
    const isMutated=Math.random()<Math.max(sporeEffects.mutateChance||0,this.mod?.eliteChance||0);
    enemies.push(new Enemy(p.x,p.y,this.pickType(enemies),isMutated,this.scale()));
  }
}
