import { angleTo } from "../utils/math.js";
import { CONFIG } from "../config.js";
import { Entity } from "./entity.js";
import { WORLD } from "../core/camera.js";
import { Weapon } from "./weapon.js";

// РЯДЫ ЛИСТА АЛХИМИКА, как они нарисованы на самом деле:
//   0 — лицом на камеру (вниз)
//   1 — три четверти, маска и хобот смотрят ВПРАВО
//   2 — три четверти, маска и хобот смотрят ВЛЕВО
//   3 — со спины, капюшон (вверх)
//
// Раньше здесь стояло «1 — влево, 2 — вправо», то есть ровно наоборот, и
// персонаж бежал влево, а смотрел вправо. Комментарий никто не сверял с
// картинкой — теперь сверено покадрово, см. ASSET_PROMPTS.md.
function angleToRow(angle){
  if(angle>=-Math.PI/4 && angle<Math.PI/4) return 1;        // вправо
  if(angle>=Math.PI/4 && angle<3*Math.PI/4) return 0;       // вниз
  if(angle>=-3*Math.PI/4 && angle<-Math.PI/4) return 3;     // вверх
  return 2;                                                 // влево
}

// Центральный угол каждого ряда — от него считается, насколько далеко
// «уехало» желаемое направление, прежде чем разрешить разворот.
// Порядок обязан совпадать с angleToRow выше.
const ROW_ANGLE=[Math.PI/2, 0, Math.PI, -Math.PI/2];

// Кратчайшая разница углов в диапазоне [-PI, PI]
function angleDelta(a,b){
  let d=(a-b)%(Math.PI*2);
  if(d>Math.PI) d-=Math.PI*2;
  if(d<-Math.PI) d+=Math.PI*2;
  return d;
}

