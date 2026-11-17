// DUNGEON DELVE — procedural floor generation. One floor is a single screen:
// a grid of stone tiles with rooms joined by corridors, torches, crystals,
// lava, spikes, chests, an exit portal and the rooms' spawn points.
// Everything comes from the seeded RNG, so the same seed builds the same floor.
import { TILE, COLS, ROWS, TRAPS } from './config.js';
import { intRange, range, shuffle, pick } from './random.js';

export const T_FLOOR = 0;
export const T_WALL = 1;

function idx(tx, ty) {
  return ty * COLS + tx;
}

function carveRoom(grid, x, y, w, h) {
  for (let ty = y; ty < y + h; ty += 1) {
    for (let tx = x; tx < x + w; tx += 1) {
      grid[idx(tx, ty)] = T_FLOOR;
    }
  }
}

function carveCorridor(grid, x0, y0, x1, y1, rng) {
  // L-shaped, two tiles wide so a fight can happen in it.
  let cx = x0;
  let cy = y0;
  const horizFirst = rng() < 0.5;
  const carveH = (x, y) => {
    for (let dy = 0; dy < 2; dy += 1) {
      if (y + dy > 0 && y + dy < ROWS - 1 && x > 0 && x < COLS - 1) grid[idx(x, y + dy)] = T_FLOOR;
    }
  };
  const carveV = (x, y) => {
    for (let dx = 0; dx < 2; dx += 1) {
      if (x + dx > 0 && x + dx < COLS - 1 && y > 0 && y < ROWS - 1) grid[idx(x + dx, y)] = T_FLOOR;
    }
  };
  if (horizFirst) {
    while (cx !== x1) {
      carveH(cx, cy);
      cx += cx < x1 ? 1 : -1;
    }
    while (cy !== y1) {
      carveV(cx, cy);
      cy += cy < y1 ? 1 : -1;
    }
  } else {
    while (cy !== y1) {
      carveV(cx, cy);
      cy += cy < y1 ? 1 : -1;
    }
    while (cx !== x1) {
      carveH(cx, cy);
      cx += cx < x1 ? 1 : -1;
    }
  }
}

function roomsOverlap(a, b) {
  return a.x < b.x + b.w + 1 && a.x + a.w + 1 > b.x && a.y < b.y + b.h + 1 && a.y + a.h + 1 > b.y;
}

function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

function randomFloorTileInRoom(rng, room, avoid) {
  for (let tries = 0; tries < 40; tries += 1) {
    const tx = intRange(rng, room.x + 1, room.x + room.w - 2);
    const ty = intRange(rng, room.y + 1, room.y + room.h - 2);
    if (avoid && avoid(tx, ty)) continue;
    return { tx, ty };
  }
  return { tx: room.x + 1, ty: room.y + 1 };
}

/**
 * Build one floor. Returns the dungeon: grid, rooms, torches, crystals,
 * lava/spike tile sets, chests, exit portal, spawn point, enemy spawn points.
 */
