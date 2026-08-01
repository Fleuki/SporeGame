import { CONFIG } from "../config.js";
import { Enemy } from "../entities/enemy.js";
import { Boss } from "../entities/boss.js";
import { rand } from "../utils/math.js";
export class WaveSystem {
  constructor(w,h){ this.w=w; this.h=h; this.wave=0; this.enemiesPerWave=CONFIG.waves.baseEnemies; this.spawnTimer=0; this.spawnInterval=CONFIG.waves.spawnIntervalBase; this.enemiesSpawned=0; this.waveDelay=0; this.active=true; this.bossSpawned=false; }
  startWave(){ this.wave++; this.enemiesPerWave=Math.floor(CONFIG.waves.baseEnemies+this.wave*CONFIG.waves.enemyMultiplier); this.spawnInterval=Math.max(CONFIG.waves.spawnIntervalMin,CONFIG.waves.spawnIntervalBase-this.wave*1.2); this.enemiesSpawned=0; this.waveDelay=CONFIG.waves.delayBetweenWaves; this.bossSpawned=false; }
  update(enemies,player,sporeEffects){
    if(!this.active) return null;
    if(this.waveDelay>0){ this.waveDelay--; return null; }
    if(this.wave%CONFIG.waves.bossEvery===0&&this.wave>0&&!this.bossSpawned&&enemies.filter(e=>e instanceof Boss).length===0){
      this.bossSpawned=true; const type=this.wave%20===0?"mycelium_heart":"mother_cap"; return {type:"boss",boss:new Boss(this.w/2,this.h/2,type)};
    }
    if(this.enemiesSpawned<this.enemiesPerWave){ this.spawnTimer--; if(this.spawnTimer<=0){ this.spawnEnemy(enemies,sporeEffects); this.enemiesSpawned++; this.spawnTimer=this.spawnInterval; } }
    else if(enemies.length===0||(enemies.length===1&&enemies[0] instanceof Boss)) this.startWave();
    return null;
  }
  spawnEnemy(enemies,sporeEffects){
    const side=Math.floor(Math.random()*4), pad=40; let x,y;
    if(side===0){x=rand(-pad,this.w+pad);y=-pad;} else if(side===1){x=this.w+pad;y=rand(-pad,this.h+pad);} else if(side===2){x=rand(-pad,this.w+pad);y=this.h+pad;} else {x=-pad;y=rand(-pad,this.h+pad);}
    let type="spore_bearer";
    if(this.wave>2) type=Math.random()>0.6?"mushroom_wolf":"spore_bearer";
    if(this.wave>5){ const r=Math.random(); if(r>0.7) type="fruit_body"; else if(r>0.4) type="mushroom_wolf"; }
    if(this.wave>8&&Math.random()>0.7) type="mycelium_tentacle";
    if(this.wave>4&&Math.random()>0.75) type="spore_bat";
    const isMutated=Math.random()<(sporeEffects.mutateChance||0);
    enemies.push(new Enemy(x,y,type,isMutated));
  }
  reset(){ this.wave=0; this.startWave(); }
}