export class Player extends Entity {
  // character — запись из CONFIG.characters.list. Ничего, кроме перекоса
  // характеристик и стартового ствола, персонаж не задаёт: остальное игрок
  // набирает сам за забег, и так и должно быть. Аргумент необязательный —
  // без него получается Алхимик, то есть ровно тот игрок, что был до
  // появления выбора.
  constructor(x,y,character=null){
    super(x,y,CONFIG.player.radius);
    const C=character||CONFIG.characters.list[CONFIG.characters.starter];
    this.character=C;
    this.speed=CONFIG.player.speed*(C.speedMult??1);
    this.maxHp=Math.round(CONFIG.player.maxHp*(C.hpMult??1));
    this.hp=this.maxHp; this.xp=0; this.level=1; this.xpToNext=14;
    this.damage=CONFIG.player.damage*(C.dmgMult??1);
    // Общий множитель перезарядки ВСЕХ стволов: 1 — как в конфиге, меньше —
    // быстрее. Карточка «Ускоренный экстракт» умножает именно его, а каждый
    // ствол сверху крутит ещё и свой (Weapon.rateMult).
    this.rateMult=1;
    // Стволы стреляют одновременно, каждый по своему таймеру.
    // Первый задаёт персонаж, остальные выдаются карточками прокачки.
    this.weapons=[new Weapon(CONFIG.weapons[C.weapon]||CONFIG.weapons.antidote)];
    // Заражённый начинает забег уже с полной сороковкой спор: выброс стоит
    // 30%, то есть у него он готов с первой секунды. Это не подарок, а его
    // устройство — здоровье он за это жжёт постоянно (см. sporeBurn ниже).
    this.angle=0; this.color=CONFIG.player.color;
    this.sporeLevel=C.startSpore||0;
    // ЗАМЕДЛЕНИЕ ВМЕСТО ЗАХВАТА. Раньше здесь был флаг isGrabbed: щупальце
    // выставляло его, и Player.update выходил в первой же строке — управления
    // не было вообще целую секунду. В игре, где всё выживание держится на
    // движении, это не угроза, а отъём игры.
    // Теперь то же щупальце вешает slowMult на slowTimer кадров: идти можно,
    // но вдвое медленнее. Решение остаётся у игрока.
    this.slowTimer=0; this.slowMult=1;
    // hasShield — щит вообще получен, shieldActive — заряд на месте.
    // Раньше был только shieldActive: заблокировал один удар — и всё, апгрейд
    // навсегда превращался в пустую карточку вопреки описанию.
    this.hasShield=false; this.shieldActive=false; this.shieldCd=0;
    // Прибавка к радиусу притяжения лута от карточек «Магнит мицелия»
    this.lootRadius=0;
    this.regen=0; this.xpMult=1;
    // Кадры, оставшиеся до возобновления регенерации. Ставится в takeDamage,
    // тикает в update: реген работает только вне боя (см. update).
    this.regenLock=0;
    // Мутации ускоряют заражение через свой множитель, а не правкой CONFIG:
    // глобальный конфиг живёт дольше забега, и правки в нём переносились
    // в следующие партии.
    this.sporeRate=C.sporeMult??1;
    // ВЫБРОС СПОР. Заражение теперь не только копится, но и тратится: см.
    // CONFIG.sporeSystem.burst и BattleSystem.sporeBurst. Здесь живёт только
    // перезарядка и множители от карточек — сам удар считает бой, потому что
    // игрок не знает ни про сетку врагов, ни про камеру.
    this.burstCd=0;
    this.burstPower=1;   // множитель урона выброса
    this.burstArea=1;    // множитель радиуса выброса
    this.iframes=0; this.hurtFlash=0; this.onHurt=null;
    this.isDying=false; this.deathFrame=0; this.deathTimer=0;
    // Сколько раз взято каждое улучшение — по этому UpgradeSystem убирает из
    // колоды выбранное до предела
    this.taken={};
    // ЛАВКА. Кошелёк и покупки живут на игроке, а не в ShopSystem: система
    // одна на все забеги, а деньги — у конкретного персонажа, и рестарт
    // обязан их обнулять вместе с ним.
    this.coins=0; this.bought={}; this.coinsEarned=0;
    // Доля урона, которую съедает броня из лавки. Складывается вычитанием
    // процентов, а не умножением: потолок в takeDamage всё равно стоит, а
    // «−8%» на карточке должно означать ровно −8%, иначе четыре пластины
    // дают не 32%, как обещано, а 28% — и ни один игрок этого не проверит,
    // но обещание всё равно будет ложным.
    this.armor=0;
    // Второй ярус лавки. Всё это читается снаружи — боем, лутом, самой
    // лавкой, — поэтому живёт на игроке, а не в системах: система одна на
    // все забеги, а покупки принадлежат конкретному персонажу.
    this.thorns=0;          // урон в ответ тому, кто ударил вас вплотную
    this.critBonus=0;       // прибавка к шансу крита поверх CONFIG.feel
    this.antidoteHeal=0;    // антидот вдобавок лечит
    this.rerollDiscount=0;  // перерисовка в лавке дешевле
    // Второе дыхание: переживает ОДИН смертельный удар за забег. Флаг
    // снимается в момент срабатывания — страховка одноразовая, иначе игра
    // теряет свою единственную ставку.
    this.secondWind=false;
    this.animTimer=0; this.animFrame=0;
    this.animSpeed=CONFIG.player.walkAnimSpeed||8;
    this.isMoving=false;
    // Ряд листа, который показываем сейчас, и запрет на смену ряда в
    // ближайшие кадры. Оба живут отдельно от angle: angle — это ПРИЦЕЛ, он
    // висит на мыши и меняется каждый кадр, а разворот тела к нему не привязан
    // вообще (см. updateFacing).
    this.faceRow=0; this.faceHold=0;
    // life читался проверкой регенерации, но нигде не задавался:
    // undefined%60 === NaN, поэтому апгрейд «Мицелиевое исцеление» не лечил.
    // Теперь счётчик приходит из Entity.
  }

