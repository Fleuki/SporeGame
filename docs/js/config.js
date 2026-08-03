// ГРИБНОЙ СУМРАК — КОНФИГ
export const CONFIG = {
  screen: { width: 900, height: 700 },
  colors: {
    grass: "#1a3d2e", grassDark: "#0d1f15", mushroom: "#6b2d5c",
    toxic: "#c4a000", biolum: "#00d4aa", acid: "#39ff14",
    armor: "#5c3a21", mask: "#2a2a2a", spore: "#8a8a8a", blood: "#ff3333"
  },
  player: {
    radius: 16, speed: 3.0, maxHp: 100, damage: 10, attackRate: 14,
    sporeGrowth: 0.08, sporeGrowthOnHit: 3,
    // Используем новый спрайт алхимика (вы добавите PNG сами)
    sprite: "assets/images/player/alchemist_purple.png",
    // Настройки для SpriteSheet (реальный размер листа 1024x1024, 4x4 => кадр 256x256)
    spriteFrameW: 256, spriteFrameH: 256,
    spriteCols: 4, spriteRows: 4,
    spriteDisplaySize: 64,
    // === НОВОЕ: анимация атаки ===
    // Лист 2064x512, 4 кадра в ряд => кадр 516x512.
    // attackCols * attackAnimSpeed должно быть МЕНЬШЕ attackRate,
    // иначе анимация не успевает доиграть до следующего броска и игрок
    // навсегда застревает в состоянии атаки (Player.update это ещё и подстрахует).
    attackSprite: "assets/images/player_attack/throw.png",
    attackFrameW: 516, attackFrameH: 512,
    attackCols: 4, attackRows: 1,
    attackDisplaySize: 64,
    attackAnimSpeed: 3,
    color: { body: ["#5c3a21","#3d2616","#2a1a0f"], glow: "#00d4aa", stroke: "#6b2d5c" }
  },
  projectile: {
    // === НОВОЕ: спрайт снаряда ===
    // Один кадр 256x256, склянка смотрит вправо, искры тянутся назад.
    sprite: "assets/images/projectiles/potion.png",
    frameW: 256, frameH: 256,
    cols: 1, rows: 1,
    displaySize: 32,
    animSpeed: 5
  },
  sporeSystem: {
    maxSpore: 100,
    thresholds: { safe: 25, warning: 50, danger: 75, critical: 100 },
    effects: {
      warning: { enemySpeedMult: 1.1, lootMult: 1.5, mutateChance: 0 },
      danger: { enemySpeedMult: 1.25, lootMult: 2.0, mutateChance: 0.3 },
      critical:{ enemySpeedMult: 1.5, lootMult: 3.0, mutateChance: 1.0, hpDrain: 1.0 }
    }
  },
  enemies: {
    types: {
      spore_bearer: {
        name: "Спороносец", hp: 25, speed: 0.7, radius: 14, damage: 8, xpReward: 6,
        color: { body: ["#8a8a8a","#6b2d5c","#3d1a33"] },
        // Ряд 0 — вид в три четверти с вытянутыми руками, лицом вправо.
        sprite: { key:"enemy_spore_bearer", frame:128, cols:4, rows:3,
                  row:0, mirror:true, animSpeed:10, display:58 },
        abilities: ["spore_cloud_on_death"], sporeCloudRadius: 60, sporeCloudAmount: 5
      },
      mushroom_wolf: {
        name: "Грибной Волк", hp: 35, speed: 2.2, radius: 13, damage: 12, xpReward: 10,
        color: { body: ["#5c3a21","#6b2d5c","#2a1a0f"] },
        // У волка полноценный набор из 4 направлений: ряды сверху вниз —
        // от камеры, вправо, на камеру, влево.
        sprite: { key:"enemy_mushroom_wolf", frame:128, cols:4, rows:4,
                  dirRows:{up:0,right:1,down:2,left:3}, animSpeed:6, display:64 },
        abilities: ["spore_trail","spore_cloud_on_death"],
        trailInterval: 8, sporeCloudRadius: 50, sporeCloudAmount: 8
      },
      fruit_body: {
        name: "Плодовое Тело", hp: 60, speed: 0.4, radius: 22, damage: 0, xpReward: 15,
        color: { body: ["#6b2d5c","#c4a000","#3d1a33"] }, sprite: null,
        abilities: ["explode_on_death"], explodeRadius: 100, explodeDamage: 25, sporeCloudAmount: 15
      },
      mycelium_tentacle: {
        name: "Мицелиевое Щупальце", hp: 15, speed: 0, radius: 12, damage: 3, xpReward: 8,
        color: { body: ["#6b2d5c","#00d4aa","#3d1a33"] }, sprite: null,
        abilities: ["emerge_from_ground","grab_player"],
        grabDuration: 60, emergeDelay: 45
      },
      spore_bat: {
        name: "Летучая Спора", hp: 20, speed: 1.8, radius: 11, damage: 10, xpReward: 9,
        color: { body: ["#2a2a2a","#6b2d5c","#8a8a8a"] },
        // Ряд 0 — вид спереди, 4 фазы взмаха крыльев.
        sprite: { key:"enemy_spore_bat", frame:128, cols:4, rows:4,
                  row:0, mirror:true, animSpeed:5, display:56 },
        abilities: ["zigzag_flight","toxic_trail"], zigzagAmp: 2.5, trailInterval: 5
      }
    }
  },
  bosses: {
    mother_cap: {
      name: "Материнская Капля", hp: 800, speed: 0, radius: 45, damage: 20, xpReward: 200,
      color: { body: ["#6b2d5c","#c4a000","#ff3333"] },
      // Ряды 2-3 листа (East/West) собраны из несовместимых поз, годится
      // только вид на камеру — ряд 1.
      sprite: { key:"boss_mother_cap", frame:256, cols:4, rows:4,
                row:1, animSpeed:9, display:150 },
      abilities: ["spawn_minions","sneeze_burst"],
      sneezeInterval: 180, sneezeCooldown: 90,
      minionType: "spore_bearer", minionCount: 3, sporeCloudRadius: 120
    },
    mycelium_heart: {
      name: "Мицелиевая Сердцевина", hp: 1200, speed: 0, radius: 40, damage: 15, xpReward: 300,
      color: { body: ["#00d4aa","#6b2d5c","#1a3d2e"] },
      // 4 ряда листа — 4 стадии сердцебиения, они же фазы босса:
      // ряд выбирается по остатку HP, колонки крутят удар сердца.
      sprite: { key:"boss_mycelium_heart", frame:256, cols:4, rows:4,
                phaseRows:true, animSpeed:7, display:140 },
      abilities: ["summon_tentacles","pulse_damage"],
      tentacleInterval: 120, pulseInterval: 90
    }
  },
  waves: {
    baseEnemies: 3, enemyMultiplier: 1.6, spawnIntervalBase: 50,
    spawnIntervalMin: 10, delayBetweenWaves: 60, bossEvery: 10,
    // Насколько за краем видимости появляются враги и боссы
    spawnMargin: 90, bossSpawnMargin: 160
  },
  assets: {
    images: {
      player: "assets/images/player/alchemist_purple.png",
      playerAttack: "assets/images/player_attack/throw.png",
      projectile: "assets/images/projectiles/potion.png",
      enemy_spore_bearer: "assets/images/enemies/spore_bearer.png",
      enemy_mushroom_wolf: "assets/images/enemies/mushroom_wolf.png",
      enemy_spore_bat: "assets/images/enemies/spore_bat.png",
      boss_mother_cap: "assets/images/bosses/mother_cap.png",
      boss_mycelium_heart: "assets/images/bosses/mycelium_heart.png"
      // fruit_body и mycelium_tentacle пока без спрайтов — рисуются примитивами
    },
    sounds: {}
  }
};
