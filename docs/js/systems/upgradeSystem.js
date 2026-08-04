import { CONFIG } from "../config.js";

// ПРОКАЧКА.
//
// Две вещи здесь были сломаны по-крупному:
//
//  1. Одноразовые улучшения («Ядовитый колчан», «Рикошет», «Рывок»…) не
//     убирались из колоды после взятия. Карточка выпадала снова, игрок тратил
//     на неё уровень, и не происходило ровным счётом ничего.
//  2. Мутации меняли CONFIG.player.sporeGrowth — глобальный объект, живущий
//     дольше забега. После двух-трёх партий с мутациями новая игра начиналась
//     с многократно ускоренным заражением, и никто не понимал почему.
//
// Теперь у каждого улучшения есть предел числа взятий (max, по умолчанию 1),
// а всё накапливаемое живёт на игроке. Заодно улучшения стакаются там, где это
// осмысленно: одна карточка урона — это скучно, пять уровней одной карточки —
// это уже сборка.
export class UpgradeSystem {
  constructor(){
    this.isOpen=false; this.cards=[];
    this.allUpgrades=[
      // --- стволы: стреляют одновременно, не заменяют друг друга ---
      {id:"w_toxic",title:CONFIG.weapons.toxic.name,desc:CONFIG.weapons.toxic.desc,category:"weapon",
       available:(p)=>!p.hasWeapon("toxic"),effect:(p)=>{p.addWeapon("toxic");}},
      {id:"w_incendiary",title:CONFIG.weapons.incendiary.name,desc:CONFIG.weapons.incendiary.desc,category:"weapon",
       available:(p)=>!p.hasWeapon("incendiary"),effect:(p)=>{p.addWeapon("incendiary");}},

      // --- экстракты: работают со стрельбой ---
      {id:"fire_rate",title:"Ускоренный экстракт",desc:"Скорость стрельбы +20%",category:"extract",
       max:5,effect:(p)=>{p.attackRate=Math.max(4,p.attackRate*0.8);}},
      {id:"damage",title:"Концентрат яда",desc:"Урон +15%",category:"extract",
       max:6,effect:(p)=>{p.damage*=1.15;}},
      {id:"poison",title:"Ядовитый колчан",desc:"Снаряды отравляют (3 ур/сек)",category:"extract",
       effect:(p)=>{p.poison=true;}},
      {id:"ricochet",title:"Грибной рикошет",desc:"Отскок к другому врагу",category:"extract",
       effect:(p)=>{p.ricochet=true;}},
      {id:"explosive",title:"Споровая бомба",desc:"Взрыв радиусом 40 при попадании",category:"extract",
       effect:(p)=>{p.explosive=true;}},

      // --- мутации: сила в обмен на ускоренное заражение ---
      {id:"mut_dmg",title:"Грибная ярость",desc:"Урон +25%, заражение +15%",category:"mutation",
       max:3,effect:(p)=>{p.damage*=1.25; p.sporeRate*=1.15;}},
      {id:"mut_regen",title:"Мицелиевое исцеление",desc:"Реген +2 HP/сек, заражение ×1.8",category:"mutation",
       max:3,effect:(p)=>{p.regen+=2; p.sporeRate*=1.8;}},
      {id:"mut_greed",title:"Спорная жадность",desc:"Опыт +50%, заражение +30%",category:"mutation",
       max:2,effect:(p)=>{p.xpMult*=1.5; p.sporeRate*=1.3;}},

      // --- снаряжение: выживаемость и удобство ---
      {id:"hp_up",title:"Грибная броня",desc:"Макс HP +20",category:"gear",
       max:6,effect:(p)=>{p.maxHp+=20; p.hp+=20;}},
      {id:"speed",title:"Мицелиевые сапоги",desc:"Скорость передвижения +10%",category:"gear",
       max:4,effect:(p)=>{p.speed*=1.1;}},
      {id:"shield",title:"Биолюмин. щит",desc:"Блокирует удар, восстановление 10 сек",category:"gear",
       effect:(p)=>{p.hasShield=true; p.shieldActive=true; p.shieldCd=0;}},
      {id:"dash",title:"Споровый рывок",desc:"Двойное WASD — рывок",category:"gear",
       effect:(p)=>{p.canDash=true;}},
      {id:"autoloot",title:"Магнит мицелия",desc:"Радиус подбора +80",category:"gear",
       max:3,effect:(p)=>{p.autoLoot=true; p.lootRadius+=80;}},
      {id:"cleanse",title:"Споровый фильтр",desc:"Заражение растёт на 25% медленнее",category:"gear",
       max:3,effect:(p)=>{p.sporeRate*=0.75;}},

      // Запасная карточка: доступна всегда и без предела. Нужна, чтобы колода
      // не опустела на высоких уровнях — иначе меню открылось бы вообще без
      // карточек, а игра осталась бы на паузе навсегда.
      {id:"patch",title:"Полевая перевязка",desc:"+30 HP и −20% заражения",category:"gear",
       max:Infinity,effect:(p)=>{p.hp=Math.min(p.maxHp,p.hp+30); p.reduceSpore(20);}}
    ];
  }

  // Взятые до предела улучшения и уже полученные стволы в колоду не возвращаются
  generateCards(player){
    const taken=player?.taken||{};
    const pool=this.allUpgrades.filter(u=>{
      if((taken[u.id]||0)>=(u.max??1)) return false;
      return !u.available||!player||u.available(player);
    });
    this.cards=[...pool].sort(()=>Math.random()-0.5).slice(0,3);
    return this.cards;
  }

  applyUpgrade(idx,player){
    const u=this.cards[idx];
    if(u){
      u.effect(player);
      if(player) player.taken[u.id]=(player.taken[u.id]||0)+1;
    }
    this.isOpen=false; this.cards=[];
  }

  showMenu(cards){
    this.isOpen=true; const menu=document.getElementById("upgradeMenu"); const container=document.getElementById("upgradeCards");
    container.innerHTML=""; menu.classList.remove("hidden");
    cards.forEach((card,i)=>{
      const div=document.createElement("div"); div.className="upgrade-card cat-"+card.category;
      const risk=card.category==="mutation"?'<div class="risk">⚠ Мутация — риск заражения</div>'
                :card.category==="weapon"?'<div class="risk">✦ Новый ствол — стреляет сам</div>':"";
      div.innerHTML='<div class="title">'+card.title+'</div><div class="desc">'+card.desc+'</div>'+risk;
      div.onclick=()=>{ window.dispatchEvent(new CustomEvent("upgradeChosen",{detail:i})); menu.classList.add("hidden"); };
      container.appendChild(div);
    });
  }

  hideMenu(){ document.getElementById("upgradeMenu").classList.add("hidden"); this.isOpen=false; }
}
