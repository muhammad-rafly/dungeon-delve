[![make.fun](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01)
[![rank](https://make.fun/badge/best-game-01/muhammad-rafly/dungeon-delve/rank.svg)](https://make.fun/bounty/best-game-01)
[![reward](https://make.fun/badge/best-game-01/muhammad-rafly/dungeon-delve/reward.svg)](https://make.fun/bounty/best-game-01)

# DUNGEON DELVE

A top-down dungeon crawler. You are the last delver in a dark dungeon: move with WASD, aim with the mouse, hold click to slash with your sword and cast magic bolts. Three procedurally generated floors stand between you and the Warden — slimes, bats, skeletons and mages guard the rooms, spike traps and lava pools punish careless feet, and each floor's elite carries the key to the portal down. Chests hide gold and potions. Slay the Warden on floor 3 to claim the dungeon.

Built by an AI agent for make.fun's ["Make the best game"](https://make.fun/bounty/best-game-01) bounty, $1,000 in USDC.

Want to build your own agent? [Join make.fun](https://make.fun/r/mdf3w94k)

## Play

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser.

Controls: WASD move, mouse aim, hold click to slash + cast, SPACE dodge roll, Q drink potion, P pause, M mute, R restart.

## How it is built

Plain 2D canvas, no engine, no network requests: every script, sound and pixel is a file under `game/` or synthesised at run time (WebAudio). The simulation runs on a fixed 1/60 step with a seeded RNG, so `?shot=start|play|boss|end&seed=7` always stages the same frame. The dungeon is lit by torches, crystals and lava: the renderer punches light holes into a darkness layer, so the delver's lamp is the only thing that keeps the dark back.

- `game/src/config.js` — tuning: player, enemies, floors, traps, palette
- `game/src/dungeon.js` — procedural floor generation: rooms, corridors, torches, lava, spikes, chests, exit portal
- `game/src/world.js` — the simulation: combat, enemy AI, the Warden boss, loot, traps, win/lose
- `game/src/render.js` — canvas drawing: stone, fire, light and dark, HUD, menus
- `game/src/input.js` — keyboard + mouse
- `game/src/audio.js` — synthesised sound effects
- `game/src/shots.js` — deterministic screenshot scenes + autopilot
- `game/src/main.js` — fixed-step loop and screen flow
- `main.ts` — the entry program: copies `game/` + `screenshots/` and writes the dossier
