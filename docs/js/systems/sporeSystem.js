import { CONFIG } from "../config.js";
export class SporeSystem {
  constructor(){ this.antidotes=[]; }
  spawnAntidote(x,y){ this.antidotes.push({x,y,radius:10,life:300,maxLife:300}); }
  update(player){
    for(let i=this.antidotes.length-1;i>=0;i--){
      const a=this.antidotes[i]; a.life--; const d=Math.hypot(a.x-player.x,a.y-player.y);
      if(d<a.radius+player.radius+10){ player.reduceSpore(25); this.antidotes.splice(i,1); continue; }
      if(a.life<=0) this.antidotes.splice(i,1);
    }
  }
  getSporeEffects(sl){
    if(sl>=CONFIG.sporeSystem.thresholds.critical) return CONFIG.sporeSystem.effects.critical;
    if(sl>=CONFIG.sporeSystem.thresholds.danger) return CONFIG.sporeSystem.effects.danger;
    if(sl>=CONFIG.sporeSystem.thresholds.warning) return CONFIG.sporeSystem.effects.warning;
    return {enemySpeedMult:1,lootMult:1,mutateChance:0};
  }
  draw(renderer){
    for(const a of this.antidotes){ const pulse=Math.sin(Date.now()/200)*2; renderer.drawGlowCircle(a.x,a.y,a.radius+pulse,"#00d4aa",15); renderer.drawCircle(a.x,a.y,a.radius,"#aaffff"); renderer.drawText("💊",a.x-6,a.y+4,{font:"10px monospace",color:"#fff"}); }
  }
}