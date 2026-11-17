// DUNGEON DELVE — the simulation: player, enemies, boss, bullets, loot, traps,
// floor descent, win/lose. Fixed step (1/60), seeded RNG, no Math.random, no Date.
// The renderer only draws what is here; the sim never touches the DOM.
import { VIEW, STEP, TILE, COLS, ROWS, TOTAL_FLOORS, FLOOR_NAMES, COLORS, PLAYER, ENEMIES, FLOOR_SPAWNS, TRAPS, PICKUPS, BOSS } from './config.js';
import { makeRng, range, intRange, pick, shuffle } from './random.js';
import { generateDungeon, tileAt, isWallAtPixel, isLavaAtPixel, isSpikeAtPixel, collideCircle, hasLineOfSight, T_WALL } from './dungeon.js';
import { moveVector } from './input.js';
import { sfx } from './audio.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

export function makeWorld(seed) {
  const world = {
    seed,
    rng: makeRng(seed),
    screen: SCREEN_TITLE,
    time: 0,
    timePlayed: 0,
    floor: 1,
    dungeon: null,
    player: null,
    enemies: [],
    bullets: [],
    pickups: [],
    particles: [],
    texts: [],
    rings: [],
    shake: 0,
    score: 0,
    kills: 0,
    gold: 0,
    streak: 0,
    streakTimer: 0,
    hasKey: false,
    boss: null,
    bossActive: false,
    bossSummoned: false,
    floorCard: 0,
    objective: '',
    winStats: null,
  };
  reset(world);
  return world;
}

function resetPlayer(world) {
  const p = world.player || {};
  world.player = {
    x: world.dungeon.spawn.x,
    y: world.dungeon.spawn.y,
    radius: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    angle: -Math.PI / 2,
    speed: PLAYER.speed,
    slashTimer: 0,
    boltTimer: 0,
    slashAnim: 0,
    dodgeTimer: 0,
    dodgeCooldown: 0,
    dodgeDirX: 0,
    dodgeDirY: -1,
    invuln: 0,
    potions: PLAYER.potionStart,
    spikeTick: 0,
    lavaTick: 0,
    bob: 0,
  };
  return p;
}

export function reset(world) {
  world.rng = makeRng(world.seed);
  world.time = 0;
  world.timePlayed = 0;
  world.floor = 1;
  world.enemies = [];
  world.bullets = [];
  world.pickups = [];
  world.particles = [];
  world.texts = [];
  world.rings = [];
  world.shake = 0;
  world.score = 0;
  world.kills = 0;
  world.gold = 0;
  world.streak = 0;
  world.streakTimer = 0;
  world.hasKey = false;
  world.boss = null;
  world.bossActive = false;
  world.bossSummoned = false;
  world.floorCard = 0;
  world.winStats = null;
  world.dungeon = generateDungeon(world.rng, 1);
  resetPlayer(world);
  spawnFloorEnemies(world);
  world.objective = 'Find the key — slay the ELITE';
  world.screen = SCREEN_TITLE;
}

export function startGame(world) {
  reset(world);
  world.screen = SCREEN_PLAY;
  world.floorCard = 2.2;
}

function spawnEnemy(world, type, x, y) {
  const def = ENEMIES[type];
  const e = {
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: def.hp,
    maxHp: def.hp,
    radius: def.radius,
    speed: def.speed,
    damage: def.damage,
    state: 'chase',
    stateTimer: 0,
    angle: 0,
    flash: 0,
    bobPhase: world.rng() * Math.PI * 2,
    shootTimer: range(world.rng, 1.0, 2.2),
    attackCooldown: 0,
    chargeDirX: 0,
    chargeDirY: 0,
    burstTimer: BOSS.burstEvery,
    dead: false,
  };
  world.enemies.push(e);
  return e;
}

