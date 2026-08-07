import { CONFIG } from "../config.js";

// ЛАВКА МЕЖДУ СТЫЧКАМИ.
//
// Зачем она вообще нужна, если прокачка уже есть. Прокачка — это выбор из
// трёх карточек, которые ВЫПАЛИ: игрок реагирует. Лавка — это трата того, что
// он накопил: игрок планирует. Две разные вещи, и вторая в игре отсутствовала
// целиком, а вместе с ней отсутствовал смысл у монет (их поэтому и убрали до
// этого этапа).
//
// Устройство намеренно повторяет UpgradeSystem: та же пауза поверх канваса, то
// же меню на HTML, те же карточки. Разница в трёх вещах, и все три
// существенные:
//   1. купить можно НЕСКОЛЬКО товаров за визит — сколько хватит монет;
//   2. ассортимент перерисовывается за деньги;
//   3. уйти можно ничего не купив: накопить на дорогое — это тоже решение.
//
// Товары — пассивы, и они не пересекаются с карточками стволов. Единственное
// намеренное пересечение — «Панцирь трутовика» против «Грибной брони»: HP
// нужны обоим меню, и без них ассортимент лавки был бы из одних процентов.

export class ShopSystem {
  constructor(audio){
    this.audio=audio;
    this.isOpen=false;
    this.stock=[];        // что лежит на прилавке сейчас
    this.rerolls=0;       // перерисовок за ЭТОТ визит: цена растёт внутри визита
    this.onClose=null;

    // price — базовая цена. Растёт на CONFIG.shop.priceGrowth за каждую
    // покупку этого же товара (см. priceOf), поэтому «скупить самое дешёвое
    // пять раз» перестаёт быть стратегией.
    this.goods=[
      {id:"s_hp",     title:"Панцирь трутовика", desc:"Макс. HP +25",
       price:8,  effect:(p)=>{ p.maxHp+=25; p.hp+=25; }},
      {id:"s_armor",  title:"Хитиновая пластина", desc:"Весь входящий урон −8%",
       price:14, max:4, effect:(p)=>{ p.armor=Math.min(0.5,p.armor+0.08); }},
      {id:"s_speed",  title:"Пружинистый мицелий", desc:"Скорость +6%",
       price:9,  effect:(p)=>{ p.speed*=1.06; }},
      {id:"s_magnet", title:"Жадные нити", desc:"Радиус подбора +40",
       price:7,  effect:(p)=>{ p.lootRadius+=40; }},
      {id:"s_rate",   title:"Промасленный фитиль", desc:"Все стволы: перезарядка −8%",
       price:12, effect:(p)=>{ p.rateMult=Math.max(0.35,p.rateMult*0.92); }},
      {id:"s_filter", title:"Угольный респиратор", desc:"Заражение растёт на 18% медленнее",
       price:10, effect:(p)=>{ p.sporeRate*=0.82; }},
      {id:"s_burst",  title:"Спорный кузнечный мех", desc:"Выброс спор: урон +25%",
       price:11, effect:(p)=>{ p.burstPower*=1.25; }},
      {id:"s_regen",  title:"Живая повязка", desc:"Реген +1 HP/сек",
       price:13, effect:(p)=>{ p.regen+=1; }},
      // Расходник, а не пассив: он единственный доступен без предела и нужен
      // как «слив» лишних монет в конце забега, когда пассивы уже скуплены
      {id:"s_heal",   title:"Отвар мицелия", desc:"Вылечить 40 HP прямо сейчас",
       price:6,  max:Infinity, effect:(p)=>{ p.hp=Math.min(p.maxHp,p.hp+40); }},

      // === ВТОРОЙ ЯРУС ==================================================
      // Девяти товаров на четыре места не хватало: к третьему визиту игрок
      // видел весь ассортимент, и лавка превращалась в «купи, что осталось».
      // Товары ниже добавлены не ради длины списка — каждый из них делает
      // что-то, чего в игре ещё нет.
      {id:"s_thorns", title:"Ядовитая кровь", desc:"Ударивший вас враг получает 12 урона",
       price:12, max:3, effect:(p)=>{ p.thorns+=12; }},
      {id:"s_crit",   title:"Костяная пыль", desc:"Шанс крита +6%",
       price:15, max:3, effect:(p)=>{ p.critBonus+=0.06; }},
      {id:"s_scav",   title:"Спорофаг", desc:"Антидот вдобавок лечит 25 HP",
       price:9,  max:2, effect:(p)=>{ p.antidoteHeal+=25; }},
      {id:"s_bmech",  title:"Раздутые мехи", desc:"Выброс спор: радиус +18%",
       price:11, max:2, effect:(p)=>{ p.burstArea*=1.18; }},
      {id:"s_filter2",title:"Кристальный фильтр", desc:"Заражение растёт на 30% медленнее",
       price:18, max:2, effect:(p)=>{ p.sporeRate*=0.7; }},
      // Товар про саму лавку. Дешёвая перерисовка меняет то, КАК в неё
      // ходишь: копить на дорогое становится безопаснее, потому что нужный
      // товар можно доискать.
      {id:"s_pocket", title:"Потайной карман", desc:"Перерисовка дешевле на 2",
       price:10, max:2, effect:(p)=>{ p.rerollDiscount+=2; }},
      // ВТОРОЕ ДЫХАНИЕ — самый дорогой товар в игре и единственный, который
      // отменяет смерть. Один раз за забег: постоянная страховка убрала бы
      // из игры её единственную ставку.
      {id:"s_wind",   title:"Второе дыхание", desc:"Один раз за забег переживёте смертельный удар",
       price:28, max:1, effect:(p)=>{ p.secondWind=true; }}
    ];
  }