  update(dt,ctx){
    const {input,enemies,camera}=ctx;
    this.life++;
    if(this.iframes>0) this.iframes--;
    if(this.hurtFlash>0) this.hurtFlash--;
    if(this.slowTimer>0&&--this.slowTimer<=0) this.slowMult=1;
    if(this.burstCd>0) this.burstCd--;
    let dx=0,dy=0;
    if(input.keys.w) dy=-1; if(input.keys.s) dy=1; if(input.keys.a) dx=-1; if(input.keys.d) dx=1;
    if(dx!==0&&dy!==0){ dx*=0.707; dy*=0.707; }

    // РЫВОК УБРАН. Он срабатывал по двойному нажатию WASD и телепортировал на
    // 40 единиц — но проверка стояла ВНУТРИ цикла по четырём клавишам и на
    // нажатой клавише срабатывала КАЖДЫЙ кадр, пока укладывалась в свои 250 мс.
    // На диагонали засчитывались обе клавиши сразу. В итоге вместо рывка
    // получался неуправляемый прыжок через полэкрана, иногда сквозь толпу.
    // Кулдауна у него не было вовсе. Возвращать это стоит уже как нормальный
    // рывок: отдельная кнопка, кадры неуязвимости, перезарядка.

    // Мир не привязан к размеру холста, но и не бесконечен: игрок ходит
    // свободно внутри арены, а на её границе упирается.
    const speed=this.speed*this.slowMult;
    this.x+=dx*speed; this.y+=dy*speed;
    this.x=Math.min(Math.max(this.x,WORLD.minX+this.radius),WORLD.maxX-this.radius);
    this.y=Math.min(Math.max(this.y,WORLD.minY+this.radius),WORLD.maxY-this.radius);

    const autoAim=input.getAutoAimAngle(this,enemies);
    if(autoAim!==null) this.angle=autoAim;
    else {
      // Мышь приходит в экранных координатах, целиться нужно в мировых
      const m=camera?camera.toWorld(input.mouse.x,input.mouse.y):input.mouse;
      this.angle=angleTo(this.x,this.y,m.x,m.y);
    }

    // Щит копит заряд, пока его нет
    if(this.hasShield&&!this.shieldActive&&--this.shieldCd<=0) this.shieldActive=true;
    // РЕГЕНЕРАЦИЯ ИДЁТ, ТОЛЬКО ПОКА В ТЕБЯ НЕ ПОПАДАЮТ.
    //
    // Живая игра: «можно танчить просто, вилять от врагов смысла нет». Замер
    // подтвердил дословно — неподвижный игрок с прокачанным лечением на
    // четвёртой-восьмой минуте в ПЛЮСЕ по здоровью (+2.6, +3.0, +5.6 HP в
    // секунду). Виноват был не размер регена, а то, что он капал В БОЮ: 8
    // HP/сек — это больше, чем берёт с игрока середина забега, и стоять в
    // толпе становилось выгоднее, чем уходить от неё.
    //
    // Теперь удар обнуляет отсчёт (`regenLock` в takeDamage), и лечение
    // начинается только через regenDelay кадров после последнего попадания.
    // Смысл механики от этого не меняется, а меняется, КОГДА она работает:
    // реген — это «отдышаться, оторвавшись от толпы», а не «стоять в толпе».
    // Кайтинг он по-прежнему вознаграждает, причём теперь по-настоящему:
    // оторвался — лечишься, стоишь — нет.
    if(this.regenLock>0) this.regenLock--;
    if(this.regen>0 && this.hp<this.maxHp && this.regenLock<=0 && this.life%60===0)
      this.hp=Math.min(this.maxHp,this.hp+this.regen);

    // Заражение растёт само по себе — в этом весь смысл механики: споры
    // копятся всегда, а сбить их можно только антидотом.
    this.sporeLevel=Math.min(CONFIG.sporeSystem.maxSpore,
      this.sporeLevel+CONFIG.player.sporeGrowth*this.sporeRate*dt);
    // ЦЕНА ЗАРАЖЕНИЯ. У всех она порогом: выше 75% начинает капать здоровье.
    // У Заражённого порога нет — он горит всегда и тем сильнее, чем полнее
    // шкала. Правило ЗАМЕНЯЕТ пороговое, а не складывается с ним: иначе он
    // платил бы дважды за одно и то же.
    if(this.character.sporeBurn){
      this.hp-=this.character.sporeBurn*(this.sporeLevel/CONFIG.sporeSystem.maxSpore)*dt;
    } else if(this.sporeLevel>=75){
      this.hp-=CONFIG.sporeSystem.effects.critical.hpDrain*dt;
    }

    // Анимация ходьбы — крутится только когда игрок реально идёт.
    // Стоит на месте — первый кадр ряда и никаких других движений: ни
    // разворота вслед за мышью, ни позы броска.
    this.isMoving=(dx!==0||dy!==0);
    if(this.isMoving){
      // Разворот только по ходьбе. Спрайт ходьбы обязан показывать, куда
      // персонаж ШАГАЕТ, иначе он идёт боком и спиной вперёд.
      this.updateFacing(Math.atan2(dy,dx));
      this.animTimer++;
      if(this.animTimer>=this.animSpeed){
        this.animTimer=0;
        // Счётчик РАСТЁТ без остатка, а по числу колонок его делят уже при
        // отрисовке. Иначе пришлось бы знать здесь, какой лист сейчас в деле —
        // а он зависит от того, догрузился ли необязательный лист бега.
        this.animFrame++;
      }
    } else {
      if(this.faceHold>0) this.faceHold--;
      this.animTimer=0; this.animFrame=0;
    }
  }