function spawnFloorEnemies(world) {
  const d = world.dungeon;
  const spawns = shuffle(world.rng, d.spawnPoints.slice());
  let si = 0;
  const nextSpawn = () => {
    const s = spawns[si % spawns.length];
    si += 1;
    return s;
  };
  if (world.floor < TOTAL_FLOORS) {
    const elite = spawnEnemy(world, 'elite', d.eliteSpawn.x, d.eliteSpawn.y);
    elite.name = world.floor === 1 ? 'SLIME KING' : 'BONE LORD';
  } else {
    // Floor 3: the boss waits dormant in the farthest room (the exit tile).
    // It only wakes when the delver comes within 380px, so the player clears
    // the floor first and meets the boss fresh, one on one — instead of the
    // boss hunting them across the whole map while mobs chew on them too.
    const boss = spawnEnemy(world, 'boss', d.exit.x, d.exit.y);
    boss.name = 'THE WARDEN';
    boss.state = 'dormant';
    world.boss = boss;
  }
  const plan = FLOOR_SPAWNS[world.floor - 1];
  for (const type of ['slime', 'bat', 'skeleton', 'mage']) {
    for (let i = 0; i < (plan[type] || 0); i += 1) {
      const s = nextSpawn();
      spawnEnemy(world, type, s.x, s.y);
    }
  }
}

export function descend(world) {
  world.floor += 1;
  world.rng = makeRng(world.seed + world.floor * 7919);
  world.dungeon = generateDungeon(world.rng, world.floor);
  world.enemies = [];
  world.bullets = [];
  world.pickups = [];
  world.boss = null;
  world.bossActive = false;
  world.bossSummoned = false;
  world.hasKey = false;
  const keepHp = world.player.hp;
  const keepPotions = world.player.potions;
  resetPlayer(world);
  world.player.hp = keepHp;
  world.player.potions = keepPotions;
  spawnFloorEnemies(world);
  world.floorCard = 2.2;
  world.objective = world.floor < TOTAL_FLOORS ? 'Find the key — slay the ELITE' : 'Slay THE WARDEN';
}

function burst(world, x, y, color, n, speed, life = 0.6, size = 3) {
  for (let i = 0; i < n; i += 1) {
    const a = world.rng() * Math.PI * 2;
    const s = range(world.rng, speed * 0.3, speed);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: range(world.rng, life * 0.5, life),
      maxLife: life,
      size: range(world.rng, size * 0.6, size * 1.4),
      color,
    });
  }
}

function addRing(world, x, y, r0, r1, color, life = 0.35) {
  world.rings.push({ x, y, r0, r1, life, maxLife: life, color });
}

function addText(world, x, y, text, color, size = 15) {
  world.texts.push({ x, y, text, color, size, life: 0.9, maxLife: 0.9 });
}

function dropPickup(world, x, y, kind, value = 0) {
  const a = world.rng() * Math.PI * 2;
  world.pickups.push({
    kind, x, y,
    vx: Math.cos(a) * range(world.rng, 30, 90),
    vy: Math.sin(a) * range(world.rng, 30, 90),
    value,
    life: 0,
  });
}

function damagePlayer(world, amount, fromX, fromY) {
  const p = world.player;
  if (p.invuln > 0 || world.screen !== SCREEN_PLAY) return;
  p.hp -= amount;
  p.invuln = PLAYER.invuln;
  world.shake = Math.min(1, world.shake + 0.45);
  addText(world, p.x, p.y - 24, `-${amount}`, '#ff6b6b', 17);
  burst(world, p.x, p.y, '#ff6b6b', 8, 160, 0.4, 3);
  sfx.hurt(world.audioRef);
  if (p.hp <= 0) {
    p.hp = 0;
    world.screen = SCREEN_OVER;
    world.winStats = { score: world.score, kills: world.kills, gold: world.gold, floor: world.floor, time: world.timePlayed };
    burst(world, p.x, p.y, COLORS.player, 40, 260, 0.9, 4);
    sfx.over(world.audioRef);
  }
}

