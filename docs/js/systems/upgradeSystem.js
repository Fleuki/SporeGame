import { CONFIG } from "../config.js";

// ПРОКАЧКА.
//
// Колода переехала с «плоского» набора флагов на ветки по стволам.
//
// Что было не так. Улучшения стрельбы были глобальными: одна карточка
// «Рикошет» — и отскакивают ВСЕ снаряды, включая зажигательную склянку,
// которая и так взрывается по площади. Каждый такой эффект брался ровно один
// раз, после чего ветка кончалась, а колода на высоких уровнях вырождалась в
// «+15% урона» и запасную перевязку. Плюс висели карточки, которых просто не
// должно быть: «Споровый рывок» включал сломанный телепорт по двойному WASD.
//
// Что стало. У каждого ствола своя ветка из трёх-четырёх карточек, и она
// показывается ТОЛЬКО если этот ствол у игрока есть. Ветки разведены по
// смыслу: антидот — точность и цели (веер, пробитие, отскок), токсичная —
// площадь и время (лужа шире, споры злее), зажигательная — сила одного удара.
// Поэтому выбор «взять второй ствол или углубить первый» стал настоящим.
//
// И у ветки появился КОНЕЦ, ради которого её качают: четыре взятых карточки
// открывают эволюцию — ствол превращается в другой, со своим поведением
// (см. раздел «эволюции» в CONFIG.weapons). Раньше ветка просто иссякала, и
// дальше колода повторяла одни и те же проценты.
//
// Пределы взятий (max) есть у всего: без них карточка выпадала бы бесконечно.
// Всё накапливаемое живёт на игроке и на его стволах, а не в CONFIG — глобальный
// конфиг живёт дольше забега, и правки в нём переносились в следующие партии.

// Хелпер: найти ствол игрока по ключу из CONFIG.weapons.
//
// Поиск идёт через player.weaponOf, а не по def.key напрямую: эволюция —
// это ДРУГАЯ запись в CONFIG.weapons, и «Рой игл» по ключу «antidote» уже не
// находился бы. Ветка антидота обязана продолжать работать на том, во что
// антидот вырос, — иначе эволюция обнуляла бы половину колоды.
const gun = (p, key) => p.weaponOf(key);