  // Разворот с гистерезисом. Границы секторов проходят по диагоналям, и
  // стоит направлению лечь рядом с границей — без запаса персонаж мигал бы
  // между двумя рядами каждый кадр. Чтобы уйти из текущего ряда, надо
  // отклониться больше чем на 45° + facingHysteresis, и не чаще, чем раз в
  // facingHold кадров.
  updateFacing(want){
    if(this.faceHold>0) this.faceHold--;
    const off=Math.abs(angleDelta(want,ROW_ANGLE[this.faceRow]));
    if(off<=Math.PI/4+CONFIG.player.facingHysteresis) return;
    if(this.faceHold>0) return;
    const row=angleToRow(want);
    if(row===this.faceRow) return;
    this.faceRow=row; this.faceHold=CONFIG.player.facingHold;
  }

  // Замедление от щупальца. Оно ОБНОВЛЯЕТСЯ, а не складывается: стоя в
  // щупальце, игрок остаётся медленным, но два щупальца рядом не превращают
  // половинную скорость в четвертную — из такого уже не выйти, а это ровно
  // тот же отъём движения, только другими словами.
  applySlow(mult,frames){
    this.slowMult=Math.min(this.slowMult,mult);
    this.slowTimer=Math.max(this.slowTimer,frames);
  }

  // Ствол по ключу из CONFIG.weapons. Эволюция откликается на ключ СВОЕГО
  // предка (def.evolves): для прокачки «Рой игл» — это по-прежнему ветка
  // антидота, а карточка «новый ствол» не должна выдать второй антидот тому,
  // кто первый уже эволюционировал.
  weaponOf(key){ return this.weapons.find(w=>w.def.key===key||w.def.evolves===key); }
  hasWeapon(key){ return !!this.weaponOf(key); }
  addWeapon(key){ if(!this.hasWeapon(key)) this.weapons.push(new Weapon(CONFIG.weapons[key])); }

  // Опрашивает все стволы и возвращает вылетевшие снаряды.
  // Ствол может выпустить сразу несколько (карточка «Раздвоенный бросок»),
  // поэтому fire отдаёт массив.
  tryShoot(enemies){
    const shots=[];
    for(const w of this.weapons){
      w.update();
      for(const p of w.fire(this,enemies)) shots.push(p);
    }
    return shots;
  }

  // Возвращает true, если урон реально прошёл (а не был съеден щитом или
  // неуязвимостью). ignoreIFrames — для урона по времени вроде кислотных луж:
  // он капает постоянно и не должен продлевать неуязвимость.
  takeDamage(a,ignoreIFrames=false){
    if(this.shieldActive){
      this.shieldActive=false; this.shieldCd=CONFIG.player.shieldRecharge;
      this.onHurt?.(0,"shield"); return false;
    }
    if(this.iframes>0&&!ignoreIFrames) return false;
    // Броня из лавки. Урон уменьшается ДО всего остального, но никогда не
    // обнуляется: неуязвимость покупкой четырёх пластин была бы концом игры.
    if(this.armor>0) a*=Math.max(0.5,1-this.armor);
    this.hp-=a;
    // ВТОРОЕ ДЫХАНИЕ. Проверяется здесь, а не в главном цикле: там смерть
    // ловится по hp<=0 уже следующим кадром, и между ударом и спасением
    // успел бы прилететь второй — страховка сработала бы вхолостую.
    if(this.hp<=0&&this.secondWind){
      this.secondWind=false;
      this.hp=1; this.iframes=Math.max(this.iframes,120);
      this.onHurt?.(0,"secondWind");
    }
    this.sporeLevel=Math.min(CONFIG.sporeSystem.maxSpore,this.sporeLevel+CONFIG.player.sporeGrowthOnHit);
    // Попали — регенерация замолкает на regenDelay кадров. Считается ОТ
    // КАЖДОГО удара, включая урон по времени от луж: стоять в кислоте и
    // лечиться было бы тем же танкованием, только в другой позе.
    this.regenLock=CONFIG.player.regenDelay;
    if(!ignoreIFrames){ this.iframes=CONFIG.player.contactIFrames; this.hurtFlash=12; }
    this.onHurt?.(a,"hit");
    return true;
  }

