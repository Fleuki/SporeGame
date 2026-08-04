// ГРИБНОЙ СУМРАК — КОНФИГ
export const CONFIG = {
  screen: { width: 900, height: 700 },
  // КАМЕРА. zoom — во сколько раз мир крупнее холста. Раньше зума не было
  // вообще: игрок занимал 64 пикселя из 900 и читался как муравей. При 1.6
  // в кадр попадает 562x437 мировых пикселей — вдвое меньше, чем раньше,
  // зато персонаж, враги и их анимации наконец видны.
  //
  // Это осознанный отход от Vampire Survivors: там камера высоко и ставка на
  // количество, здесь — ближе, темнее и меньше врагов, но каждый читается.
  camera: { zoom: 1.6 },
  colors: {
    grass: "#1a3d2e", grassDark: "#0d1f15", mushroom: "#6b2d5c",
    toxic: "#c4a000", biolum: "#00d4aa", acid: "#39ff14",
    armor: "#5c3a21", mask: "#2a2a2a", spore: "#8a8a8a", blood: "#ff3333"
  },
  player: {
    // ВНИМАНИЕ: attackRate НЕ управляет темпом стрельбы — он задаёт только
    // блокировку анимации броска и точку отсчёта для апгрейда скорострельности
    // (Weapon.fire делит текущий attackRate на этот базовый). Реальный темп
    // каждого ствола — это weapons.<ствол>.interval ниже.
    radius: 16, speed: 3.0, maxHp: 100, damage: 10, attackRate: 21,
    // sporeGrowth — процентов спор в секунду. Раньше поле никто не читал, и
    // счётчик спор рос ТОЛЬКО от попаданий: главная механика игры почти не
    // работала, а мутации «споры ×2» не делали ничего.
    // 0.35 %/сек — около минуты на каждую ступень заражения. Это ровно та
    // скорость, при которой забег почти всё время идёт в диапазоне 25–75%:
    // с повышенным лутом и заметно опаснее. В этом и был замысел механики.
    sporeGrowth: 0.35, sporeGrowthOnHit: 3,
    // Кадров неуязвимости после контактного удара. Без них враг наносил урон
    // КАЖДЫЙ кадр касания — грибной волк снимал сотню HP меньше чем за секунду,
    // и понять, что вообще произошло, было невозможно.
    contactIFrames: 26,
    // Щит из прокачки восстанавливается, а не пропадает навсегда после блока
    shieldRecharge: 600,
    // Используем новый спрайт алхимика (вы добавите PNG сами)
    sprite: "assets/images/player/alchemist_purple.png",
    // Настройки для SpriteSheet (реальный размер листа 1024x1024, 4x4 => кадр 256x256)
    spriteFrameW: 256, spriteFrameH: 256,
    spriteCols: 4, spriteRows: 4,
    spriteDisplaySize: 64,
    // === АНИМАЦИЯ БРОСКА — ВЫКЛЮЧЕНА ===
    // Поставь true, чтобы вернуть: лист никуда не делся, отключён только показ.
    //
    // Почему выключена. Лист броска — ОДИН ряд, зеркалимый по горизонтали, а
    // лист ходьбы — четыре ряда на четыре направления. Пока играет бросок,
    // направление взгляда теряется, и вид со спины с видом в профиль не
    // показываются вообще. При этом стрельба автоматическая и идёт три раза в
    // секунду: между бросками остаётся пять кадров, то есть персонаж почти
    // всегда стоит в позе броска, а шестнадцать кадров ходьбы простаивают.
    //
    // Плюс отсюда же росло ограничение attackCols * attackAnimSpeed < attackRate,
    // при нарушении которого игрок навсегда застревал в позе броска.
    //
    // Выстрел теперь читается не позой персонажа, а вспышкой у ствола и
    // свечением самого снаряда — так это сделано в играх жанра, где герой
    // обычно вообще статичный.
    attackAnim: false,
    attackSprite: "assets/images/player_attack/throw.png",
    attackFrameW: 516, attackFrameH: 512,
    attackCols: 4, attackRows: 1,
    attackDisplaySize: 64,
    // Бросок стал реже — анимации можно дать больше кадров на позу.
    // Ограничение прежнее: attackCols * attackAnimSpeed < attackRate (16 < 21).
    attackAnimSpeed: 4,
    // === СМЕРТЬ ===
    // Лист лежал в репозитории с самого начала и никогда не проигрывался:
    // игрок просто замирал, и экран поражения появлялся мгновенно.
    // Лист 2064x512, 4 кадра в ряд => кадр 516x512.
    deathSprite: "assets/images/player/alchemist_death.png",
    deathFrameW: 516, deathFrameH: 512,
    deathCols: 4, deathDisplaySize: 72,
    deathAnimSpeed: 9,   // кадров игры на кадр анимации
    deathHold: 40,       // сколько держать последний кадр до экрана поражения
    color: { body: ["#5c3a21","#3d2616","#2a1a0f"], glow: "#00d4aa", stroke: "#6b2d5c" }
  },
  // ОРУЖИЕ. Все стволы стреляют одновременно, у каждого свой таймер —
  // как в Vampire Survivors и Brotato. Кнопки огня нет, поэтому
  // переключение не подошло бы: на мобильных его нечем нажимать.
  //
  // Роли разведены дистанцией, темпом и типом урона, чтобы стволы не
  // дублировали друг друга:
  //   antidote   — средняя дистанция, частый, одиночная цель
  //   toxic      — дальний, редкий, лужа с уроном по времени
  //   incendiary — ближний, самый редкий, мощный взрыв по области
  //
  // range: 0 — стреляет по прицелу мыши; иначе сам ищет ближайшую цель
  // в этом радиусе и молчит, если её нет.
  weapons: {
    antidote: {
      name: "Склянка антидота", desc: "Прямой выстрел по прицелу",
      // Темп снижен с 14 до 21 кадра (≈4.3 → ≈2.9 выстрела в секунду): очередь
      // сливалась в непрерывную струю, отдельного броска не было слышно и не
      // было видно. Урон поднят с 1.0 до 1.35, чтобы это был другой ритм, а не
      // просто нерф на треть — особенно теперь, когда враги растут по волнам.
      // glow — цвет свечения и шлейфа снаряда. На 32 пикселях детали склянки
      // всё равно не разобрать, а вот движущееся яркое пятно видно всегда:
      // именно оно, а не рисунок склянки, показывает, что ты стреляешь.
      sprite: "projectile", frame: 256, display: 32, glow: "#00d4aa",
      interval: 21, damage: 1.35, speed: 7, radius: 5, range: 0,
      burst: { key: "fx_burst_purple", frame: 128, cols: 4, display: 64, speed: 3 }
    },
    toxic: {
      name: "Токсичная склянка", desc: "Лужа спор: 6 ур/сек, 3 сек",
      sprite: "vial_toxic", frame: 128, display: 30, glow: "#c4a000",
      interval: 46, damage: 0.6, speed: 4.5, radius: 6, range: 320,
      burst: { key: "fx_burst_toxic", frame: 128, cols: 4, display: 96, speed: 4 },
      area: { radius: 78, damage: 0.4, dot: { dps: 6, time: 180 } }
    },
    incendiary: {
      name: "Зажигательная склянка", desc: "Взрыв по области вблизи",
      sprite: "vial_fire", frame: 128, display: 30, glow: "#ff7722",
      interval: 78, damage: 1.2, speed: 5.5, radius: 6, range: 200,
      burst: { key: "fx_burst_big", frame: 256, cols: 4, display: 170, speed: 4 },
      area: { radius: 115, damage: 1.7 }
    }
  },
  // ОЩУЩЕНИЕ ОТ БОЯ. В играх жанра половина удовольствия — не цифры урона, а
  // то, как выглядит попадание: враг вздрагивает, отлетает, вспыхивает белым,
  // экран коротко трясёт. Всё это собрано здесь, чтобы крутить в одном месте.
  feel: {
    hitFlash: 5,             // кадров белой вспышки на получившем урон
    knockback: 3.4,          // импульс отдачи от попадания снаряда
    knockbackBoss: 0.35,     // босса почти не двигает
    knockbackFriction: 0.76,
    damageNumbers: true,
    critChance: 0.10, critMult: 2.0,
    shakeExplosion: 5,       // взрыв зажигательной склянки
    shakeHurt: 6,            // игрок получил урон
    shakeBoss: 12,           // босс вышел на арену
    shakeLevel: 4,
    // Толпа больше не слипается в одно пятно: враги мягко расталкивают друг
    // друга. Иначе двадцать волков стоят в одной точке и выглядят как один.
    separation: 0.42
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
    // Кадров между двумя контактными ударами одного врага. Свой таймер у
    // каждого врага, чтобы толпа била чаще одиночки, но не по 60 раз в секунду.
    touchInterval: 34,
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
  // СПАВН. Волн больше нет. Раньше забег был нарезан на дискретные волны:
  // выпустить N врагов, дождаться зачистки, пауза, следующая волна, босс
  // каждую десятую. Номер волны торчал наружу в интерфейс, в биомы и в
  // множители сложности.
  //
  // Теперь враги идут непрерывным потоком, а вся сложность считается от
  // ВРЕМЕНИ забега (runTime в main.js). Единственная мера прогресса на
  // экране — таймер.
  spawn: {
    // Насколько за краем видимости появляются враги и боссы. Область
    // видимости при зуме сжалась почти вдвое, поэтому запас уменьшен: с
    // прежними 90 враги выходили бы почти в упор, но и уводить их слишком
    // далеко нельзя — иначе они идут к игроку целую вечность.
    spawnMargin: 70,
    // У босса margin ОТРИЦАТЕЛЬНЫЙ — он появляется внутри кадра, у самого
    // края. Материнская Капля неподвижна (speed 0): за краем видимости при
    // такой близкой камере игрок просто никогда бы её не нашёл и продолжал
    // бегать по тёмной арене, не понимая, что босс уже вышел. Отступ такой,
    // чтобы босс не возник вплотную и не ударил в первый же кадр.
    // -80, а не -30: при -30 босс вставал ровно на кромке кадра, и его имя
    // с полосой здоровья (рисуются над ним в мировых координатах) уезжали
    // за экран.
    bossSpawnMargin: -80,

    // ТЕМП. Интервал между спавнами в кадрах: падает от base к min за
    // rampTime секунд. Прежние волны выпускали врага раз в 50 кадров и
    // ускорялись до 10 — сейчас старт медленнее и потолок выше, потому что
    // в кадр при зуме влезает вдвое меньше врагов.
    intervalBase: 96, intervalMin: 22, rampTime: 420,
    // Первые секунды забега пустые: игрок должен успеть увидеть, где он
    // стоит, а не получить врага в лицо на нулевой секунде
    graceTime: 4,

    // Потолок живых врагов на поле. Прямое требование: «убрать количество
    // врагов на поле». Без потолка непрерывный поток за пять минут набивает
    // арену сотней тел, и это ровно та каша, от которой уходим.
    aliveBase: 8, aliveMax: 22, aliveRampTime: 420,

    // ТИШИНА МЕЖДУ СТЫЧКАМИ. Поток не ровный: pushTime секунд идёт спавн,
    // затем lullTime секунд не появляется никто. Без пауз «атмосферно» не
    // бывает — контраст создаёт именно затишье, а не сама по себе темнота.
    pushTime: 26, lullTime: 8,

    // РОСТ СЛОЖНОСТИ. Прежний темп — +11% HP за волну, волна занимала
    // примерно 50 секунд. Эквивалент по времени: +13% за минуту.
    // baseHp/baseDamage — стартовая надбавка: врагов стало меньше, значит
    // каждый должен что-то значить.
    baseHp: 1.25, baseDamage: 1.15,
    hpPerMin: 0.13, dmgPerMin: 0.06,
    speedPerMin: 0.015, speedCapMult: 1.4,

    // БОСС по таймеру, а не по номеру волны. Прежний ритм — босс каждую
    // десятую волну, то есть примерно раз в 8 минут; это дольше, чем живёт
    // средний забег, поэтому босса видели редко. Теперь раз в 4 минуты.
    bossEvery: 240, bossHpPerMin: 0.12,
    // Каждый второй босс — Мицелиевая Сердцевина
    bossAltEvery: 2,

    // Когда в поток входят новые типы врагов, в секундах. Прежние пороги
    // были в волнах (>2, >4, >5, >8) — пересчитаны по 40 секунд на волну.
    unlock: { mushroom_wolf: 80, spore_bat: 160, fruit_body: 200, mycelium_tentacle: 320 }
  },
  // МИР. Раньше он был бесконечным, и это ломало сложность: игрок быстрее
  // почти всех врагов, поэтому оптимальной тактикой было бежать в одну
  // сторону и стрелять назад — догнать его не мог никто. Плюс координаты
  // росли без предела, а декорации привязаны к хешу клетки, который на
  // больших индексах переполняется.
  //
  // Теперь арена конечна. Размер урезан вместе с приближением камеры: при
  // zoom 1.6 в кадр попадает 562x437 мировых пикселей, и прежние 4000x3000
  // превратились бы в семь экранов пустоты. 2600x2000 — это те же ~4.6
  // экрана по каждой оси, что и раньше: хватает, чтобы разрывать дистанцию,
  // но не хватает, чтобы убегать вечно.
  // Центр мира — точка (0,0), там же появляется игрок.
  world: {
    width: 2600, height: 2000,
    edgeFog: 260,        // ширина полосы тумана вдоль границы
    voidColor: "#05080a"  // за границей мира земли нет
  },
  // КАРТА. Земля — бесшовный тайл, декорации раскладываются процедурно по
  // клеткам мира (см. systems/mapSystem.js).
  map: {
    // Тайл уменьшен вместе с зумом: на экране он должен остаться примерно
    // прежнего размера, иначе текстура земли выглядит вчетверо крупнее.
    tileSize: 200,          // размер тайла земли в мировых пикселях
    secondsPerBiome: 150,   // через сколько секунд забега меняется биом
    // Виньетка ослаблена: поверх неё теперь ложится темнота с кругом света
    // вокруг игрока (map.darkness), и вдвоём они делали края экрана чёрными
    vignette: 0.28,
    // ТЕМНОТА. Арена больше не освещена равномерно: весь кадр затемняется,
    // и свет остаётся только вокруг игрока и вокруг светящихся декораций.
    // Радиусы — в ЭКРАННЫХ пикселях, слой рисуется поверх мирового.
    darkness: {
      // 0.6, а не 0.8: враг, вышедший из темноты, обязан читаться силуэтом
      // ЗАРАНЕЕ. Иначе это не атмосфера, а слепая зона — урон прилетает из
      // черноты, и понять, откуда, невозможно.
      strength: 0.6,        // 0 — света полный экран, 1 — за кругом чернота
      playerRadius: 300,    // до какого радиуса свет полностью гаснет
      playerCore: 0.35,     // доля радиуса, внутри которой света не убавляют
      propRadius: 130,      // ореол вокруг светящейся декорации
      // Дыхание света: круг едва заметно пульсирует, иначе он выглядит
      // приклеенным к персонажу трафаретом
      pulse: 10, pulseSpeed: 0.02
    },
    // Биомы идут по кругу: мох → грязь → костяная гниль.
    // tint приглушает текстуру, чтобы враги и снаряды читались поверх неё.
    // Значения подняты: текстуры земли сами по себе нарисованы грибами и мхом,
    // и тёмный силуэт врага на них терялся среди декора самой текстуры. Земля
    // должна быть фоном, а не второй толпой.
    biomes: [
      { key: "moss",   tile: "groundMoss",   tint: "rgba(10,26,18,0.52)" },
      { key: "dirt",   tile: "groundDirt",   tint: "rgba(20,12,7,0.50)" },
      { key: "biolum", tile: "groundBiolum", tint: "rgba(5,20,22,0.54)" },
      { key: "bone",   tile: "groundBone",   tint: "rgba(14,10,28,0.68)" }
    ],
    // Декорации: чистый фон, коллизий у них нет.
    // width — ширина на экране, высота считается по пропорциям картинки.
    // flat — объект лежит на земле: без тени и с центром в точке, а не низом.
    // frames — анимированный лист (кадры в один ряд).
    props: {
      spore_tree: {
        image: "propSporeTree", width: 118, weight: 3,
        glow: "rgba(150,110,255,0.5)", glowBlur: 26
      },
      dead_tree: {
        image: "propDeadTree", width: 150, weight: 3,
        glow: "rgba(190,90,220,0.4)", glowBlur: 30
      },
      mushroom_cart: {
        image: "propMushroomCart", width: 168, weight: 2
      },
      mossy_rock: {
        image: "propMossyRock", width: 96, weight: 4
      },
      glow_shrooms: {
        image: "propGlowShrooms", width: 88, weight: 3,
        glow: "rgba(230,90,255,0.55)", glowBlur: 22
      },
      acid_pool: {
        // weight ниже остальных: лужа не украшение, а опасность —
        // на каждом шагу она превращает арену в минное поле
        image: "propAcidPool", width: 120, weight: 2,
        flat: true, frames: 4, animSpeed: 11,
        // Лужа жжёт всех, кто в неё зашёл, — и игрока, и врагов.
        // hazardRadius — доля от width: у спрайта есть каменный бортик,
        // поэтому урон идёт только по зелёной середине.
        hazard: { radius: 0.36, dps: 9, spore: 4, enemyDps: 14 }
      }
    },
    decorCell: 300,         // сторона клетки мира: не больше одной декорации на клетку
    decorChance: 0.5,       // доля клеток с декорацией
    decorClearRadius: 150,  // радиус вокруг точки старта без декораций
  },
  // ЛУТ. Опыт больше не начисляется в момент смерти врага — он выпадает
  // шариками, за которыми надо идти. Значения кристаллов растут по кадрам
  // листа: мелкий → крупный.
  // Вспышка при получении уровня: 4 кадра — вихрь, пламя, надпись, искры
  levelUp: { key: "fx_levelup", frame: 192, cols: 4, display: 220, speed: 7 },
  loot: {
    magnetRadius: 70,     // с какого расстояния предмет летит к игроку
    magnetForce: 0.55,
    friction: 0.9,        // затухание разлёта из точки смерти
    defaultLife: 900,     // 15 секунд при 60 fps
    despawnMargin: 500,   // за этим краем от камеры предмет выбрасывается
    crystalTiers: [10, 25, 60, 150],  // опыт по кадрам drop_crystal
    maxDrops: 12,         // страховка от сотни предметов с жирного босса
    // Антидот — единственный способ сбить заражение, и теперь оно растёт само.
    // При 8% на волне из десяти врагов его могло не выпасть вовсе.
    antidoteChance: 0.11,
    potionChance: 0.05,
    coinChance: 0.12,
    types: {
      xp_orb:   { image:"dropXpOrb",   size:26, radius:11, xp:true, value:1,
                  frames:5, animSpeed:6, particle:"#ffd24a" },
      crystal:  { image:"dropCrystal", size:40, radius:14, xp:true, value:10,
                  frames:4, particle:"#c08cff" },
      antidote: { image:"dropAntidote", size:26, radius:12, spore:25,
                  particle:"#00d4aa" },
      potion:   { image:"dropPotion",  size:28, radius:12, heal:25,
                  particle:"#ff4455" },
      coin:     { image:"dropCoin",    size:24, radius:11, coin:1,
                  particle:"#ffcc33" }
    }
  },
  assets: {
    images: {
      player: "assets/images/player/alchemist_purple.png",
      playerAttack: "assets/images/player_attack/throw.png",
      playerDeath: "assets/images/player/alchemist_death.png",
      projectile: "assets/images/projectiles/potion.png",
      vial_toxic: "assets/images/projectiles/vial_toxic.png",
      vial_fire: "assets/images/projectiles/vial_fire.png",
      fx_burst_purple: "assets/images/effects/burst_purple.png",
      fx_burst_toxic: "assets/images/effects/burst_toxic.png",
      fx_burst_big: "assets/images/effects/burst_big.png",
      enemy_spore_bearer: "assets/images/enemies/spore_bearer.png",
      enemy_mushroom_wolf: "assets/images/enemies/mushroom_wolf.png",
      enemy_spore_bat: "assets/images/enemies/spore_bat.png",
      boss_mother_cap: "assets/images/bosses/mother_cap.png",
      boss_mycelium_heart: "assets/images/bosses/mycelium_heart.png",
      // fruit_body и mycelium_tentacle пока без спрайтов — рисуются примитивами
      groundMoss: "assets/images/map/ground_moss.png",
      groundDirt: "assets/images/map/ground_dirt.png",
      groundBone: "assets/images/map/ground_bone.png",
      groundBiolum: "assets/images/map/ground_biolum.png",
      propSporeTree: "assets/images/props/prop_spore_tree.png",
      propDeadTree: "assets/images/props/prop_dead_tree.png",
      propMushroomCart: "assets/images/props/prop_mushroom_cart.png",
      propMossyRock: "assets/images/props/prop_mossy_rock.png",
      propGlowShrooms: "assets/images/props/prop_glow_shrooms.png",
      propAcidPool: "assets/images/effects/acid_pool.png",
      dropXpOrb: "assets/images/drops/drop_xp_orb.png",
      dropCrystal: "assets/images/drops/drop_crystal.png",
      dropAntidote: "assets/images/drops/drop_antidote.png",
      dropPotion: "assets/images/drops/drop_potion.png",
      dropCoin: "assets/images/drops/drop_coin.png",
      fx_levelup: "assets/images/effects/levelup.png"
    },
    sounds: {}
  }
};
