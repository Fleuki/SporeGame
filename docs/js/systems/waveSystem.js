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
      return {type:"boss",boss:new Boss(p.x,p.y,type)};
    }

    if(this.enemiesSpawned<this.enemiesPerWave){
      this.spawnTimer--;
      if(this.spawnTimer<=0){
        this.spawnEnemy(enemies,sporeEffects);
        this.enemiesSpawned++;
        this.spawnTimer=this.spawnInterval;
      }
    } else if(enemies.length===0||(enemies.length===1&&enemies[0] instanceof Boss)){
      this.startWave();
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
    enemies.push(new Enemy(p.x,p.y,this.pickType(),isMutated));
  }

  reset(){ this.wave=0; this.startWave(); }
}