  // ОПЫТ И РОСТ. Прежняя кривая (старт 10, ×1.35+5, +2 урона и +8 HP за
  // уровень) давала шестой уровень к тридцатой секунде забега: урон рос
  // примерно на 20% за уровень и обгонял врагов, которые прибавляют 26% HP
  // за минуту. К двум минутам любой враг умирал с одного попадания, и вся
  // сложность держалась на том, что игрок сам подойдёт вплотную.
  //
  // Теперь уровни идут заметно реже, а прибавка за уровень меньше: развитие
  // персонажа должно догонять сложность, а не обгонять её.
  //
  // НО РОСТ ТРЕБОВАНИЙ ЗАМЕДЛЯЕТСЯ ПОСЛЕ ДЕСЯТОГО УРОВНЯ. Прежние ×1.5 на
  // каждый уровень без исключений означали, что двадцатый стоит 50 тысяч
  // опыта при первом в четырнадцать: к пятнадцатому уровню карточка
  // переставала выпадать вовсе. Замер живого забега: 19 минут, 9673 убийства,
  // и всего двадцатый уровень — то есть последние минут семь игрок не получал
  // ничего вообще.
  //
  // Это не «сложно», это остановка награды ровно там, где забег самый длинный:
  // число убийств в минуту растёт линейно, а требование — в полтора раза за
  // уровень, и линейное неизбежно проигрывает. 1.34 после десятого держит
  // выдачу карточек примерно раз в минуту до конца забега.
  //
  // Первые десять уровней НЕ ТРОГАЕМ: там кривая подобрана прогонами, и
  // именно она не даёт прокачке обогнать врагов на первых минутах.
  addXp(a){
    this.xp+=a; let leveledUp=false;
    while(this.xp>=this.xpToNext){
      this.xp-=this.xpToNext; this.level++;
      this.xpToNext=Math.floor(this.xpToNext*(this.level<10?1.5:1.34))+10;
      this.damage+=1.2; this.maxHp+=5;
      this.hp=Math.min(this.hp+8,this.maxHp);
      leveledUp=true;
    }
    return leveledUp;
  }

  reduceSpore(a){ this.sporeLevel=Math.max(0,this.sporeLevel-a); }

  // --- выброс спор ------------------------------------------------------
  // Готовность и списание разведены нарочно: HUD спрашивает про готовность
  // каждый кадр, а тратить шкалу имеет право только тот, кто действительно
  // выпустил облако (BattleSystem). Иначе «кнопка нажалась, споры ушли, а
  // удара не случилось» — ровно то ложное обещание, из-за которого механику
  // и переписывали.
  burstCost(){ return CONFIG.sporeSystem.burst.cost; }
  canBurst(){
    return !this.isDying && this.burstCd<=0 && this.sporeLevel>=this.burstCost();
  }
  // Возвращает false, если тратить нечего: вызывающий по этому решает,
  // играть ли отказ
  spendBurst(){
    if(!this.canBurst()) return false;
    this.reduceSpore(this.burstCost());
    this.burstCd=CONFIG.sporeSystem.burst.cooldown;
    return true;
  }

  // --- смерть ---------------------------------------------------------
  // Мир на это время замирает: главный цикл перестаёт обновлять врагов и
  // крутит только эту анимацию (см. main.js, состояние dying).
  startDeath(){
    if(this.isDying) return;
    this.isDying=true; this.hp=0;
    this.deathFrame=0; this.deathTimer=0;
    this.slowTimer=0; this.slowMult=1;
  }