export function generateDungeon(rng, floorNum) {
  const grid = new Array(COLS * ROWS).fill(T_WALL);
  const rooms = [];
  const wantRooms = 7;
  for (let tries = 0; tries < 120 && rooms.length < wantRooms; tries += 1) {
    const w = intRange(rng, 5, 9);
    const h = intRange(rng, 4, 6);
    const x = intRange(rng, 1, COLS - w - 1);
    const y = intRange(rng, 1, ROWS - h - 1);
    const room = { x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) };
    if (rooms.some((r) => roomsOverlap(r, room))) continue;
    rooms.push(room);
    carveRoom(grid, x, y, w, h);
  }
  // Connect room centres in order, so every room is reachable.
  for (let i = 1; i < rooms.length; i += 1) {
    carveCorridor(grid, rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy, rng);
  }

  // Per-tile shade for the floor's look (deterministic).
  const shade = new Array(COLS * ROWS).fill(0);
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      if (grid[idx(tx, ty)] === T_FLOOR) shade[idx(tx, ty)] = rng();
    }
  }

  const spawnRoom = rooms[0];
  const spawn = tileCenter(spawnRoom.cx, spawnRoom.cy);

  // Exit portal: the room farthest from the spawn room.
  let exitRoom = rooms[rooms.length - 1];
  let bestD = -1;
  for (const r of rooms) {
    const d = (r.cx - spawnRoom.cx) * (r.cx - spawnRoom.cx) + (r.cy - spawnRoom.cy) * (r.cy - spawnRoom.cy);
    if (d > bestD) {
      bestD = d;
      exitRoom = r;
    }
  }
  const exitTile = randomFloorTileInRoom(rng, exitRoom, (tx, ty) => tx === spawnRoom.cx && ty === spawnRoom.cy);
  const exit = { tx: exitTile.tx, ty: exitTile.ty, x: exitTile.tx * TILE + TILE / 2, y: exitTile.ty * TILE + TILE / 2 };

  // Elite room: a middle room (not spawn, not exit).
  const middle = rooms.filter((r) => r !== spawnRoom && r !== exitRoom);
  const eliteRoom = middle.length > 0 ? pick(rng, middle) : rooms[rooms.length - 1];
  const eliteTile = randomFloorTileInRoom(rng, eliteRoom, null);
  const eliteSpawn = { x: eliteTile.tx * TILE + TILE / 2, y: eliteTile.ty * TILE + TILE / 2 };

  // Torches: wall tiles that face a floor tile, two per room.
  const torches = [];
  for (const room of rooms) {
    let placed = 0;
    for (let tries = 0; tries < 24 && placed < TRAPS.torchesPerRoom; tries += 1) {
      const tx = intRange(rng, room.x, room.x + room.w - 1);
      const ty = intRange(rng, room.y, room.y + room.h - 1);
      if (grid[idx(tx, ty)] !== T_WALL) continue;
      // Needs a floor neighbour to hang over.
      const facesFloor =
        (ty + 1 < ROWS && grid[idx(tx, ty + 1)] === T_FLOOR) ||
        (ty - 1 >= 0 && grid[idx(tx, ty - 1)] === T_FLOOR) ||
        (tx + 1 < COLS && grid[idx(tx + 1, ty)] === T_FLOOR) ||
        (tx - 1 >= 0 && grid[idx(tx - 1, ty)] === T_FLOOR);
      if (!facesFloor) continue;
      if (torches.some((t) => t.tx === tx && t.ty === ty)) continue;
      torches.push({ tx, ty, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, phase: rng() * Math.PI * 2 });
      placed += 1;
    }
  }

  // Crystals: glowing floor decor in room corners.
  const crystals = [];
  const nCrystals = intRange(rng, 2, 4);
  for (let i = 0; i < nCrystals; i += 1) {
    const room = pick(rng, rooms);
    const t = randomFloorTileInRoom(rng, room, (tx, ty) =>
      (tx === spawnRoom.cx && ty === spawnRoom.cy) || (tx === exit.tx && ty === exit.ty));
    crystals.push({
      x: t.tx * TILE + TILE / 2,
      y: t.ty * TILE + TILE / 2,
      hue: rng() < 0.5 ? 'cyan' : 'magenta',
      phase: rng() * Math.PI * 2,
      size: range(rng, 9, 15),
    });
  }

  // Lava patches: 2x2 blocks of lava floor (floors 2-3).
  const lava = new Set();
  const lavaCount = TRAPS.lavaPatches[floorNum - 1] || 0;
  for (let i = 0; i < lavaCount; i += 1) {
    const room = pick(rng, rooms.filter((r) => r !== spawnRoom));
    if (!room) continue;
    const tx = intRange(rng, room.x, Math.max(room.x, room.x + room.w - 3));
    const ty = intRange(rng, room.y, Math.max(room.y, room.y + room.h - 3));
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        if (grid[idx(tx + dx, ty + dy)] === T_FLOOR) lava.add(idx(tx + dx, ty + dy));
      }
    }
  }

  // Spike traps in rooms (never in the spawn room, never on the exit).
  const spikes = new Set();
  const spikeCount = TRAPS.spikesPerFloor[floorNum - 1] || 0;
  for (let i = 0; i < spikeCount; i += 1) {
    const room = pick(rng, rooms.filter((r) => r !== spawnRoom));
    if (!room) continue;
    const t = randomFloorTileInRoom(rng, room, (tx, ty) => (tx === exit.tx && ty === exit.ty) || lava.has(idx(tx, ty)));
    spikes.add(idx(t.tx, t.ty));
  }

  // Chests in rooms.
  const chests = [];
  const chestCount = TRAPS.chestsPerFloor[floorNum - 1] || 0;
  for (let i = 0; i < chestCount; i += 1) {
    const room = pick(rng, rooms);
    const t = randomFloorTileInRoom(rng, room, (tx, ty) =>
      (tx === spawnRoom.cx && ty === spawnRoom.cy) ||
      (tx === exit.tx && ty === exit.ty) ||
      lava.has(idx(tx, ty)) || spikes.has(idx(tx, ty)));
    chests.push({
      x: t.tx * TILE + TILE / 2,
      y: t.ty * TILE + TILE / 2,
      opened: false,
      gold: intRange(rng, 20, 45),
      potion: rng() < 0.5,
    });
  }

  // Enemy spawn points: floor tiles in rooms other than the spawn room.
  const enemyRooms = shuffle(rng, rooms.filter((r) => r !== spawnRoom));
  const spawnPoints = [];
  for (const room of enemyRooms) {
    const n = intRange(rng, 2, 4);
    for (let i = 0; i < n; i += 1) {
      const t = randomFloorTileInRoom(rng, room, (tx, ty) =>
        (tx === exit.tx && ty === exit.ty) || lava.has(idx(tx, ty)) || spikes.has(idx(tx, ty)));
      spawnPoints.push({ x: t.tx * TILE + TILE / 2, y: t.ty * TILE + TILE / 2 });
    }
  }

  return {
    grid,
    shade,
    rooms,
    torches,
    crystals,
    lava,
    spikes,
    chests,
    exit,
    spawn,
    eliteSpawn,
    spawnPoints,
  };
}

