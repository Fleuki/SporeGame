import { CONFIG } from "../config.js";
// Уровень спор и его эффекты. Антидоты переехали в LootSystem: теперь это
// такой же выпадающий предмет, как опыт и зелья, со спрайтом и притяжением.
export class SporeSystem {
  getSporeEffects(sl){
    if(sl>=CONFIG.sporeSystem.thresholds.critical) return CONFIG.sporeSystem.effects.critical;
    if(sl>=CONFIG.sporeSystem.thresholds.danger) return CONFIG.sporeSystem.effects.danger;
    if(sl>=CONFIG.sporeSystem.thresholds.warning) return CONFIG.sporeSystem.effects.warning;
    return {enemySpeedMult:1,lootMult:1,mutateChance:0};
  }
}