function killEnemy(world, enemy, awardScore) {
  enemy.dead = true;
  world.kills += 1;
  const def = ENEMIES[enemy.type];
  world.score += def.score;
  // Kill streak: consecutive kills within 3s build a combo that pays bonus
  // score and shows in the HUD — the "one more kill" pull that makes a
  // dungeon run feel electric.
  if (world.streakTimer > 0) world.streak += 1;
  else world.streak = 1;
  world.streakTimer = 3.0;
  if (world.streak >= 2) {
    const bonus = (world.streak - 1) * 5;
    world.score += bonus;
    addText(world, enemy.x, enemy.y - enemy.radius - 24, `STREAK x${world.streak} +${bonus}`, COLORS.gold, 16);
  }
  world.shake = Math.min(1, world.shake + (enemy.type === 'boss' ? 1 : 0.18));
  burst(world, enemy.x, enemy.y, def.color, enemy.type === 'boss' ? 60 : 16, enemy.type === 'boss' ? 320 : 200, 0.7, 4);
  addRing(world, enemy.x, enemy.y, 6, enemy.radius * 2.4, def.color, 0.4);
  addText(world, enemy.x, enemy.y - enemy.radius - 6, `+${def.score}`, COLORS.gold, 15);
  // Gold coins scatter; a heart sometimes.
  const coins = enemy.type === 'elite' ? 5 : enemy.type === 'boss' ? 10 : intRange(world.rng, 1, 3);
  for (let i = 0; i < coins; i += 1) dropPickup(world, enemy.x, enemy.y, 'coin', Math.max(1, Math.round(def.gold / coins)));
  if (world.rng() < PICKUPS.heartChance) dropPickup(world, enemy.x, enemy.y, 'heart', PICKUPS.heartHeal);
  sfx.die(world.audioRef);
  if (enemy.type === 'elite') {
    dropPickup(world, enemy.x, enemy.y, 'key', 0);
    addText(world, enemy.x, enemy.y - 44, 'THE KEY DROPPED!', COLORS.key, 18);
    sfx.key(world.audioRef);
  }
  if (enemy.type === 'boss') {
    world.screen = SCREEN_WIN;
    world.winStats = { score: world.score + 500, kills: world.kills, gold: world.gold, floor: world.floor, time: world.timePlayed };
    world.score += 500;
    burst(world, enemy.x, enemy.y, COLORS.bossCore, 80, 380, 1.2, 5);
    addRing(world, enemy.x, enemy.y, 10, 320, COLORS.gold, 0.8);
    sfx.win(world.audioRef);
  }
}

function playerSlash(world) {
  const p = world.player;
  p.slashTimer = PLAYER.slashCooldown;
  p.slashAnim = 0.18;
  sfx.swing(world.audioRef);
  let hitAny = false;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > PLAYER.slashRange + e.radius) continue;
    const ang = Math.atan2(dy, dx);
    let diff = Math.abs(ang - p.angle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > PLAYER.slashArc) continue;
    if (!hasLineOfSight(world.dungeon, p.x, p.y, e.x, e.y)) continue;
    e.hp -= PLAYER.slashDamage;
    e.flash = 0.12;
    const kb = 140;
    e.x += (dx / (dist || 1)) * kb * 0.06;
    e.y += (dy / (dist || 1)) * kb * 0.06;
    addText(world, e.x, e.y - e.radius - 4, `${PLAYER.slashDamage}`, '#ffffff', 14);
    burst(world, e.x, e.y, '#e0f2fe', 4, 120, 0.3, 2);
    hitAny = true;
    if (e.hp <= 0) killEnemy(world, e, true);
  }
  if (hitAny) sfx.hit(world.audioRef);
}

function fireBolt(world, friendly, x, y, angle, speed, damage, radius, color) {
  world.bullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
    damage,
    friendly,
    color,
    life: 2.2,
  });
}

function usePotion(world) {
  const p = world.player;
  if (p.potions <= 0 || p.hp >= p.maxHp) return;
  p.potions -= 1;
  p.hp = Math.min(p.maxHp, p.hp + PLAYER.potionHeal);
  addText(world, p.x, p.y - 26, `+${PLAYER.potionHeal} HP`, COLORS.potion, 16);
  burst(world, p.x, p.y, COLORS.potion, 14, 120, 0.6, 3);
  addRing(world, p.x, p.y, 8, 60, COLORS.potion, 0.4);
  sfx.potion(world.audioRef);
}