export class UpgradeSystem {
  constructor(){
    this.isOpen=false; this.cards=[];
    this.allUpgrades=[
      // === СТВОЛЫ =======================================================
      // Стреляют одновременно, не заменяют друг друга. Открывают свои ветки.
      {id:"w_toxic",title:CONFIG.weapons.toxic.name,
       desc:"Новый ствол: лужа спор с уроном по времени",category:"weapon",
       available:(p)=>!p.hasWeapon("toxic"),effect:(p)=>{p.addWeapon("toxic");}},
      {id:"w_incendiary",title:CONFIG.weapons.incendiary.name,
       desc:"Новый ствол: взрыв по области вблизи",category:"weapon",
       available:(p)=>!p.hasWeapon("incendiary"),effect:(p)=>{p.addWeapon("incendiary");}},

      // === ВЕТКА АНТИДОТА: точность и число целей =======================
      {id:"a_split",title:"Раздвоенный бросок",desc:"Антидот: +1 склянка веером",
       category:"antidote",max:2,available:(p)=>!!gun(p,"antidote"),
       effect:(p)=>{const w=gun(p,"antidote"); w.shots++; w.dmgMult*=0.88;}},
      {id:"a_pierce",title:"Костяная игла",desc:"Антидот: прошивает +1 врага",
       category:"antidote",max:2,available:(p)=>!!gun(p,"antidote"),
       effect:(p)=>{gun(p,"antidote").pierce++;}},
      {id:"a_ricochet",title:"Грибной рикошет",desc:"Антидот: +1 отскок к соседу",
       category:"antidote",max:2,available:(p)=>!!gun(p,"antidote"),
       effect:(p)=>{gun(p,"antidote").bounces++;}},
      {id:"a_power",title:"Тяжёлая склянка",desc:"Антидот: урон +30%",
       category:"antidote",max:3,available:(p)=>!!gun(p,"antidote"),
       effect:(p)=>{gun(p,"antidote").dmgMult*=1.3;}},

      // === ВЕТКА ТОКСИЧНОЙ: площадь и время =============================
      {id:"t_dot",title:"Густой мицелий",desc:"Токсичная: споры жгут на 50% сильнее",
       category:"toxic",max:3,available:(p)=>!!gun(p,"toxic"),
       effect:(p)=>{gun(p,"toxic").dotMult*=1.5;}},
      {id:"t_area",title:"Широкий разлёт",desc:"Токсичная: лужа шире на 30%",
       category:"toxic",max:2,available:(p)=>!!gun(p,"toxic"),
       effect:(p)=>{gun(p,"toxic").areaMult*=1.3;}},
      {id:"t_rate",title:"Быстрая варка",desc:"Токсичная: перезарядка −20%",
       category:"toxic",max:2,available:(p)=>!!gun(p,"toxic"),
       effect:(p)=>{gun(p,"toxic").rateMult*=0.8;}},

      // === ВЕТКА ЗАЖИГАТЕЛЬНОЙ: один тяжёлый удар =======================
      {id:"i_area",title:"Ударная волна",desc:"Зажигательная: взрыв шире на 25%",
       category:"incendiary",max:2,available:(p)=>!!gun(p,"incendiary"),
       effect:(p)=>{gun(p,"incendiary").areaMult*=1.25;}},
      {id:"i_power",title:"Плотный заряд",desc:"Зажигательная: урон +35%",
       category:"incendiary",max:3,available:(p)=>!!gun(p,"incendiary"),
       effect:(p)=>{gun(p,"incendiary").dmgMult*=1.35;}},
      {id:"i_rate",title:"Скорый фитиль",desc:"Зажигательная: перезарядка −20%",
       category:"incendiary",max:2,available:(p)=>!!gun(p,"incendiary"),
       effect:(p)=>{gun(p,"incendiary").rateMult*=0.8;}},

      // === ЭВОЛЮЦИИ: конец ветки, а не ещё один процент =================
      // Появляются, когда в ветке взято evolveAt карточек (сейчас четыре),
      // то есть ПЯТАЯ карточка ветки — это превращение ствола в другой, со
      // своим поведением. Раньше ветка на этом месте просто кончалась, и
      // колода начинала повторять «+12% урона» по третьему разу.
      //
      // Взятые карточки ветки не пропадают: они продолжают работать на
      // эволюции (см. gun() выше и Weapon.evolve).
      ...Object.values(CONFIG.weapons)
        .filter(w=>w.evolves)
        .map(w=>({
          id:"evo_"+w.key, title:w.name,
          // «Из чего» важнее «во что»: игрок выбирает не новый ствол, а
          // судьбу того, который качал
          desc:CONFIG.weapons[w.evolves].name+" → "+w.desc,
          category:"evolution",
          available:(p)=>this.canEvolve(p,w),
          effect:(p)=>{ p.weaponOf(w.evolves)?.evolve(w); }
        })),

      // === ЭКСТРАКТЫ: работают на все стволы сразу ======================
      // Пределы срезаны (было 5×−20% и 6×+15%): вместе эти две карточки
      // разгоняли урон в секунду вчетверо и обгоняли любой рост врагов.
      {id:"fire_rate",title:"Ускоренный экстракт",desc:"Все стволы: скорость стрельбы +14%",
       category:"extract",max:4,effect:(p)=>{p.rateMult=Math.max(0.35,p.rateMult*0.86);}},
      {id:"damage",title:"Концентрат яда",desc:"Все стволы: урон +12%",
       category:"extract",max:5,effect:(p)=>{p.damage*=1.12;}},

      // === ВЫБРОС: прокачка траты заражения =============================
      // Ветка появилась вместе с самой тратой (CONFIG.sporeSystem.burst).
      // Смысл её в том, что она разворачивает мутации: чем сильнее выброс,
      // тем выгоднее разгонять заражение — то есть карточки «сила в обмен на
      // споры» наконец покупают не только риск, но и боезапас.
      // Цену выброса не трогаем ни одной карточкой: подешевевшая трата
      // перестаёт быть решением и становится просто ещё одной кнопкой урона.
      {id:"b_power",title:"Разрывные споры",desc:"Выброс спор: урон +40%",
       category:"burst",max:3,effect:(p)=>{p.burstPower*=1.4;}},
      {id:"b_area",title:"Глубокий вдох",desc:"Выброс спор: радиус +22%",
       category:"burst",max:2,effect:(p)=>{p.burstArea*=1.22;}},

      // === МУТАЦИИ: сила в обмен на ускоренное заражение ================
      // Теперь это честная сделка: заражение тратится выбросом, поэтому
      // «споры быстрее» — это и риск, и более частый удар по кольцу. Пока
      // траты не было, эти карточки продавали силу за то, что и так дойдёт до
      // потолка само, то есть отдавали её даром.
      {id:"mut_dmg",title:"Грибная ярость",desc:"Урон +25%, заражение +15%",category:"mutation",
       max:3,effect:(p)=>{p.damage*=1.25; p.sporeRate*=1.15;}},
      {id:"mut_regen",title:"Мицелиевое исцеление",desc:"Реген +2 HP/сек, заражение ×1.6",category:"mutation",
       max:3,effect:(p)=>{p.regen+=2; p.sporeRate*=1.6;}},
      {id:"mut_greed",title:"Спорная жадность",desc:"Опыт +40%, заражение +30%",category:"mutation",
       max:2,effect:(p)=>{p.xpMult*=1.4; p.sporeRate*=1.3;}},

      // === СНАРЯЖЕНИЕ: выживаемость и удобство ==========================
      {id:"hp_up",title:"Грибная броня",desc:"Макс HP +20",category:"gear",
       max:5,effect:(p)=>{p.maxHp+=20; p.hp+=20;}},
      {id:"speed",title:"Мицелиевые сапоги",desc:"Скорость передвижения +8%",category:"gear",
       max:3,effect:(p)=>{p.speed*=1.08;}},
      {id:"shield",title:"Биолюмин. щит",desc:"Блокирует удар, восстановление 10 сек",category:"gear",
       effect:(p)=>{p.hasShield=true; p.shieldActive=true; p.shieldCd=0;}},
      // Радиус срезан втрое (было +80 за уровень при трёх уровнях): +240 к
      // притяжению — это больше половины высоты экрана, и лут собирался сам,
      // а «идти за опытом в толпу» переставало быть решением.
      {id:"autoloot",title:"Магнит мицелия",desc:"Радиус подбора +45",category:"gear",
       max:3,effect:(p)=>{p.lootRadius+=45;}},
      {id:"cleanse",title:"Споровый фильтр",desc:"Заражение растёт на 25% медленнее",category:"gear",
       max:3,effect:(p)=>{p.sporeRate*=0.75;}},

      // Запасная карточка: доступна всегда и без предела. Нужна, чтобы колода
      // не опустела на высоких уровнях — иначе меню открылось бы вообще без
      // карточек, а игра осталась бы на паузе навсегда.
      {id:"patch",title:"Полевая перевязка",desc:"+30 HP и −20% заражения",category:"gear",
       max:Infinity,effect:(p)=>{p.hp=Math.min(p.maxHp,p.hp+30); p.reduceSpore(20);}}
    ];
    // Карточка «Споровый рывок» удалена вместе с самим рывком: он
    // телепортировал на 40 единиц каждый кадр удержания клавиши и без
    // перезарядки (см. комментарий в player.js).
    //
    // Оттуда же убраны «Ядовитый колчан» и «Споровая бомба»: обе вешали
    // глобальный флаг поверх всех стволов и делали то же, что уже делают
    // токсичная и зажигательная склянки, только хуже и без прокачки.
  }

