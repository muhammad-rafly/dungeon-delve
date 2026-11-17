// DUNGEON DELVE — deterministic screenshot scenes behind ?shot=start|play|boss|end.
// Each scene plays the real rules forward from a fresh world, steered by an autopilot
// (breadth-first paths through the dungeon, kite, aim at the nearest threat,
// dodge the boss's charge, drink when hurt, fetch the key, take the portal),
// so the frame is what a real game looks like and the same seed always gives the same frame.
import { STEP, TOTAL_FLOORS, TILE } from './config.js';
import { makeInput } from './input.js';
import { findPath, hasLineOfSight } from './dungeon.js';
import {
  makeWorld,
  reset,
  startGame,
  step,
  SCREEN_TITLE,
  SCREEN_PLAY,
  SCREEN_OVER,
  SCREEN_WIN,
} from './world.js';

function nearestEnemy(world, maxDist) {
  const p = world.player;
  let best = null;
  let bestD = maxDist * maxDist;
  for (const e of world.enemies) {
    const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function autopilotInput(world, input, state) {
  const p = world.player;
  const d = world.dungeon;
  // Potion when hurt (earlier in the boss fight, where hits land harder).
  const potionAt = world.bossActive ? 60 : 45;
  if (p.hp < potionAt && p.potions > 0) input.pressedKeys.add('KeyQ');
  else input.pressedKeys.delete('KeyQ');

  // Pick a goal: boss > nearest threat > key on the ground > elite (key) > portal > chest > explore.
  let goalX = null;
  let goalY = null;
  let attackTarget = null;
  let direct = false; // true: steer straight at the goal (open boss room)
  const boss = world.boss;
  if (world.bossActive && boss && boss.hp > 0) {
    // Clear the boss's summoned minions and nearby mobs first — fighting the
    // boss while skeletons and mages chew on you from the sides is how runs end.
    let minion = null;
    let minionD = 350 * 350;
    for (const e of world.enemies) {
      if (e.type === 'boss') continue;
      const dd = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
      if (dd < minionD) {
        minionD = dd;
        minion = e;
      }
    }
    if (minion) {
      attackTarget = minion;
      goalX = minion.x;
      goalY = minion.y;
    } else {
      attackTarget = boss;
      const bd = Math.hypot(boss.x - p.x, boss.y - p.y);
      const los = hasLineOfSight(d, p.x, p.y, boss.x, boss.y);
      if (los && bd < 340) {
        // Close-quarters boss fight: hit and run, like any enemy — close to
        // 70px, back off to 150px — dodging only the telegraphed charge and
        // burst. Standing in slash range trades blows the boss wins.
        direct = true;
        if (boss.state === 'telegraph' && bd < 320) {
          // The telegraph re-aims at you every step, so sidestepping now is
          // useless — the boss just follows. Instead back away to make the
          // charge travel farther, and SAVE the dodge for the charge itself.
          goalX = p.x - (boss.x - p.x);
          goalY = p.y - (boss.y - p.y);
        } else if (boss.state === 'charge') {
          // The charge direction is locked now — sidestep it, perpendicular.
          input.pressedKeys.add('Space');
          const ang = Math.atan2(p.y - boss.y, p.x - boss.x) + Math.PI / 2;
          goalX = p.x + Math.cos(ang) * 160;
          goalY = p.y + Math.sin(ang) * 160;
        } else if (boss.state === 'burst') {
          // Radial burst coming: roll sideways out of the projectile ring.
          input.pressedKeys.add('Space');
          const ang = Math.atan2(p.y - boss.y, p.x - boss.x) + Math.PI / 2;
          goalX = p.x + Math.cos(ang) * 120;
          goalY = p.y + Math.sin(ang) * 120;
        } else {
          // Hit and run with a WIDE band against the boss: close to 90px,
          // back off to 260px. The boss's charge closes 150px instantly, so
          // a tight band leaves you in contact range every cycle.
          if (!state.fleeing && bd < 90) state.fleeing = true;
          if (state.fleeing && bd > 260) state.fleeing = false;
          if (state.fleeing) {
            goalX = p.x - (boss.x - p.x);
            goalY = p.y - (boss.y - p.y);
          } else {
            goalX = boss.x;
            goalY = boss.y;
          }
        }
      } else {
        // The boss is in another room (or far): walk the corridors to it.
        direct = false;
        goalX = boss.x;
        goalY = boss.y;
      }
    }
  } else {
    const near = nearestEnemy(world, 340);
    if (near) {
      attackTarget = near;
      const nd = Math.hypot(near.x - p.x, near.y - p.y);
      // Hysteresis: start fleeing under 70px, stop past 150px. A single
      // threshold makes the goal flip every step and the player ping-pongs
      // in place instead of fighting.
      if (!state.fleeing && nd < 70) state.fleeing = true;
      if (state.fleeing && nd > 150) state.fleeing = false;
      if (state.fleeing) {
        goalX = p.x - (near.x - p.x);
        goalY = p.y - (near.y - p.y);
      } else {
        goalX = near.x;
        goalY = near.y;
      }
    } else if (!world.hasKey && world.floor < TOTAL_FLOORS) {
      const elite = world.enemies.find((e) => e.type === 'elite');
      if (elite) {
        attackTarget = elite;
        goalX = elite.x;
        goalY = elite.y;
      }
    }
    if (goalX === null && !world.hasKey && world.floor < TOTAL_FLOORS) {
      // The elite is dead and its key is on the floor: go and pick it up.
      const key = world.pickups.find((k) => k.kind === 'key');
      if (key) {
        goalX = key.x;
        goalY = key.y;
      }
    }
    if (goalX === null && world.hasKey && world.floor < TOTAL_FLOORS) {
      goalX = d.exit.x;
      goalY = d.exit.y;
    }
    if (goalX === null) {
      const chest = d.chests.find((c) => !c.opened);
      if (chest) {
        goalX = chest.x;
        goalY = chest.y;
      }
    }
    if (goalX === null) {
      const any = nearestEnemy(world, 10000);
      if (any) {
        attackTarget = any;
        goalX = any.x;
        goalY = any.y;
      } else {
        // Explore: the next room centre.
        const room = d.rooms[Math.min(state.roomIdx, d.rooms.length - 1)];
        goalX = room.cx * TILE + TILE / 2;
        goalY = room.cy * TILE + TILE / 2;
        if (Math.hypot(goalX - p.x, goalY - p.y) < 50) state.roomIdx += 1;
      }
    }
  }

  // Steer: a breadth-first path through the dungeon, with line-of-sight
  // shortcuts, so the autopilot walks corridors instead of hugging walls.
  let mx;
  let my;
  if (direct) {
    mx = goalX - p.x;
    my = goalY - p.y;
  } else {
    const goalTileKey = `${Math.floor(goalX / TILE)},${Math.floor(goalY / TILE)}`;
    state.repath -= 1;
    if (!state.path || state.path.length === 0 || state.pathKey !== goalTileKey || state.repath <= 0) {
      state.path = findPath(d, p.x, p.y, goalX, goalY) || [];
      state.pathKey = goalTileKey;
      state.repath = 30;
    }
    // Drop reached waypoints. No line-of-sight shortcut: skipping ahead to a
    // far waypoint makes the 4-way steering push the player into a wall
    // instead of walking the corridor tile by tile.
    while (state.path.length > 0 && Math.hypot(state.path[0].x - p.x, state.path[0].y - p.y) < 24) {
      state.path.shift();
    }
    const wp = state.path.length > 0 ? state.path[0] : { x: goalX, y: goalY };
    mx = wp.x - p.x;
    my = wp.y - p.y;
  }
  const len = Math.hypot(mx, my) || 1;
  mx /= len;
  my /= len;
  // Keep off the arena edges.
  if (p.x < 70) mx += 1;
  if (p.x > 1210) mx -= 1;
  if (p.y < 70) my += 1;
  if (p.y > 650) my -= 1;
  const mLen = Math.hypot(mx, my) || 1;
  mx /= mLen;
  my /= mLen;
  input.left = mx < -0.3;
  input.right = mx > 0.3;
  input.up = my < -0.3;
  input.down = my > 0.3;

  // Aim at the attack target (or the goal) and fire when something is near.
  if (attackTarget) {
    input.mouseX = attackTarget.x;
    input.mouseY = attackTarget.y;
    input.fire = Math.hypot(attackTarget.x - p.x, attackTarget.y - p.y) < 460;
  } else {
    input.mouseX = goalX;
    input.mouseY = goalY;
    input.fire = false;
  }
  // Dodge when crowded and hurt.
  const close = world.enemies.filter((e) => Math.hypot(e.x - p.x, e.y - p.y) < 110).length;
  if (close >= 3 && p.hp < 60 && p.dodgeCooldown <= 0) input.pressedKeys.add('Space');
}

// Step the world with the autopilot until `done(world)` is true, or the step cap hits.
function runUntil(world, input, audio, done, maxSeconds) {
  const state = { roomIdx: 0, path: [], pathKey: '', repath: 0, fleeing: false };
  const maxSteps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < maxSteps; i += 1) {
    if (world.screen === SCREEN_OVER || world.screen === SCREEN_WIN) break;
    autopilotInput(world, input, state);
    step(world, STEP, input, audio);
    if (done(world)) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw.
 * start: title over a live floor-1 dungeon. play: a busy floor-2 fight.
 * boss: the Warden fight on floor 3. end: the win screen after the boss falls.
 */
export function stageShot(name, world, audio) {
  const input = makeInput();
  reset(world);
  if (name === 'start') {
    startGame(world);
    runUntil(world, input, audio, () => world.time > 4, 5);
    // A clean backdrop for the title: keep the dungeon and its creatures,
    // drop the floating texts and particles that would clutter the title.
    world.texts = [];
    world.particles = [];
    world.rings = [];
    world.screen = SCREEN_TITLE;
    return { screen: SCREEN_TITLE };
  }
  if (name === 'boss') {
    startGame(world);
    runUntil(
      world,
      input,
      audio,
      () => world.bossActive && world.boss && world.boss.hp < world.boss.maxHp * 0.85,
      900,
    );
    return { screen: world.screen };
  }
  if (name === 'end') {
    startGame(world);
    runUntil(world, input, audio, () => world.screen === SCREEN_WIN, 1200);
    return { screen: world.screen };
  }
  // play (default): a busy floor-2 frame. Wait out the floor card (2.2s after
  // descent) so the frame shows the fight, not the transition banner.
  startGame(world);
  runUntil(
    world,
    input,
    audio,
    () => world.floor >= 2 && world.enemies.length >= 6 && world.floorCard <= 0 && world.screen === SCREEN_PLAY,
    600,
  );
  return { screen: world.screen };
}

export function makeShotWorld(seed) {
  return makeWorld(seed);
}

export { TOTAL_FLOORS };