export function tileAt(dungeon, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return T_WALL;
  return dungeon.grid[ty * COLS + tx];
}

export function isWallAtPixel(dungeon, x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  return tileAt(dungeon, tx, ty) === T_WALL;
}

export function isLavaAtPixel(dungeon, x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
  return dungeon.lava.has(ty * COLS + tx);
}

export function isSpikeAtPixel(dungeon, x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
  return dungeon.spikes.has(ty * COLS + tx);
}

// Circle-vs-tile collision: push a circle out of wall tiles. Mutates pos.
export function collideCircle(dungeon, pos, radius) {
  const minTx = Math.max(0, Math.floor((pos.x - radius) / TILE));
  const maxTx = Math.min(COLS - 1, Math.floor((pos.x + radius) / TILE));
  const minTy = Math.max(0, Math.floor((pos.y - radius) / TILE));
  const maxTy = Math.min(ROWS - 1, Math.floor((pos.y + radius) / TILE));
  for (let ty = minTy; ty <= maxTy; ty += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      if (dungeon.grid[ty * COLS + tx] !== T_WALL) continue;
      const nearestX = Math.max(tx * TILE, Math.min(pos.x, tx * TILE + TILE));
      const nearestY = Math.max(ty * TILE, Math.min(pos.y, ty * TILE + TILE));
      const dx = pos.x - nearestX;
      const dy = pos.y - nearestY;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;
      if (d2 === 0) {
        pos.y -= radius;
        continue;
      }
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      pos.x += dx * push;
      pos.y += dy * push;
    }
  }
}

// Line of sight across floor tiles: sample the segment every 12px.
export function hasLineOfSight(dungeon, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.floor(dist / 12));
  for (let i = 1; i < steps; i += 1) {
    if (isWallAtPixel(dungeon, x0 + (dx * i) / steps, y0 + (dy * i) / steps)) return false;
  }
  return true;
}

// Breadth-first path over floor tiles, from pixel (sx, sy) to pixel (tx, ty).
// Returns an array of pixel waypoints (tile centres) or null when unreachable.
export function findPath(dungeon, sx, sy, tx, ty) {
  const startX = Math.max(0, Math.min(COLS - 1, Math.floor(sx / TILE)));
  const startY = Math.max(0, Math.min(ROWS - 1, Math.floor(sy / TILE)));
  const goalX = Math.max(0, Math.min(COLS - 1, Math.floor(tx / TILE)));
  const goalY = Math.max(0, Math.min(ROWS - 1, Math.floor(ty / TILE)));
  if (dungeon.grid[goalY * COLS + goalX] === T_WALL) return null;
  if (dungeon.grid[startY * COLS + startX] === T_WALL) return null;
  const parent = new Int32Array(COLS * ROWS).fill(-1);
  const queue = [startY * COLS + startX];
  parent[startY * COLS + startX] = startY * COLS + startX;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    const cx = cur % COLS;
    const cy = Math.floor(cur / COLS);
    if (cx === goalX && cy === goalY) break;
    const neighbours = [cur - COLS, cur + COLS, cur - 1, cur + 1];
    for (const n of neighbours) {
      if (n < 0 || n >= COLS * ROWS) continue;
      const nx = n % COLS;
      const ny = Math.floor(n / COLS);
      if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
      if (parent[n] !== -1) continue;
      if (dungeon.grid[n] === T_WALL) continue;
      parent[n] = cur;
      queue.push(n);
    }
  }
  const goalIdx = goalY * COLS + goalX;
  if (parent[goalIdx] === -1) return null;
  const tiles = [];
  let cur = goalIdx;
  while (cur !== startY * COLS + startX) {
    tiles.push(cur);
    cur = parent[cur];
  }
  tiles.reverse();
  return tiles.map((t) => ({ x: (t % COLS) * TILE + TILE / 2, y: Math.floor(t / COLS) * TILE + TILE / 2 }));
}
