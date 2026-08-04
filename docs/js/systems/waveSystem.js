import { CONFIG } from "../config.js";
import { Enemy } from "../entities/enemy.js";
import { Boss } from "../entities/boss.js";

export class WaveSystem {
  constructor(camera){
    this.camera=camera;
    this.wave=0;
    this.enemiesPerWave=CONFIG.waves.baseEnemies;
    this.spawnTimer=0;
    this.spawnInterval=CONFIG.waves.spawnIntervalBase;
    this.enemiesSpawned=0;
    this.waveDelay=0;
    this.active=true;
    this.bossSpawned=false;
  }

  // Множители характеристик врагов текущей волны. Отдельным методом, чтобы
  // их видели и рядовые враги, и боссы, и интерфейс, если понадобится.
  scale(){
    const W=CONFIG.waves, n=Math.max(0,this.wave-1);
    return {
      hp: 1+n*W.hpPerWave,
      damage: 1+n*W.dmgPerWave,
      // Скорость упирается в потолок: враг быстрее игрока превращает игру
      // в безвыходную погоню, а не в бой
      speed: Math.min(W.speedCapMult,1+n*W.speedPerWave)
    };
  }

  startWave(){
    this.wave++;
    this.enemiesPerWave=Math.floor(CONFIG.waves.baseEnemies+this.wave*CONFIG.waves.enemyMultiplier);
    this.spawnInterval=Math.max(CONFIG.waves.spawnIntervalMin,CONFIG.waves.spawnIntervalBase-this.wave*1.2);
    this.enemiesSpawned=0;
    this.waveDelay=CONFIG.waves.delayBetweenWaves;
    this.bossSpawned=false;
  }

  update(enemies,player,sporeEffects){
    if(!this.active) return null;
    if(this.waveDelay>0){ this.waveDelay--; return null; }

    if(this.wave%CONFIG.waves.bossEvery===0 && this.wave>0 && !this.bossSpawned
       && enemies.filter(e=>e instanceof Boss).length===0){
      this.bossSpawned=true;
      const type=this.wave%20===0?"mycelium_heart":"mother_cap";
      // Босс появлялся ровно в центре арены — там же, где стоит игрок, — и
      // мгновенно наносил контактный урон. Ставим его за краем видимости.
      const p=this.camera.pointOutside(CONFIG.waves.bossSpawnMargin);
      const boss=new Boss(p.x,p.y,type);
      // Босс десятой волны и босс сороковой — это должны быть разные бои
      const k=1+Math.max(0,this.wave-CONFIG.waves.bossEvery)*CONFIG.waves.bossHpPerWave;
      boss.maxHp*=k; boss.hp=boss.maxHp; boss.damage*=this.scale().damage;
      return {type:"boss",boss};
    }

    if(this.enemiesSpawned<this.enemiesPerWave){
      this.spawnTimer--;
      if(this.spawnTimer<=0){
        this.spawnEnemy(enemies,sporeEffects);
        this.enemiesSpawned++;
        this.spawnTimer=this.spawnInterval;
      }
    } else {
      // Ждём не полной зачистки, а «почти»: догонять последнего спороносца
      // через полкарты — это не бой, а простой.
      const left=enemies.filter(e=>!e.dead&&!(e instanceof Boss)).length;
      if(left<=CONFIG.waves.nextWaveWhenLeft){ this.startWave(); return {type:"wave",wave:this.wave}; }
    }
    return null;
  }

  pickType(){
    let type="spore_bearer";
    if(this.wave>2) type=Math.random()>0.6?"mushroom_wolf":"spore_bearer";
    if(this.wave>5){ const r=Math.random(); if(r>0.7) type="fruit_body"; else if(r>0.4) type="mushroom_wolf"; }
    if(this.wave>8&&Math.random()>0.7) type="mycelium_tentacle";
    if(this.wave>4&&Math.random()>0.75) type="spore_bat";
    return type;
  }

  spawnEnemy(enemies,sporeEffects){
    // Спавн привязан к камере, а не к фиксированной арене: враги всегда
    // появляются сразу за краем экрана, куда бы игрок ни ушёл.
    const p=this.camera.pointOutside(CONFIG.waves.spawnMargin);
    const isMutated=Math.random()<(sporeEffects.mutateChance||0);
    enemies.push(new Enemy(p.x,p.y,this.pickType(),isMutated,this.scale()));
  }

  reset(){ this.wave=0; this.startWave(); }
}