function updateEnemy(world, e, dt, audio) {
  const p = world.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  e.flash = Math.max(0, e.flash - dt);
  e.attackCooldown = Math.max(0, e.attackCooldown - dt);

  if (e.type === 'boss') {
    updateBoss(world, e, dt, nx, ny, dist);
    return;
  }

  if (e.type === 'slime' || e.type === 'elite') {
    // Hop toward the player when near; drift when far.
    const hop = e.type === 'elite' ? 1 : 0.55 + 0.45 * Math.sin(world.time * 6 + e.bobPhase);
    if (dist < 360) {
      e.x += nx * e.speed * hop * dt;
      e.y += ny * e.speed * hop * dt;
    } else {
      e.x += Math.cos(e.bobPhase + world.time * 0.5) * 12 * dt;
      e.y += Math.sin(e.bobPhase + world.time * 0.5) * 12 * dt;
    }
  } else if (e.type === 'bat') {
    if (dist < 420) {
      const wob = Math.sin(world.time * 9 + e.bobPhase) * 0.7;
      e.x += (nx - ny * wob) * e.speed * dt;
      e.y += (ny + nx * wob) * e.speed * dt;
    }
  } else if (e.type === 'skeleton') {
    if (e.state === 'windup') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        e.state = 'chase';
        if (dist < 62) damagePlayer(world, e.damage, e.x, e.y);
        e.attackCooldown = 1.2;
      }
    } else if (dist < 52 && e.attackCooldown <= 0) {
      e.state = 'windup';
      e.stateTimer = 0.4;
    } else if (dist < 420) {
      e.x += nx * e.speed * dt;
      e.y += ny * e.speed * dt;
    }
  } else if (e.type === 'mage') {
    // Keep a casting distance: back off when close, close in when far.
    if (dist < 200) {
      e.x -= nx * e.speed * dt;
      e.y -= ny * e.speed * dt;
    } else if (dist > 330) {
      e.x += nx * e.speed * dt;
      e.y += ny * e.speed * dt;
    }
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && dist < 460 && hasLineOfSight(world.dungeon, e.x, e.y, p.x, p.y)) {
      e.shootTimer = 2.2;
      e.state = 'cast';
      e.stateTimer = 0.5;
    }
    if (e.state === 'cast') {
      e.stateTimer -= dt;
      if (e.stateTimer <= 0) {
        e.state = 'chase';
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        fireBolt(world, false, e.x, e.y, ang, 200, e.damage, 6, COLORS.enemyBolt);
        sfx.bolt(audio);
      }
    }
  }
  collideCircle(world.dungeon, e, e.radius);
  // Touch damage.
  if (dist < e.radius + p.radius + 2) damagePlayer(world, e.damage, e.x, e.y);
}

