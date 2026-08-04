import { CONFIG } from "../config.js";
export class UpgradeSystem {
  constructor(){
    this.isOpen=false; this.cards=[];
    this.allUpgrades=[
      // Новые стволы выдаются карточками. Оружие не заменяет предыдущее —
      // все стволы стреляют одновременно, каждый по своему таймеру.
      {id:"w_toxic",title:CONFIG.weapons.toxic.name,desc:CONFIG.weapons.toxic.desc,category:"weapon",
       available:(p)=>!p.hasWeapon("toxic"),effect:(p)=>{p.addWeapon("toxic");}},
      {id:"w_incendiary",title:CONFIG.weapons.incendiary.name,desc:CONFIG.weapons.incendiary.desc,category:"weapon",
       available:(p)=>!p.hasWeapon("incendiary"),effect:(p)=>{p.addWeapon("incendiary");}},
      {id:"fire_rate",title:"Ускоренный экстракт",desc:"Скорость стрельбы +20%",category:"extract",effect:(p)=>{p.attackRate=Math.max(4,p.attackRate*0.8);}},
      {id:"poison",title:"Ядовитый колчан",desc:"Снаряды отравляют (3 ур/сек, 3 сек)",category:"extract",effect:(p)=>{p.poison=true;}},
      {id:"ricochet",title:"Грибной рикошет",desc:"Отскок к другому врагу",category:"extract",effect:(p)=>{p.ricochet=true;}},
      {id:"explosive",title:"Споровая бомба",desc:"Взрыв радиусом 40 при попадании",category:"extract",effect:(p)=>{p.explosive=true;}},
      {id:"mut_dmg",title:"Грибная ярость",desc:"Урон +25%, споры +15%",category:"mutation",effect:(p)=>{p.damage*=1.25; CONFIG.player.sporeGrowth*=1.15;}},
      {id:"mut_regen",title:"Мицелиевое исцеление",desc:"Реген +2 HP/сек, споры ×2",category:"mutation",effect:(p)=>{p.regen=2; CONFIG.player.sporeGrowth*=2;}},
      {id:"mut_greed",title:"Спорная жадность",desc:"XP +50%, враги +20% скорость",category:"mutation",effect:(p)=>{p.xpMult=1.5;}},
      {id:"hp_up",title:"Грибная броня",desc:"Макс HP +20",category:"gear",effect:(p)=>{p.maxHp+=20; p.hp+=20;}},
      {id:"shield",title:"Биолюмин. щит",desc:"Блок 1 удар, перезарядка 10 сек",category:"gear",effect:(p)=>{p.shieldActive=true; p.shieldTimer=600;}},
      {id:"dash",title:"Споровый рывок",desc:"Двойное WASD — рывок",category:"gear",effect:(p)=>{p.canDash=true;}},
      {id:"autoloot",title:"Магнит мицелия",desc:"Авто-лут радиус 80",category:"gear",effect:(p)=>{p.autoLoot=true; p.lootRadius=80;}},
    ];
  }
  // Карточки уже полученных стволов больше не выпадают
  generateCards(player){
    const pool=this.allUpgrades.filter(u=>!u.available||!player||u.available(player));
    this.cards=[...pool].sort(()=>Math.random()-0.5).slice(0,3);
    return this.cards;
  }
  applyUpgrade(idx,player){ const u=this.cards[idx]; if(u) u.effect(player); this.isOpen=false; this.cards=[]; }
  showMenu(cards){
    this.isOpen=true; const menu=document.getElementById("upgradeMenu"); const container=document.getElementById("upgradeCards");
    container.innerHTML=""; menu.classList.remove("hidden");
    cards.forEach((card,i)=>{
      const div=document.createElement("div"); div.className="upgrade-card";
      const risk=card.category==="mutation"?'<div class="risk">⚠ Мутация — риск заражения</div>'
                :card.category==="weapon"?'<div class="risk">✦ Новый ствол — стреляет сам</div>':"";
      div.innerHTML='<div class="title">'+card.title+'</div><div class="desc">'+card.desc+'</div>'+risk;
      div.onclick=()=>{ window.dispatchEvent(new CustomEvent("upgradeChosen",{detail:i})); menu.classList.add("hidden"); };
      container.appendChild(div);
    });
  }
  hideMenu(){ document.getElementById("upgradeMenu").classList.add("hidden"); this.isOpen=false; }
}