  stepDeath(){
    if(!this.isDying) return;
    this.deathTimer++;
    if(this.deathTimer<CONFIG.player.deathAnimSpeed) return;
    this.deathTimer=0;
    // На последнем кадре останавливаемся и держим его: зацикливать смерть,
    // пока игрок читает итоги, было бы странно.
    if(this.deathFrame<CONFIG.player.deathCols-1) this.deathFrame++;
  }

  // Сколько кадров игра должна оставаться в состоянии смерти
  deathDuration(){
    return CONFIG.player.deathCols*CONFIG.player.deathAnimSpeed+CONFIG.player.deathHold;
  }

  // Какой лист и какой его кадр показывать сейчас.
  //
  // Пока игрок идёт и лист бега загружен — берём его: у листа поз кадры это
  // переминание на месте, ногами оно ничего не сообщает. Стоим или листа нет —
  // лист поз. Ряд один и тот же в обоих: 0 вниз, 1 вправо, 2 влево, 3 вверх.
  bodyFrame(renderer){
    const P=CONFIG.player;
    const walk=this.isMoving?renderer.loader?.getImage("playerWalk"):null;
    if(walk&&walk.width){
      // Размер кадра считается ИЗ САМОЙ КАРТИНКИ по числу колонок и рядов, а
      // не берётся из конфига числом. Лист рисует нейросеть, и его итоговое
      // разрешение каждый раз другое: у первой версии вышло 2048x2048 вместо
      // заказанных 1536x1024. Сетка (сколько кадров) — это осмысленное
      // требование, точный размер файла — нет.
      return { img:walk,
               fw:walk.width/P.walkCols, fh:walk.height/P.walkRows,
               col:this.animFrame%P.walkCols, size:P.walkDisplaySize, key:"playerWalk" };
    }
    const img=renderer.loader?.getImage("player");
    if(!img) return null;
    return { img, fw:P.spriteFrameW, fh:P.spriteFrameH,
             col:this.isMoving?this.animFrame%P.spriteCols:0,
             size:P.spriteDisplaySize, key:"player" };
  }

