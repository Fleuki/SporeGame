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
  constructor(camera){
    this.camera=camera;
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
  }

  // 0 в начале забега, 1 после rampTime секунд. Все кривые темпа считаются
  // от неё, чтобы сложность не улетала линейно в бесконечность.
  ramp(t){ return Math.min(1,this.time/t); }

  // Множители характеристик врагов. Отдельным методом, чтобы их видели и
  // рядовые враги, и боссы, и интерфейс, если понадобится.
  scale(){
    const S=CONFIG.spawn, m=this.time/60;
    return {
      hp: S.baseHp*(1+m*S.hpPerMin),
      damage: S.baseDamage*(1+m*S.dmgPerMin),
      // Скорость упирается в потолок: враг быстрее игрока превращает игру
      // в безвыходную погоню, а не в бой
      speed: Math.min(S.speedCapMult,1+m*S.speedPerMin)
    };
  }

  // Кадров между двумя спавнами прямо сейчас
  interval(){
    const S=CONFIG.spawn;
    return S.intervalBase+(S.intervalMin-S.intervalBase)*this.ramp(S.rampTime);
  }

  // Потолок живых врагов прямо сейчас
  aliveLimit(){
    const S=CONFIG.spawn;
    return Math.round(S.aliveBase+(S.aliveMax-S.aliveBase)*this.ramp(S.aliveRampTime));
  }

  // Секунд до следующего босса — это же показывает интерфейс, если надо
  nextBossIn(){ return Math.max(0,(this.bossesSpawned+1)*CONFIG.spawn.bossEvery-this.time); }

  update(dt,enemies,player,sporeEffects){
    if(!this.active) return null;
    this.time+=dt;

    // Босс идёт вне очереди и вне затишья: он и есть главное событие забега
    const boss=this.tryBoss(enemies);
    if(boss) return boss;

    if(this.time<CONFIG.spawn.graceTime) return null;

    // Натиск и затишье чередуются по таймеру. Пока на поле остался кто-то
    // живой, затишье всё равно идёт — добивать отставших это не мешает.
    this.phaseTimer-=dt;
    if(this.phaseTimer<=0){
      this.lull=!this.lull;
      this.phaseTimer=this.lull?CONFIG.spawn.lullTime:CONFIG.spawn.pushTime;
    }
    if(this.lull) return null;

    const alive=enemies.reduce((n,e)=>n+(e.dead||e instanceof Boss?0:1),0);
    if(alive>=this.aliveLimit()) return null;

    this.spawnTimer--;
    if(this.spawnTimer<=0){
      this.spawnEnemy(enemies,sporeEffects);
      this.spawnTimer=this.interval();
    }
    return null;
  }

  tryBoss(enemies){
    const S=CONFIG.spawn;
    if(this.time<(this.bossesSpawned+1)*S.bossEvery) return null;
    if(enemies.some(e=>e instanceof Boss&&!e.dead)) return null;
    this.bossesSpawned++;
    const type=this.bossesSpawned%S.bossAltEvery===0?"mycelium_heart":"mother_cap";
    // Босс появлялся ровно в центре арены — там же, где стоит игрок, — и
    // мгновенно наносил контактный урон. Ставим его за краем видимости.
    const p=this.camera.pointOutside(S.bossSpawnMargin);
    const boss=new Boss(p.x,p.y,type);
    // Босс четвёртой минуты и босс двадцатой — это разные бои
    const k=1+Math.max(0,this.time-S.bossEvery)/60*S.bossHpPerMin;
    boss.maxHp*=k; boss.hp=boss.maxHp; boss.damage*=this.scale().damage;
    return {type:"boss",boss};
  }

  // Какие типы врагов уже вошли в поток. Пороги — в секундах забега
  // (CONFIG.spawn.unlock), раньше это были номера волн.
  pickType(){
    const U=CONFIG.spawn.unlock, t=this.time;
    let type="spore_bearer";
    if(t>U.mushroom_wolf) type=Math.random()>0.6?"mushroom_wolf":"spore_bearer";
    if(t>U.fruit_body){ const r=Math.random(); if(r>0.7) type="fruit_body"; else if(r>0.4) type="mushroom_wolf"; }
    if(t>U.mycelium_tentacle&&Math.random()>0.7) type="mycelium_tentacle";
    if(t>U.spore_bat&&Math.random()>0.75) type="spore_bat";
    return type;
  }

  spawnEnemy(enemies,sporeEffects){
    // Спавн привязан к камере, а не к фиксированной арене: враги всегда
    // появляются сразу за краем экрана, куда бы игрок ни ушёл.
    const p=this.camera.pointOutside(CONFIG.spawn.spawnMargin);
    const isMutated=Math.random()<(sporeEffects.mutateChance||0);
    enemies.push(new Enemy(p.x,p.y,this.pickType(),isMutated,this.scale()));
  }
}