  // Сколько карточек взято в ветке ствола. Категория карточки совпадает с
  // ключом ствола («antidote», «toxic», «incendiary») — по ней ветка и
  // считается, а не отдельным списком id, который пришлось бы чинить руками
  // при каждой новой карточке.
  branchLevel(player,key){
    const taken=player?.taken||{};
    let n=0;
    for(const u of this.allUpgrades){
      if(u.category===key) n+=(taken[u.id]||0);
    }
    return n;
  }

  // Эволюция доступна, если ствол-предок ещё носится, ещё не эволюционировал
  // и в его ветке набрано достаточно карточек
  canEvolve(player,def){
    const w=player?.weaponOf?.(def.evolves);
    if(!w||w.evolved) return false;
    return this.branchLevel(player,def.evolves)>=(def.evolveAt??4);
  }

  // Что вообще можно предложить: взятое до предела и улучшения отсутствующих
  // стволов в колоду не возвращаются
  pool(player){
    const taken=player?.taken||{};
    return this.allUpgrades.filter(u=>{
      if((taken[u.id]||0)>=(u.max??1)) return false;
      return !u.available||!player||u.available(player);
    });
  }

  // Три карточки, по возможности из РАЗНЫХ категорий. Чистый random из общей
  // колоды регулярно выдавал три улучшения одного и того же ствола — выбор
  // из трёх почти одинаковых вариантов выбором не является.
  //
  // ЭВОЛЮЦИЯ ИДЁТ ВНЕ ОЧЕРЕДИ. Если бы она разыгрывалась наравне со всеми,
  // из колоды в полтора десятка карточек её можно было бы не увидеть три
  // уровня подряд — а это единственная награда за то, что игрок держался
  // одной ветки ползабега. Обещание должно исполняться в тот уровень, когда
  // оно заслужено. Больше двух за раз не берём: третье место остаётся под
  // обычный выбор, иначе выбора снова нет.
  generateCards(player){
    const pool=this.pool(player).sort(()=>Math.random()-0.5);
    const picked=[], usedCats=new Set();
    for(const u of pool){
      if(u.category!=="evolution") continue;
      if(picked.length>=2) break;
      picked.push(u); usedCats.add("evolution");
    }
    for(const u of pool){
      if(picked.length>=3) break;
      if(usedCats.has(u.category)) continue;
      picked.push(u); usedCats.add(u.category);
    }
    // Категорий не хватило — добираем чем есть
    for(const u of pool){
      if(picked.length>=3) break;
      if(!picked.includes(u)) picked.push(u);
    }
    this.cards=picked;
    return this.cards;
  }

