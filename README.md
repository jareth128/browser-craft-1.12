# Browser Craft

A first-person, 3D voxel sandbox prototype built with Three.js and Vite. It generates a small block world, supports movement and block editing, and stores local edits in IndexedDB.

## Run

```sh
npm install
npm run dev
```

## Controls

- `W` `A` `S` `D`: move; double-tap `W` to toggle sprint
- Arrow keys: turn and look up/down
- `Space`: jump
- `Left Shift`: move slowly
- `Q`: mine the targeted block
- `R`: place the selected block
- `1`-`9`: select a hotbar slot
- `E`: inventory; `Escape`: pause/close; `Enter`: chat

This is an original prototype, not a complete or exact Minecraft Java 1.12 implementation. It does not yet include faithful Java terrain generation, full-height streamed chunks, survival/combat/tick simulation, the complete block and dimension catalog, or multiplayer/WebRTC. It uses original procedural visuals rather than Minecraft assets.