function updateBoss(world, boss, dt, nx, ny, dist) {
  const p = world.player;
  boss.flash = Math.max(0, boss.flash - dt);
  if (boss.state === 'dormant') {
    if (dist < 380) {
      boss.state = 'chase';
      world.bossActive = true;
      world.objective = 'Slay THE WARDEN';
      sfx.boss(world.audioRef);
      addText(world, boss.x, boss.y - 60, 'THE WARDEN AWAKENS!', COLORS.bossCore, 22);
      addRing(world, boss.x, boss.y, 10, 260, COLORS.bossCore, 0.7);
    }
    return;
  }
  if (!world.bossSummoned && boss.hp < boss.maxHp * BOSS.summonAt) {
    world.bossSummoned = true;
    sfx.roar(world.audioRef);
    addText(world, boss.x, boss.y - 60, 'THE WARDEN CALLS ITS MINIONS!', COLORS.bossCore, 18);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2 + world.rng();
      spawnEnemy(world, 'slime', boss.x + Math.cos(a) * 70, boss.y + Math.sin(a) * 70);
    }
    addRing(world, boss.x, boss.y, 10, 220, COLORS.slime, 0.6);
  }
  if (boss.state === 'telegraph') {
    boss.stateTimer -= dt;
    boss.chargeDirX = nx;
    boss.chargeDirY = ny;
    if (boss.stateTimer <= 0) {
      boss.state = 'charge';
      boss.stateTimer = BOSS.chargeTime;
      sfx.roar(world.audioRef);
    }
    return;
  }
  if (boss.state === 'charge') {
    const ox = boss.x;
    const oy = boss.y;
    boss.x += boss.chargeDirX * BOSS.chargeSpeed * dt;
    boss.y += boss.chargeDirY * BOSS.chargeSpeed * dt;
    collideCircle(world.dungeon, boss, boss.radius);
    if (Math.hypot(boss.x - ox, boss.y - oy) < 2) {
      boss.state = 'chase';
      boss.stateTimer = 0;
      world.shake = Math.min(1, world.shake + 0.4);
    }
    boss.stateTimer -= dt;
    if (boss.stateTimer <= 0) boss.state = 'chase';
    if (dist < boss.radius + p.radius + 4) damagePlayer(world, boss.damage, boss.x, boss.y);
    return;
  }
  if (boss.state === 'burst') {
    boss.stateTimer -= dt;
    if (boss.stateTimer <= 0) {
      boss.state = 'chase';
      for (let i = 0; i < BOSS.burstCount; i += 1) {
        const a = (i / BOSS.burstCount) * Math.PI * 2 + world.rng() * 0.3;
        fireBolt(world, false, boss.x, boss.y, a, BOSS.burstSpeed, 10, 7, COLORS.enemyBolt);
      }
      sfx.bolt(world.audioRef);
      addRing(world, boss.x, boss.y, 12, 200, COLORS.enemyBolt, 0.5);
    }
    return;
  }
  // Chase: walk at the player, pick a charge or a burst on cooldown.
  boss.x += nx * boss.speed * dt;
  boss.y += ny * boss.speed * dt;
  collideCircle(world.dungeon, boss, boss.radius);
  if (dist < boss.radius + p.radius + 2) damagePlayer(world, boss.damage, boss.x, boss.y);
  boss.burstTimer -= dt;
  boss.attackCooldown -= dt;
  if (boss.burstTimer <= 0) {
    boss.burstTimer = BOSS.burstEvery;
    boss.state = 'burst';
    boss.stateTimer = 0.5;
    return;
  }
  if (dist < 300 && boss.attackCooldown <= 0) {
    boss.attackCooldown = 4.0;
    boss.state = 'telegraph';
    boss.stateTimer = BOSS.chargeTelegraph;
  }
}

function updateBullets(world, dt) {
  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const b = world.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead && isWallAtPixel(world.dungeon, b.x, b.y)) {
      burst(world, b.x, b.y, b.color, 3, 80, 0.25, 2);
      dead = true;
    }
    if (!dead && b.friendly) {
      for (const e of world.enemies) {
        if (e.dead) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy < (e.radius + b.radius) * (e.radius + b.radius)) {
          e.hp -= b.damage;
          e.flash = 0.12;
          addText(world, e.x, e.y - e.radius - 4, `${b.damage}`, '#ffffff', 13);
          burst(world, b.x, b.y, b.color, 4, 110, 0.3, 2);
          sfx.hit(world.audioRef);
          if (e.hp <= 0) killEnemy(world, e, true);
          dead = true;
          break;
        }
      }
    }
    if (!dead && !b.friendly) {
      const p = world.player;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx * dx + dy * dy < (p.radius + b.radius) * (p.radius + b.radius)) {
        damagePlayer(world, b.damage, b.x, b.y);
        dead = true;
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }
}

function updatePickups(world, dt) {
  const p = world.player;
  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    const k = world.pickups[i];
    k.life += dt;
    // Coins scatter, then drift toward the player when close.
    const dx = p.x - k.x;
    const dy = p.y - k.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (k.kind === 'coin') {
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.vx *= 0.88;
      k.vy *= 0.88;
      if (dist < PLAYER.magnet) {
        k.x += (dx / dist) * PICKUPS.coinMagnet * dt;
        k.y += (dy / dist) * PICKUPS.coinMagnet * dt;
      }
    }
    if (dist < p.radius + 16) {
      if (k.kind === 'coin') {
        world.gold += k.value;
        world.score += k.value;
        sfx.coin(world.audioRef);
        burst(world, k.x, k.y, COLORS.gold, 3, 80, 0.3, 2);
      } else if (k.kind === 'heart') {
        p.hp = Math.min(p.maxHp, p.hp + k.value);
        addText(world, p.x, p.y - 26, `+${k.value} HP`, '#4ade80', 15);
        sfx.potion(world.audioRef);
      } else if (k.kind === 'key') {
        world.hasKey = true;
        world.objective = 'Key found — reach the portal!';
        addText(world, p.x, p.y - 30, 'KEY ACQUIRED', COLORS.key, 18);
        addRing(world, p.x, p.y, 8, 90, COLORS.key, 0.5);
        sfx.key(world.audioRef);
      } else if (k.kind === 'potion') {
        p.potions = Math.min(PLAYER.potionMax, p.potions + 1);
        addText(world, p.x, p.y - 26, '+1 POTION', COLORS.potion, 15);
        sfx.potion(world.audioRef);
      }
      world.pickups.splice(i, 1);
    }
  }
}