  draw(renderer){
    // Ключи загрузчика (CONFIG.assets.images), а не пути к файлам.
    const body=this.bodyFrame(renderer);
    // Лист смерти — один ряд лицом вправо, его зеркалим по последнему
    // направлению взгляда (ряд 2 — влево). У листа ходьбы направление задано
    // рядом, и зеркалить его нельзя.
    const faceLeft=this.faceRow===2;

    // Тень под ногами: без неё игрок сливается с землёй ровно так же, как враги
    renderer.drawShadow(this.x,this.y+this.radius*0.8,this.radius*0.8,this.radius*0.3,0.45);

    // Смерть перекрывает всё остальное: ни ходьбы, ни щита, ни моргания
    if(this.isDying){
      const dImg=renderer.loader?.getImage("playerDeath");
      if(dImg){
        renderer.drawSpriteSheet(
          dImg, this.x, this.y,
          CONFIG.player.deathFrameW, CONFIG.player.deathFrameH,
          this.deathFrame, 0,
          CONFIG.player.deathDisplaySize,
          0, faceLeft
        );
      } else {
        // Листа нет — гасим игрока, чтобы смерть всё равно читалась
        const k=1-this.deathFrame/Math.max(1,CONFIG.player.deathCols-1);
        renderer.ctx.save(); renderer.ctx.globalAlpha=0.2+k*0.8;
        renderer.drawGradientCircle(this.x,this.y,this.radius,this.color.body);
        renderer.ctx.restore();
      }
      return;
    }

    // Неуязвимость видно по морганию: иначе непонятно, почему второй удар
    // подряд не прошёл.
    const blink=this.iframes>0 && this.hurtFlash<=0 && Math.floor(this.iframes/4)%2===0;
    if(blink){ renderer.ctx.save(); renderer.ctx.globalAlpha=0.45; }

    if(body){
      // Ряд листа = направление взгляда, вращать спрайт нельзя
      renderer.drawSpriteSheet(
        body.img, this.x, this.y,
        body.fw, body.fh,
        body.col, this.faceRow,
        body.size,
        0
      );
    } else {
      // Fallback-отрисовка примитивами: сюда попадаем, если ни один спрайт
      // не загрузился — игрок обязан остаться видимым в любом случае.
      renderer.drawGlowCircle(this.x,this.y,this.radius+6,this.color.glow,12);
      renderer.drawGradientCircle(this.x,this.y,this.radius,this.color.body);
      renderer.ctx.strokeStyle=this.color.stroke; renderer.ctx.lineWidth=2; renderer.ctx.stroke();
      for(let side=-1;side<=1;side+=2){
        const ex=this.x+Math.cos(this.angle+side*0.45)*this.radius*0.45;
        const ey=this.y+Math.sin(this.angle+side*0.45)*this.radius*0.45;
        renderer.drawCircle(ex,ey,4,"#00d4aa");
        renderer.drawCircle(ex+Math.cos(this.angle)*1.5,ey+Math.sin(this.angle)*1.5,2,"#000");
      }
      renderer.ctx.strokeStyle="#2a2a2a"; renderer.ctx.lineWidth=2; renderer.ctx.beginPath();
      renderer.ctx.moveTo(this.x-6,this.y+4); renderer.ctx.lineTo(this.x-10,this.y+12);
      renderer.ctx.moveTo(this.x+6,this.y+4); renderer.ctx.lineTo(this.x+10,this.y+12); renderer.ctx.stroke();
      renderer.drawGlowCircle(this.x-8,this.y+10,3,"#39ff14",6);
      renderer.drawCircle(this.x-8,this.y+10,3,"#39ff14");
      renderer.drawGlowCircle(this.x+8,this.y+10,3,"#c4a000",6);
      renderer.drawCircle(this.x+8,this.y+10,3,"#c4a000");
    }

    if(blink) renderer.ctx.restore();

    // Красный силуэт в момент удара — самая заметная часть обратной связи
    if(this.hurtFlash>0){
      const a=this.hurtFlash/12*0.8;
      if(body){
        renderer.drawFlash(body.img,body.key,this.x,this.y,
          body.fw,body.fh,body.col,this.faceRow,
          body.size,false,a,"#ff3344");
      } else {
        renderer.ctx.save(); renderer.ctx.globalAlpha=a;
        renderer.drawCircle(this.x,this.y,this.radius,"#ff3344"); renderer.ctx.restore();
      }
    }

    if(this.shieldActive){
      renderer.ctx.strokeStyle="rgba(0,212,170,0.6)";
      renderer.ctx.lineWidth=2; renderer.ctx.beginPath();
      renderer.ctx.arc(this.x,this.y,this.radius+8,0,Math.PI*2); renderer.ctx.stroke();
    }
    // ЗАМЕДЛЕНИЕ ОТ ЩУПАЛЬЦА. Раньше здесь стягивалось красное кольцо —
    // знак тревоги для состояния «управление отобрано». Отбирать больше
    // нечего, и знак другой: грибница цепляется за НОГИ. Низкий приплюснутый
    // овал у самой земли и пара нитей, которые тянутся назад, — видно, что
    // тебя держат, но взгляд от боя это не отвлекает.
    if(this.slowTimer>0){
      const ctx=renderer.ctx, k=(this.life%40)/40;
      ctx.save();
      ctx.globalAlpha=0.25+Math.sin(k*Math.PI*2)*0.12+0.2;
      ctx.strokeStyle="#8affe0"; ctx.lineWidth=1.6;
      ctx.beginPath();
      ctx.ellipse(this.x,this.y+this.radius*0.75,this.radius*0.95,this.radius*0.38,0,0,Math.PI*2);
      ctx.stroke();
      // Нити грибницы: три коротких усика, подрагивающих у подошв
      for(let i=0;i<3;i++){
        const a=Math.PI*0.25+i*Math.PI*0.25+Math.sin(this.life*0.08+i)*0.12;
        ctx.beginPath();
        ctx.moveTo(this.x+Math.cos(a)*this.radius*0.9,this.y+this.radius*0.75+Math.sin(a)*this.radius*0.3);
        ctx.lineTo(this.x+Math.cos(a)*this.radius*1.5,this.y+this.radius*0.9+Math.sin(a)*this.radius*0.45);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