  reset(){ this.stock.length=0; this.rerolls=0; this.isOpen=false; this.hide(); }

  // Цена с учётом того, сколько раз товар уже куплен ЗА ЭТОТ ЗАБЕГ.
  // Счётчик покупок живёт на игроке (player.bought), а не в системе: система
  // одна на все забеги, а кошелёк и покупки — у конкретного персонажа.
  priceOf(g,player){
    const n=(player?.bought||{})[g.id]||0;
    return Math.round(g.price*Math.pow(CONFIG.shop.priceGrowth,n));
  }

  soldOut(g,player){
    const n=(player?.bought||{})[g.id]||0;
    return n>=(g.max??3);
  }

  // Скидка от «Потайного кармана» вычитается ПОСЛЕ роста цены за перерисовки
  // и не опускает её ниже единицы: бесплатная перерисовка — это уже не выбор,
  // а кнопка «крутить, пока не выпадет нужное».
  rerollPrice(player){
    const base=CONFIG.shop.rerollBase+CONFIG.shop.rerollStep*this.rerolls;
    return Math.max(1,base-(player?.rerollDiscount||0));
  }

  // Ассортимент: CONFIG.shop.size разных товаров из непроданного.
  // Разных — то есть один и тот же товар не занимает два места из четырёх:
  // прилавок из двух одинаковых позиций читается как поломка.
  roll(player){
    const pool=this.goods.filter(g=>!this.soldOut(g,player)).sort(()=>Math.random()-0.5);
    this.stock=pool.slice(0,CONFIG.shop.size);
    return this.stock;
  }

  open(player){
    this.isOpen=true; this.rerolls=0;
    this.roll(player);
    this.render(player);
    document.getElementById("shopMenu").classList.remove("hidden");
  }

  hide(){ document.getElementById("shopMenu")?.classList.add("hidden"); }

  close(){
    this.isOpen=false; this.hide();
    this.onClose?.();
  }

  buy(g,player){
    if(this.soldOut(g,player)) return false;
    const price=this.priceOf(g,player);
    if(player.coins<price){
      // Отказ звучит: молчащая карточка читается как «меню зависло»
      this.audio?.sfx("hit",0.4);
      return false;
    }
    player.coins-=price;
    g.effect(player);
    player.bought[g.id]=(player.bought[g.id]||0)+1;
    this.audio?.sfx("coin");
    // Купленное уходит с прилавка, а не остаётся кликабельным: иначе игрок
    // покупает второй раз по новой цене, не заметив, что цена изменилась
    this.stock=this.stock.filter(x=>x!==g);
    this.render(player);
    return true;
  }

  reroll(player){
    const price=this.rerollPrice(player);
    if(player.coins<price){ this.audio?.sfx("hit",0.4); return false; }
    player.coins-=price; this.rerolls++;
    this.audio?.sfx("pickup");
    this.roll(player);
    this.render(player);
    return true;
  }

  // Меню собирается заново на каждое действие. Дёшево (четыре карточки) и
  // избавляет от рассинхрона «цена на экране одна, списалась другая».
  render(player){
    const wrap=document.getElementById("shopGoods");
    document.getElementById("shopCoins").textContent=player.coins;
    wrap.innerHTML="";
    for(const g of this.stock){
      const price=this.priceOf(g,player);
      const poor=player.coins<price;
      const div=document.createElement("div");
      div.className="shop-card"+(poor?" poor":"");
      div.innerHTML=
        '<div class="title">'+g.title+'</div>'+
        '<div class="desc">'+g.desc+'</div>'+
        '<div class="price">'+price+'</div>';
      div.onclick=()=>this.buy(g,player);
      wrap.appendChild(div);
    }
    if(!this.stock.length){
      // Товар кончился — прилавок не должен выглядеть сломанным
      const div=document.createElement("div");
      div.className="shop-empty";
      div.textContent="Прилавок пуст";
      wrap.appendChild(div);
    }
    const rr=document.getElementById("shopReroll");
    const rp=this.rerollPrice(player);
    rr.textContent="ПЕРЕРИСОВАТЬ · "+rp;
    rr.classList.toggle("poor",player.coins<rp);
  }
}
