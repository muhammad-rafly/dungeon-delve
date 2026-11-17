// DUNGEON DELVE — entry point. Fixed-step sim (1/60), render every frame.
// ?shot=start|play|boss|end&seed=N stages a deterministic screenshot scene instead
// of the interactive game; anything else is the game itself.
import { VIEW, STEP } from './config.js';
import { makeInput, attachInput } from './input.js';
import { makeAudio, unlockAudio } from './audio.js';
import {
  makeWorld,
  startGame,
  step,
  SCREEN_TITLE,
  SCREEN_PLAY,
  SCREEN_PAUSE,
  SCREEN_OVER,
  SCREEN_WIN,
} from './world.js';
import { draw } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number.parseInt(params.get('seed') || '7', 10) || 7;

const world = makeWorld(seed);
const input = makeInput();
const audio = makeAudio();

let lastScreen = world.screen;
function announce() {
  if (world.screen === lastScreen || !statusEl) return;
  lastScreen = world.screen;
  const lines = {
    [SCREEN_TITLE]: 'DUNGEON DELVE. Press Enter to play.',
    [SCREEN_PLAY]: `Floor ${world.floor}. Score ${world.score}.`,
    [SCREEN_PAUSE]: 'Paused.',
    [SCREEN_OVER]: `You died. Score ${world.score}. Press R to try again.`,
    [SCREEN_WIN]: `The Warden falls. Score ${world.score}. Press R to delve again.`,
  };
  statusEl.textContent = lines[world.screen] || '';
}

if (shotName) {
  // Screenshot staging: play the real rules forward, draw once, stop.
  const staged = stageShot(shotName, world, audio);
  world.screen = staged.screen;
  draw(ctx, world, input);
  announce();
} else {
  attachInput(input, canvas, {
    onKey(code) {
      unlockAudio(audio);
      if (code === 'KeyM') {
        audio.muted = !audio.muted;
        return;
      }
      if (world.screen === SCREEN_TITLE && (code === 'Enter' || code === 'Space')) {
        // Space is also the dodge key: drop it from the pressed set so starting
        // the game with Space does not burn the dodge on the first frame.
        input.pressedKeys.delete('Space');
        startGame(world);
        return;
      }
      if (world.screen === SCREEN_PLAY && code === 'KeyP') {
        world.screen = SCREEN_PAUSE;
        return;
      }
      if (world.screen === SCREEN_PAUSE && code === 'KeyP') {
        world.screen = SCREEN_PLAY;
        return;
      }
      if ((world.screen === SCREEN_OVER || world.screen === SCREEN_WIN) && code === 'KeyR') {
        startGame(world);
      }
    },
    onMouseDown(x, y) {
      unlockAudio(audio);
      if (world.screen === SCREEN_TITLE) {
        startGame(world);
        return;
      }
      if (world.screen === SCREEN_OVER || world.screen === SCREEN_WIN) {
        startGame(world);
      }
    },
  });

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (world.screen === SCREEN_PLAY) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 4) {
        step(world, STEP, input, audio);
        acc -= STEP;
        n += 1;
      }
      if (n === 4) acc = 0;
    } else {
      // Menus still animate (pulses, flames) on the visual clock.
      world.time += dt;
    }
    draw(ctx, world, input);
    announce();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