  // Возвращает выбранную карточку: по ней главный цикл решает, показывать ли
  // отдельную обратную связь — эволюция ствола не должна проходить так же
  // тихо, как «+12% урона».
  applyUpgrade(idx,player){
    const u=this.cards[idx];
    if(u){
      u.effect(player);
      if(player) player.taken[u.id]=(player.taken[u.id]||0)+1;
    }
    this.isOpen=false; this.cards=[];
    return u;
  }

  showMenu(cards,player){
    this.isOpen=true;
    const menu=document.getElementById("upgradeMenu");
    const container=document.getElementById("upgradeCards");
    container.innerHTML=""; menu.classList.remove("hidden");
    cards.forEach((card,i)=>{
      const div=document.createElement("div");
      div.className="upgrade-card cat-"+card.category;
      div.innerHTML=
        '<div class="tag">'+LABEL[card.category]+'</div>'+
        '<div class="title">'+card.title+'</div>'+
        '<div class="desc">'+card.desc+'</div>'+
        this.pips(card,player);
      div.onclick=()=>{
        window.dispatchEvent(new CustomEvent("upgradeChosen",{detail:i}));
        menu.classList.add("hidden");
      };
      container.appendChild(div);
    });
  }

  // Точки уровней внизу карточки: сколько раз улучшение уже взято и сколько
  // осталось. Без них стакающиеся карточки неотличимы от одноразовых, и
  // непонятно, стоит ли добивать ветку.
  pips(card,player){
    const max=card.max??1;
    if(!isFinite(max)||max<=1) return "";
    const have=(player?.taken||{})[card.id]||0;
    let html='<div class="pips">';
    for(let i=0;i<max;i++) html+='<i class="'+(i<have?"on":"")+'"></i>';
    return html+'</div>';
  }

  hideMenu(){ document.getElementById("upgradeMenu").classList.add("hidden"); this.isOpen=false; }
}

// Подпись категории на карточке. Цвет рамки уже кодирует категорию, но
// «жёлтая рамка = ветка антидота» приходится запоминать, а слово читается.
const LABEL={
  weapon:"НОВЫЙ СТВОЛ",
  evolution:"ЭВОЛЮЦИЯ ★",
  antidote:"АНТИДОТ",
  toxic:"ТОКСИН",
  incendiary:"ОГОНЬ",
  extract:"ЭКСТРАКТ",
  mutation:"МУТАЦИЯ ⚠",
  burst:"ВЫБРОС",
  gear:"СНАРЯЖЕНИЕ"
};
