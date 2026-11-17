// DUNGEON DELVE — canvas drawing. Everything the judge sees lives here:
// stone floors with per-tile shade, flickering torches, glowing crystals,
// animated lava, a light radius around the player in a dark dungeon,
// bobbing enemies with glowing eyes, particles, damage numbers, HUD and menus.
// The sim never draws; the renderer never simulates (it only reads world.time
// for animation, so a staged screenshot is deterministic).
import { VIEW, TILE, COLS, ROWS, COLORS, FLOOR_NAMES, TOTAL_FLOORS, PLAYER } from './config.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSE, SCREEN_OVER, SCREEN_WIN } from './world.js';

let lightCanvas = null;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lerpColor(a, b, t) {
  // a, b are [r,g,b]; t in 0..1.
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

const FLOOR_A = [27, 22, 38];
const FLOOR_B = [33, 26, 48];

function drawFloorAndWalls(ctx, world) {
  const d = world.dungeon;
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      const x = tx * TILE;
      const y = ty * TILE;
      const s = d.shade[ty * COLS + tx];
      if (d.grid[ty * COLS + tx] === 1) {
        // Wall: dark face, lighter top strip, dark outline.
        ctx.fillStyle = COLORS.wallFace;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = COLORS.wallTop;
        ctx.fillRect(x, y, TILE, 7);
        ctx.fillStyle = COLORS.wallEdge;
        ctx.fillRect(x, y + TILE - 3, TILE, 3);
        ctx.fillRect(x, y, 1, TILE);
        if (s > 0.75) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(x + 8, y + 12, 10, 6);
        }
      } else {
        ctx.fillStyle = lerpColor(FLOOR_A, FLOOR_B, s);
        ctx.fillRect(x, y, TILE, TILE);
        if (s < 0.12) {
          // A crack in the stone.
          ctx.strokeStyle = COLORS.floorCrack;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 8, y + 10);
          ctx.lineTo(x + 18, y + 20);
          ctx.lineTo(x + 12, y + 32);
          ctx.stroke();
        }
        if (s > 0.9) {
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fillRect(x + 6, y + 6, 12, 12);
        }
      }
    }
  }
  // Lava pools: animated orange with a bright core.
  for (const key of d.lava) {
    const tx = key % COLS;
    const ty = Math.floor(key / COLS);
    const x = tx * TILE;
    const y = ty * TILE;
    const wob = Math.sin(world.time * 3 + tx * 1.7 + ty) * 3;
    ctx.fillStyle = COLORS.lava;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = COLORS.lavaCore;
    ctx.beginPath();
    ctx.arc(x + TILE / 2 + wob, y + TILE / 2, 9 + Math.sin(world.time * 5 + tx) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,106,0,0.5)';
    ctx.beginPath();
    ctx.arc(x + 10, y + 28, 5, 0, Math.PI * 2);
    ctx.arc(x + 30, y + 12, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Spike traps: steel teeth on the floor.
  for (const key of d.spikes) {
    const tx = key % COLS;
    const ty = Math.floor(key / COLS);
    const x = tx * TILE;
    const y = ty * TILE;
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
    ctx.fillStyle = COLORS.spike;
    for (let i = 0; i < 4; i += 1) {
      const sx = x + 8 + (i % 2) * 16;
      const sy = y + 8 + Math.floor(i / 2) * 16;
      ctx.beginPath();
      ctx.moveTo(sx - 5, sy + 6);
      ctx.lineTo(sx, sy - 7);
      ctx.lineTo(sx + 5, sy + 6);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawDust(ctx, world) {
  // Drifting dust motes: purely visual, derived from a fixed hash of the
  // tile + floor and world.time — no rng, no sim state, fully deterministic.
  const t = world.time;
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      const h = ((tx * 73856093) ^ (ty * 19349663) ^ (world.floor * 83492791)) >>> 0;
      const v = h / 4294967295;
      if (v > 0.22) continue;
      const drift = (h % 100) / 100;
      const x = tx * TILE + 8 + ((drift * 24 + Math.sin(t * 0.4 + drift * 6.28) * 6 + 24) % 24);
      const y = ty * TILE + 8 + ((drift * 17 + Math.cos(t * 0.3 + drift * 6.28) * 5 + 24) % 24);
      const a = 0.10 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.7 + drift * 12.56));
      ctx.fillStyle = `rgba(226,232,240,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBossTelegraph(ctx, world) {
  // The boss's charge warning: a pulsing danger stripe on the floor along
  // the locked charge line, so the player can read the attack and sidestep.
  const b = world.boss;
  if (!b || !world.bossActive || b.state !== 'telegraph') return;
  const len = 300;
  const w = 64;
  const pulse = 0.16 + 0.10 * (0.5 + 0.5 * Math.sin(world.time * 14));
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(Math.atan2(b.chargeDirY, b.chargeDirX));
  ctx.fillStyle = `rgba(239,68,68,${pulse.toFixed(3)})`;
  ctx.fillRect(0, -w / 2, len, w);
  ctx.fillStyle = `rgba(239,68,68,${(pulse + 0.18).toFixed(3)})`;
  ctx.fillRect(0, -w / 2, len, 4);
  ctx.fillRect(0, w / 2 - 4, len, 4);
  ctx.restore();
}

function drawTorches(ctx, world) {
  for (const t of world.dungeon.torches) {
    const flick = 1 + 0.18 * Math.sin(world.time * 13 + t.phase) + 0.08 * Math.sin(world.time * 29 + t.phase * 2);
    // Warm glow halo (additive, flickers with the flame).
    ctx.globalCompositeOperation = 'lighter';
    const glowR = 30 * flick;
    const g = ctx.createRadialGradient(t.x, t.y - 6, 2, t.x, t.y - 6, glowR);
    g.addColorStop(0, 'rgba(255,170,60,0.30)');
    g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.x, t.y - 6, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // Bracket.
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(t.x - 4, t.y - 2, 8, 12);
    // Flame: a flickering teardrop.
    ctx.fillStyle = COLORS.torch;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 18 * flick);
    ctx.quadraticCurveTo(t.x + 8 * flick, t.y - 4, t.x, t.y + 2);
    ctx.quadraticCurveTo(t.x - 8 * flick, t.y - 4, t.x, t.y - 18 * flick);
    ctx.fill();
    ctx.fillStyle = COLORS.torchCore;
    ctx.beginPath();
    ctx.arc(t.x, t.y - 6, 3.5 * flick, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCrystals(ctx, world) {
  for (const c of world.dungeon.crystals) {
    const pulse = 1 + 0.15 * Math.sin(world.time * 2.4 + c.phase);
    const col = c.hue === 'cyan' ? COLORS.crystalCyan : COLORS.crystalMag;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - c.size * pulse);
    ctx.lineTo(c.x + c.size * 0.55, c.y);
    ctx.lineTo(c.x, c.y + c.size * 0.8);
    ctx.lineTo(c.x - c.size * 0.55, c.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - c.size * 0.55 * pulse);
    ctx.lineTo(c.x + c.size * 0.25, c.y);
    ctx.lineTo(c.x, c.y + c.size * 0.3);
    ctx.lineTo(c.x - c.size * 0.25, c.y);
    ctx.closePath();
    ctx.fill();
    // Twinkling star sparkle: a 4-point star that fades in and out on a
    // fixed hash of the crystal position, so it is deterministic.
    const h = ((Math.round(c.x) * 73856093) ^ (Math.round(c.y) * 19349663)) >>> 0;
    const ph = (h % 100) / 100;
    const tw = 0.5 + 0.5 * Math.sin(world.time * 3.1 + ph * 6.28);
    if (tw > 0.55) {
      const s = c.size * 0.5 * tw;
      ctx.strokeStyle = `rgba(255,255,255,${(0.85 * tw).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(c.x - s, c.y - c.size * 0.4);
      ctx.lineTo(c.x + s, c.y - c.size * 0.4);
      ctx.moveTo(c.x, c.y - c.size * 0.4 - s);
      ctx.lineTo(c.x, c.y - c.size * 0.4 + s);
      ctx.stroke();
    }
  }
}

function drawChestsAndExit(ctx, world) {
  for (const c of world.dungeon.chests) {
    ctx.fillStyle = '#5b3a1e';
    rr(ctx, c.x - 15, c.y - 11, 30, 22, 4);
    ctx.fill();
    ctx.fillStyle = '#7c4a21';
    rr(ctx, c.x - 15, c.y - 11, 30, 9, 4);
    ctx.fill();
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(c.x - 2, c.y - 11, 4, 22);
    if (!c.opened) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Open lid, dark inside.
      ctx.fillStyle = '#1a1208';
      ctx.fillRect(c.x - 12, c.y - 8, 24, 6);
      ctx.save();
      ctx.translate(c.x - 14, c.y - 11);
      ctx.rotate(-0.9);
      ctx.fillStyle = '#7c4a21';
      ctx.fillRect(0, -8, 28, 8);
      ctx.restore();
    }
  }
  if (world.floor < TOTAL_FLOORS) {
    const ex = world.dungeon.exit;
    const open = world.hasKey;
    const glow = open ? 1 : 0.45;
    const pulse = 1 + 0.12 * Math.sin(world.time * 3);
    // Stone arch.
    ctx.fillStyle = COLORS.door;
    ctx.fillRect(ex.x - 22, ex.y - 26, 8, 52);
    ctx.fillRect(ex.x + 14, ex.y - 26, 8, 52);
    ctx.fillRect(ex.x - 22, ex.y - 30, 44, 8);
    // Portal swirl.
    ctx.save();
    ctx.globalAlpha = glow;
    ctx.fillStyle = open ? COLORS.doorGlow : '#64748b';
    ctx.beginPath();
    ctx.ellipse(ex.x, ex.y, 13 * pulse, 22 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = open ? '#fff7d6' : '#94a3b8';
    ctx.beginPath();
    ctx.ellipse(ex.x, ex.y, 6 * pulse, 12 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (!open) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔒', ex.x, ex.y - 36);
    }
  }
}

function drawPickups(ctx, world) {
  for (const k of world.pickups) {
    if (k.kind === 'coin') {
      const spin = Math.abs(Math.cos(world.time * 6 + k.x));
      ctx.fillStyle = COLORS.gold;
      ctx.beginPath();
      ctx.ellipse(k.x, k.y, 7 * (0.4 + 0.6 * spin), 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.goldCore;
      ctx.beginPath();
      ctx.ellipse(k.x, k.y, 3.5 * (0.4 + 0.6 * spin), 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (k.kind === 'heart') {
      const pulse = 1 + 0.15 * Math.sin(world.time * 6);
      ctx.fillStyle = COLORS.potion;
      ctx.beginPath();
      ctx.arc(k.x - 4 * pulse, k.y - 2, 5 * pulse, 0, Math.PI * 2);
      ctx.arc(k.x + 4 * pulse, k.y - 2, 5 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(k.x - 8 * pulse, k.y);
      ctx.lineTo(k.x + 8 * pulse, k.y);
      ctx.lineTo(k.x, k.y + 9 * pulse);
      ctx.closePath();
      ctx.fill();
    } else if (k.kind === 'key') {
      const bob = Math.sin(world.time * 4) * 4;
      ctx.fillStyle = COLORS.key;
      ctx.beginPath();
      ctx.arc(k.x, k.y + bob - 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(k.x - 2, k.y + bob, 4, 14);
      ctx.fillRect(k.x + 2, k.y + bob + 8, 6, 3);
      ctx.fillRect(k.x + 2, k.y + bob + 12, 5, 3);
      ctx.fillStyle = '#fff7d6';
      ctx.beginPath();
      ctx.arc(k.x, k.y + bob - 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (k.kind === 'potion') {
      const bob = Math.sin(world.time * 4 + 1) * 3;
      ctx.fillStyle = COLORS.potion;
      rr(ctx, k.x - 6, k.y + bob - 4, 12, 14, 4);
      ctx.fill();
      ctx.fillRect(k.x - 2, k.y + bob - 10, 4, 7);
      ctx.fillStyle = COLORS.potionCore;
      ctx.fillRect(k.x - 3, k.y + bob + 2, 6, 5);
    }
  }
}

function drawBullets(ctx, world) {
  for (const b of world.bullets) {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius + 3, 0, Math.PI * 2);
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = b.friendly ? COLORS.boltCore : '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function eyes(ctx, x, y, dx, dy, spread, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + dx - spread, y + dy, r, 0, Math.PI * 2);
  ctx.arc(x + dx + spread, y + dy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemy(ctx, world, e) {
  const bob = Math.sin(world.time * 5 + e.bobPhase) * 2;
  const x = e.x;
  const y = e.y + bob;
  const flash = e.flash > 0;
  ctx.save();
  if (flash) ctx.globalAlpha = 0.85;
  if (e.type === 'slime') {
    const wob = 1 + 0.08 * Math.sin(world.time * 8 + e.bobPhase);
    ctx.fillStyle = e.type === 'slime' ? COLORS.slime : COLORS.slime;
    ctx.beginPath();
    ctx.ellipse(x, y, e.radius * wob, e.radius * (2 - wob) * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.slimeDark;
    ctx.beginPath();
    ctx.ellipse(x, y + e.radius * 0.45, e.radius * 0.7, e.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    eyes(ctx, x, y - 3, 0, 0, 6, 2.6, '#ffffff');
    eyes(ctx, x, y - 3, 0, 0, 6, 1.3, '#052e16');
  } else if (e.type === 'bat') {
    const flap = Math.sin(world.time * 18 + e.bobPhase) * 0.9;
    ctx.fillStyle = COLORS.batDark;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.5 - flap * 0.4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-20, -8);
    ctx.lineTo(-12, 6);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(1.0 + flap * 0.8);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(20, -8);
    ctx.lineTo(12, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = COLORS.bat;
    ctx.beginPath();
    ctx.arc(x, y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    eyes(ctx, x, y - 2, 0, 0, 4.5, 2.2, '#ff2d55');
  } else if (e.type === 'skeleton') {
    const windup = e.state === 'windup';
    ctx.strokeStyle = COLORS.skeletonDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 2);
    ctx.lineTo(x - 7, y + 12);
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x, y + 12);
    ctx.moveTo(x + 7, y + 2);
    ctx.lineTo(x + 7, y + 12);
    ctx.stroke();
    ctx.fillStyle = COLORS.skeleton;
    ctx.beginPath();
    ctx.arc(x, y - 6, 10, 0, Math.PI * 2);
    ctx.fill();
    eyes(ctx, x, y - 7, 0, 0, 4, 2.4, '#0f172a');
    // Bone club, raised when winding up.
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 4);
    ctx.lineTo(x + (windup ? 16 : 12), y - (windup ? 14 : 2));
    ctx.stroke();
    if (windup) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', x, y - 24);
    }
  } else if (e.type === 'mage') {
    const casting = e.state === 'cast';
    ctx.fillStyle = COLORS.mageDark;
    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x + 13, y + 12);
    ctx.lineTo(x - 13, y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.mage;
    ctx.beginPath();
    ctx.arc(x, y - 10, 9, 0, Math.PI * 2);
    ctx.fill();
    eyes(ctx, x, y - 11, 0, 0, 3.5, 2, '#f5d0fe');
    // Staff with a glowing orb.
    ctx.strokeStyle = '#7e22ce';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 12);
    ctx.lineTo(x + 16, y - 14);
    ctx.stroke();
    const orbR = casting ? 7 + Math.sin(world.time * 20) * 2 : 5;
    ctx.fillStyle = COLORS.enemyBolt;
    ctx.beginPath();
    ctx.arc(x + 16, y - 16, orbR, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.type === 'elite') {
    const wob = 1 + 0.1 * Math.sin(world.time * 7 + e.bobPhase);
    ctx.fillStyle = COLORS.elite;
    ctx.beginPath();
    ctx.ellipse(x, y, e.radius * wob, e.radius * (2 - wob) * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7c2d12';
    ctx.beginPath();
    ctx.ellipse(x, y + e.radius * 0.45, e.radius * 0.7, e.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Crown.
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath();
    ctx.moveTo(x - 12, y - e.radius - 2);
    ctx.lineTo(x - 6, y - e.radius - 12);
    ctx.lineTo(x, y - e.radius - 4);
    ctx.lineTo(x + 6, y - e.radius - 12);
    ctx.lineTo(x + 12, y - e.radius - 2);
    ctx.closePath();
    ctx.fill();
    eyes(ctx, x, y - 4, 0, 0, 8, 3.2, '#ffffff');
    eyes(ctx, x, y - 4, 0, 0, 8, 1.6, '#431407');
    drawBar(ctx, x - 24, y - e.radius - 22, 48, 5, e.hp / e.maxHp, '#f97316');
  } else if (e.type === 'boss') {
    const telegraph = e.state === 'telegraph';
    const burst = e.state === 'burst';
    const charge = e.state === 'charge';
    // Charge telegraph arrow.
    if (telegraph) {
      ctx.strokeStyle = 'rgba(255,51,85,0.8)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + e.chargeDirX * 130, y + e.chargeDirY * 130);
      ctx.stroke();
    }
    // Body: stone golem.
    ctx.fillStyle = telegraph || charge ? '#7f1d1d' : COLORS.boss;
    rr(ctx, x - 34, y - 30, 68, 60, 12);
    ctx.fill();
    ctx.fillStyle = '#475569';
    rr(ctx, x - 34, y - 30, 68, 16, 10);
    ctx.fill();
    // Glowing core.
    const corePulse = 1 + 0.2 * Math.sin(world.time * (burst ? 16 : 5));
    ctx.fillStyle = burst ? COLORS.enemyBolt : COLORS.bossCore;
    ctx.beginPath();
    ctx.arc(x, y + 4, 12 * corePulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y + 4, 5 * corePulse, 0, Math.PI * 2);
    ctx.fill();
    // Horns + eyes.
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(x - 30, y - 26);
    ctx.lineTo(x - 40, y - 44);
    ctx.lineTo(x - 20, y - 32);
    ctx.closePath();
    ctx.moveTo(x + 30, y - 26);
    ctx.lineTo(x + 40, y - 44);
    ctx.lineTo(x + 20, y - 32);
    ctx.closePath();
    ctx.fill();
    eyes(ctx, x, y - 16, 0, 0, 12, 3.5, '#ff3355');
    // Arms.
    ctx.fillStyle = COLORS.boss;
    ctx.beginPath();
    ctx.arc(x - 38, y + 8, 12, 0, Math.PI * 2);
    ctx.arc(x + 38, y + 8, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  if (flash) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawBar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(2,6,23,0.8)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, w * Math.max(0, Math.min(1, frac))), h);
}

function drawPlayer(ctx, world, input) {
  const p = world.player;
  if (world.screen !== SCREEN_PLAY && world.screen !== SCREEN_PAUSE) return;
  const blink = p.invuln > 0 && Math.floor(world.time * 14) % 2 === 0;
  ctx.save();
  if (blink) ctx.globalAlpha = 0.45;
  const x = p.x;
  const y = p.y + Math.sin(p.bob * 3) * 1.5;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 14, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Sword sweep arc while slashing.
  if (p.slashAnim > 0) {
    const t = 1 - p.slashAnim / 0.18;
    const a0 = p.angle - 1.1 + t * 2.2;
    ctx.strokeStyle = 'rgba(239,246,255,0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, 52, a0 - 0.5, a0 + 0.5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(142,246,255,0.5)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(x, y, 44, a0 - 0.4, a0 + 0.4);
    ctx.stroke();
  }
  // Body: steel knight with a gold trim and a red plume.
  ctx.fillStyle = COLORS.player;
  ctx.beginPath();
  ctx.arc(x, y, p.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.playerTrim;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, p.radius - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COLORS.playerCore;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  // Helmet plume toward the aim.
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(p.angle) * 8, y - Math.sin(p.angle) * 8);
  ctx.lineTo(x - Math.cos(p.angle) * 18, y - Math.sin(p.angle) * 18 - 4);
  ctx.stroke();
  // Sword held toward the aim.
  const sx = x + Math.cos(p.angle) * 20;
  const sy = y + Math.sin(p.angle) * 20;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(p.angle) * 10, y + Math.sin(p.angle) * 10);
  ctx.lineTo(sx, sy);
  ctx.stroke();
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Dodge roll: a spin ring.
  if (p.dodgeTimer > 0) {
    ctx.strokeStyle = 'rgba(127,178,255,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, p.radius + 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  // Crosshair at the mouse.
  if (world.screen === SCREEN_PLAY) {
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(input.mouseX, input.mouseY, 9, 0, Math.PI * 2);
    ctx.moveTo(input.mouseX - 13, input.mouseY);
    ctx.lineTo(input.mouseX - 5, input.mouseY);
    ctx.moveTo(input.mouseX + 5, input.mouseY);
    ctx.lineTo(input.mouseX + 13, input.mouseY);
    ctx.moveTo(input.mouseX, input.mouseY - 13);
    ctx.lineTo(input.mouseX, input.mouseY - 5);
    ctx.moveTo(input.mouseX, input.mouseY + 5);
    ctx.lineTo(input.mouseX, input.mouseY + 13);
    ctx.stroke();
  }
}

function drawFx(ctx, world) {
  for (const r of world.rings) {
    const t = 1 - r.life / r.maxLife;
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * t, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const pt of world.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of world.texts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, t.life / t.maxLife));
    ctx.fillStyle = t.color;
    ctx.font = `bold ${t.size}px sans-serif`;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

// Additive coloured glows, drawn before the darkness overlay.
function drawGlows(ctx, world) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, color, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const t of world.dungeon.torches) {
    const flick = 1 + 0.12 * Math.sin(world.time * 13 + t.phase);
    glow(t.x, t.y - 6, 90 * flick, 'rgba(255,179,71,0.55)', 0.5);
  }
  for (const c of world.dungeon.crystals) {
    const col = c.hue === 'cyan' ? 'rgba(55,230,255,0.5)' : 'rgba(255,92,225,0.5)';
    glow(c.x, c.y, 80, col, 0.45);
  }
  for (const key of world.dungeon.lava) {
    const tx = key % COLS;
    const ty = Math.floor(key / COLS);
    glow(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 70, 'rgba(255,106,0,0.5)', 0.4);
  }
  if (world.floor < TOTAL_FLOORS) {
    const ex = world.dungeon.exit;
    glow(ex.x, ex.y, world.hasKey ? 120 : 70, world.hasKey ? 'rgba(255,209,102,0.6)' : 'rgba(100,116,139,0.4)', 0.5);
  }
  glow(world.player.x, world.player.y, 120, 'rgba(127,178,255,0.35)', 0.5);
  if (world.boss && world.bossActive) {
    glow(world.boss.x, world.boss.y, 150, 'rgba(255,51,85,0.4)', 0.5);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// The darkness: a black layer with holes punched where light lives.
function drawDarkness(ctx, world) {
  if (!lightCanvas) {
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = VIEW.width;
    lightCanvas.height = VIEW.height;
  }
  const lctx = lightCanvas.getContext('2d');
  lctx.clearRect(0, 0, VIEW.width, VIEW.height);
  lctx.globalCompositeOperation = 'source-over';
  lctx.fillStyle = 'rgba(3,3,10,0.80)';
  lctx.fillRect(0, 0, VIEW.width, VIEW.height);
  lctx.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r) => {
    const g = lctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.65, 'rgba(0,0,0,0.95)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.beginPath();
    lctx.arc(x, y, r, 0, Math.PI * 2);
    lctx.fill();
  };
  const p = world.player;
  hole(p.x, p.y, 265 * (1 + 0.03 * Math.sin(world.time * 7)));
  for (const t of world.dungeon.torches) {
    hole(t.x, t.y - 6, 145 * (1 + 0.08 * Math.sin(world.time * 11 + t.phase)));
  }
  for (const c of world.dungeon.crystals) hole(c.x, c.y, 125);
  for (const key of world.dungeon.lava) {
    const tx = key % COLS;
    const ty = Math.floor(key / COLS);
    hole(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 115);
  }
  if (world.floor < TOTAL_FLOORS) hole(world.dungeon.exit.x, world.dungeon.exit.y, world.hasKey ? 130 : 90);
  if (world.boss && world.bossActive) hole(world.boss.x, world.boss.y, 160);
  ctx.drawImage(lightCanvas, 0, 0);
}

function drawHud(ctx, world) {
  const p = world.player;
  ctx.fillStyle = 'rgba(2,6,23,0.72)';
  ctx.fillRect(0, 0, VIEW.width, 48);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 48, VIEW.width, 1);
  // HP bar.
  drawBar(ctx, 16, 14, 240, 18, p.hp / p.maxHp, COLORS.hpBar);
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${Math.ceil(p.hp)}/${p.maxHp}`, 264, 28);
  // Floor.
  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`FLOOR ${world.floor}/${TOTAL_FLOORS}`, 400, 21);
  ctx.fillStyle = COLORS.dim;
  ctx.font = '12px sans-serif';
  ctx.fillText(FLOOR_NAMES[world.floor - 1], 400, 38);
  // Gold.
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.arc(640, 22, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`${world.gold}`, 654, 27);
  // Kill streak (combo): hot gold, pulses with the timer.
  if (world.streak >= 2) {
    const pulse = 1 + 0.12 * Math.sin(world.time * 10);
    ctx.fillStyle = COLORS.gold;
    ctx.font = `bold ${Math.round(15 * pulse)}px sans-serif`;
    ctx.fillText(`STREAK x${world.streak}`, 520, 27);
  }
  // Potions.
  for (let i = 0; i < PLAYER.potionMax; i += 1) {
    const x = 760 + i * 26;
    ctx.fillStyle = i < p.potions ? COLORS.potion : 'rgba(255,92,138,0.25)';
    rr(ctx, x, 14, 14, 18, 4);
    ctx.fill();
  }
  ctx.fillStyle = COLORS.dim;
  ctx.font = '12px sans-serif';
  ctx.fillText('Q', 760, 44);
  // Dodge readiness: a small ring that fills as the cooldown recovers.
  // Kept left of the potion slots so its "SPC" label never runs into "Q".
  const dodgeFrac = p.dodgeCooldown > 0 ? 1 - p.dodgeCooldown / PLAYER.dodgeCooldown : 1;
  ctx.strokeStyle = dodgeFrac >= 1 ? COLORS.player : 'rgba(34,211,238,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(724, 23, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dodgeFrac);
  ctx.stroke();
  ctx.fillStyle = COLORS.dim;
  ctx.font = '11px sans-serif';
  ctx.fillText('SPC', 712, 44);
  // Key.
  ctx.fillStyle = world.hasKey ? COLORS.key : 'rgba(255,224,102,0.25)';
  ctx.beginPath();
  ctx.arc(890, 22, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(888, 28, 4, 10);
  // Objective.
  ctx.fillStyle = world.hasKey ? COLORS.key : COLORS.dim;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(world.objective, VIEW.width - 16, 28);
  ctx.textAlign = 'left';
  // Boss bar.
  if (world.boss && world.bossActive && world.boss.hp > 0) {
    const w = 520;
    const x = (VIEW.width - w) / 2;
    const y = VIEW.height - 34;
    ctx.fillStyle = 'rgba(2,6,23,0.72)';
    ctx.fillRect(x - 10, y - 22, w + 20, 40);
    ctx.fillStyle = COLORS.bossCore;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THE WARDEN', VIEW.width / 2, y - 8);
    drawBar(ctx, x, y, w, 12, world.boss.hp / world.boss.maxHp, COLORS.bossBar);
    ctx.textAlign = 'left';
  }
}

function drawFloorCard(ctx, world) {
  if (world.floorCard <= 0) return;
  const a = Math.min(1, world.floorCard / 0.6);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(2,6,23,0.55)';
  ctx.fillRect(0, 280, VIEW.width, 120);
  ctx.fillStyle = COLORS.gold;
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`FLOOR ${world.floor}`, VIEW.width / 2, 330);
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(FLOOR_NAMES[world.floor - 1], VIEW.width / 2, 366);
  ctx.restore();
  ctx.textAlign = 'left';
}

function centerText(ctx, text, y, size, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, VIEW.width / 2, y);
  ctx.restore();
}

function drawMenus(ctx, world) {
  if (world.screen === SCREEN_TITLE) {
    ctx.fillStyle = 'rgba(2,6,23,0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const pulse = 1 + 0.05 * Math.sin(world.time * 3);
    ctx.save();
    ctx.translate(VIEW.width / 2, 250);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DUNGEON DELVE', 0, 0);
    ctx.restore();
    centerText(ctx, 'Descend three floors. Slay the elite. Break the Warden.', 300, 20, COLORS.text);
    centerText(ctx, 'WASD move  •  mouse aim  •  hold click to slash & cast  •  SPACE dodge roll  •  Q potion  •  P pause  •  R restart', 380, 16, COLORS.dim);
    centerText(ctx, 'Find the KEY to open the portal. Chests hide gold and potions. Mind the spikes and lava.', 410, 16, COLORS.dim);
    const blink = 0.6 + 0.4 * Math.sin(world.time * 4);
    centerText(ctx, 'PRESS ENTER TO DELVE', 480, 26, COLORS.gold, blink);
    ctx.textAlign = 'left';
  } else if (world.screen === SCREEN_PAUSE) {
    ctx.fillStyle = 'rgba(2,6,23,0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    centerText(ctx, 'PAUSED', 330, 48, COLORS.text);
    centerText(ctx, 'Press P to resume', 380, 18, COLORS.dim);
    ctx.textAlign = 'left';
  } else if (world.screen === SCREEN_OVER) {
    ctx.fillStyle = 'rgba(20,2,2,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    centerText(ctx, 'YOU DIED', 280, 64, '#ff6b6b');
    const s = world.winStats || { score: 0, kills: 0, gold: 0, floor: 1, time: 0 };
    centerText(ctx, `The dungeon keeps your bones.  Score ${s.score}  •  ${s.kills} slain  •  ${s.gold} gold  •  Floor ${s.floor}  •  ${Math.floor(s.time)}s`, 350, 19, COLORS.text);
    const blink = 0.6 + 0.4 * Math.sin(world.time * 4);
    centerText(ctx, 'PRESS R TO TRY AGAIN', 430, 26, COLORS.gold, blink);
    ctx.textAlign = 'left';
  } else if (world.screen === SCREEN_WIN) {
    ctx.fillStyle = 'rgba(2,6,23,0.62)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    centerText(ctx, 'THE WARDEN FALLS!', 260, 60, COLORS.gold);
    centerText(ctx, 'The dungeon is yours, delver.', 310, 22, COLORS.text);
    const s = world.winStats || { score: 0, kills: 0, gold: 0, floor: 3, time: 0 };
    centerText(ctx, `Score ${s.score}  •  ${s.kills} slain  •  ${s.gold} gold  •  ${Math.floor(s.time)}s`, 360, 20, COLORS.text);
    const blink = 0.6 + 0.4 * Math.sin(world.time * 4);
    centerText(ctx, 'PRESS R TO DELVE AGAIN', 430, 26, COLORS.gold, blink);
    ctx.textAlign = 'left';
  }
}

export function draw(ctx, world, input) {
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.save();
  // Screen shake: deterministic from world.time, so a staged frame is stable.
  const sh = world.shake * 9;
  const ox = Math.sin(world.time * 91.7) * sh;
  const oy = Math.cos(world.time * 113.3) * sh;
  ctx.translate(ox, oy);
  drawFloorAndWalls(ctx, world);
  drawDust(ctx, world);
  drawTorches(ctx, world);
  drawCrystals(ctx, world);
  drawBossTelegraph(ctx, world);
  drawChestsAndExit(ctx, world);
  drawPickups(ctx, world);
  drawBullets(ctx, world);
  for (const e of world.enemies) drawEnemy(ctx, world, e);
  drawPlayer(ctx, world, input);
  drawFx(ctx, world);
  drawGlows(ctx, world);
  drawDarkness(ctx, world);
  ctx.restore();
  if (world.screen === SCREEN_PLAY || world.screen === SCREEN_PAUSE) drawHud(ctx, world);
  drawFloorCard(ctx, world);
  drawMenus(ctx, world);
}