export function step(world, dt, input, audio) {
  world.audioRef = audio;
  if (world.screen !== SCREEN_PLAY) return;
  const p = world.player;
  const d = world.dungeon;
  world.time += dt;
  world.timePlayed += dt;
  world.floorCard = Math.max(0, world.floorCard - dt);
  world.streakTimer = Math.max(0, world.streakTimer - dt);
  if (world.streakTimer <= 0) world.streak = 0;
  world.shake = Math.max(0, world.shake - dt * 1.6);
  p.invuln = Math.max(0, p.invuln - dt);
  p.slashTimer = Math.max(0, p.slashTimer - dt);
  p.boltTimer = Math.max(0, p.boltTimer - dt);
  p.slashAnim = Math.max(0, p.slashAnim - dt);
  p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
  p.bob += dt;

  // Dodge roll (Space): a fast dash with brief invulnerability.
  if (input.pressedKeys.has('Space') && p.dodgeCooldown <= 0 && p.dodgeTimer <= 0) {
    const mv = moveVector(input);
    const ang = mv ? Math.atan2(mv.y, mv.x) : p.angle;
    p.dodgeDirX = Math.cos(ang);
    p.dodgeDirY = Math.sin(ang);
    p.dodgeTimer = PLAYER.dodgeTime;
    p.dodgeCooldown = PLAYER.dodgeCooldown;
    p.invuln = Math.max(p.invuln, 0.3);
    sfx.dodge(audio);
    burst(world, p.x, p.y, COLORS.player, 6, 140, 0.35, 2);
    input.pressedKeys.delete('Space');
  }
  if (input.pressedKeys.has('KeyQ')) {
    usePotion(world);
    input.pressedKeys.delete('KeyQ');
  }

  // Move.
  const mv = moveVector(input);
  if (p.dodgeTimer > 0) {
    p.dodgeTimer -= dt;
    p.x += p.dodgeDirX * PLAYER.dodgeSpeed * dt;
    p.y += p.dodgeDirY * PLAYER.dodgeSpeed * dt;
  } else if (mv) {
    p.x += mv.x * p.speed * dt;
    p.y += mv.y * p.speed * dt;
  }
  p.x = Math.max(p.radius, Math.min(VIEW.width - p.radius, p.x));
  p.y = Math.max(p.radius, Math.min(VIEW.height - p.radius, p.y));
  collideCircle(d, p, p.radius);

  // Aim + attack (hold click: sword slash + magic bolt).
  p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  if (input.fire) {
    if (p.slashTimer <= 0) playerSlash(world);
    if (p.boltTimer <= 0) {
      p.boltTimer = PLAYER.boltCooldown;
      fireBolt(world, true, p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, p.angle, PLAYER.boltSpeed, PLAYER.boltDamage, PLAYER.boltRadius, COLORS.bolt);
      sfx.bolt(audio);
    }
  }

  // Traps under the player's feet.
  if (isSpikeAtPixel(d, p.x, p.y)) {
    p.spikeTick -= dt;
    if (p.spikeTick <= 0) {
      p.spikeTick = TRAPS.spikeTick;
      damagePlayer(world, TRAPS.spikeDamage, p.x, p.y);
    }
  } else {
    p.spikeTick = 0;
  }
  if (isLavaAtPixel(d, p.x, p.y)) {
    p.lavaTick -= dt;
    if (p.lavaTick <= 0) {
      p.lavaTick = TRAPS.lavaTick;
      damagePlayer(world, TRAPS.lavaDamage, p.x, p.y);
      burst(world, p.x, p.y, COLORS.lava, 4, 90, 0.4, 3);
    }
  } else {
    p.lavaTick = 0;
  }

  // Chests open on touch.
  for (const c of d.chests) {
    if (c.opened) continue;
    if (Math.hypot(c.x - p.x, c.y - p.y) < 38) {
      c.opened = true;
      world.gold += c.gold;
      world.score += c.gold;
      addText(world, c.x, c.y - 24, `+${c.gold} GOLD`, COLORS.gold, 16);
      burst(world, c.x, c.y, COLORS.gold, 18, 180, 0.7, 3);
      addRing(world, c.x, c.y, 6, 70, COLORS.gold, 0.45);
      if (c.potion) dropPickup(world, c.x, c.y - 10, 'potion', 0);
      sfx.chest(audio);
    }
  }

  // Exit portal (floors 1-2): needs the key.
  if (world.floor < TOTAL_FLOORS) {
    const ex = d.exit;
    if (Math.hypot(ex.x - p.x, ex.y - p.y) < 38) {
      if (world.hasKey) {
        sfx.door(audio);
        addRing(world, ex.x, ex.y, 10, 160, COLORS.doorGlow, 0.6);
        descend(world);
        return;
      }
      if (!world.exitHint || world.exitHint <= 0) {
        world.exitHint = 2.0;
        addText(world, p.x, p.y - 30, 'LOCKED — FIND THE KEY', COLORS.dim, 15);
      }
    }
    world.exitHint = Math.max(0, (world.exitHint || 0) - dt);
  }

  // Enemies.
  for (const e of world.enemies) {
    if (!e.dead) updateEnemy(world, e, dt, audio);
  }
  // Separation so enemies do not stack.
  for (let i = 0; i < world.enemies.length; i += 1) {
    const a = world.enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < world.enemies.length; j += 1) {
      const b = world.enemies[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < min * min) {
        const dd = Math.sqrt(d2);
        const push = (min - dd) / dd / 2;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  }
  for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
    if (world.enemies[i].dead) world.enemies.splice(i, 1);
  }

  updateBullets(world, dt);
  updatePickups(world, dt);

  // Ambient embers from torches and sparkles from crystals (seeded).
  if (world.rng() < 0.25 && d.torches.length > 0) {
    const t = d.torches[Math.floor(world.rng() * d.torches.length)];
    world.particles.push({
      x: t.x + range(world.rng, -6, 6),
      y: t.y + 4,
      vx: range(world.rng, -6, 6),
      vy: range(world.rng, -34, -16),
      life: range(world.rng, 0.5, 1.0),
      maxLife: 1.0,
      size: range(world.rng, 1.5, 3),
      color: COLORS.torch,
    });
  }
  if (world.rng() < 0.12 && d.crystals.length > 0) {
    const c = d.crystals[Math.floor(world.rng() * d.crystals.length)];
    world.particles.push({
      x: c.x + range(world.rng, -14, 14),
      y: c.y + range(world.rng, -14, 14),
      vx: 0,
      vy: range(world.rng, -18, -6),
      life: range(world.rng, 0.4, 0.9),
      maxLife: 0.9,
      size: range(world.rng, 1.5, 2.5),
      color: c.hue === 'cyan' ? COLORS.crystalCyan : COLORS.crystalMag,
    });
  }

  // Particles, texts, rings age.
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const pt = world.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy -= 12 * dt;
    pt.life -= dt;
    if (pt.life <= 0) world.particles.splice(i, 1);
  }
  for (let i = world.texts.length - 1; i >= 0; i -= 1) {
    const t = world.texts[i];
    t.y -= 34 * dt;
    t.life -= dt;
    if (t.life <= 0) world.texts.splice(i, 1);
  }
  for (let i = world.rings.length - 1; i >= 0; i -= 1) {
    const r = world.rings[i];
    r.life -= dt;
    if (r.life <= 0) world.rings.splice(i, 1);
  }
}
