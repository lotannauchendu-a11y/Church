# Blockhaven

A Minecraft-style voxel game that runs in the browser: one self-contained `index.html`, WebGL 2, no dependencies.

Open `index.html` in a recent Chrome, Edge, Firefox or Safari to play. Worlds save automatically in the browser.

## What's in it

- Infinite procedural worlds: plains, forests, deserts, snowy taiga, mountains, oceans and beaches, with caves, lava, and coal, iron, gold and diamond ores
- Graphics: real-time sun and moon shadows, smooth lighting with ambient occlusion, coloured torch light, reflective animated water, soft moving clouds that cast shadows, day/night sky with stars, swaying leaves and grass, and biome-tinted foliage
- Survival mode: mining with tools, crafting (crafting table and furnace), health, fall damage, drowning, food, pigs and sheep, and zombies that hunt at night and burn at sunrise
- Creative mode: flight, instant mining and every block
- Falling sand and gravel, flowing water, synthesised sound effects and ambient music
- Touch controls for phones and tablets

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Left click (hold) | Mine / attack |
| Right click | Place / eat / open a crafting table or furnace |
| Space | Jump, swim; double-tap to fly in Creative |
| Shift | Sneak, fly down |
| Ctrl or double-tap W | Sprint |
| 1–9, mouse wheel | Hotbar |
| E | Inventory and crafting |
| Q | Drop item |
| Middle click | Pick block |
| F3 | Debug info |
| Esc | Pause |

## Source

The game is written in plain JavaScript under `src/` and assembled into `index.html` by:

```
node build.mjs
```

| File | Contents |
| --- | --- |
| `src/shared.js` | Blocks, items, seeded noise, terrain generation, lighting and chunk meshing (also runs in Web Workers) |
| `src/textures.js` | Procedural 16×16 textures and inventory icons |
| `src/engine.js` | WebGL 2 renderer and shaders |
| `src/world.js` | Chunk streaming, worker pool, block edits, water flow |
| `src/game.js` | Player physics, mining, crafting, mobs, items, particles, audio |
| `src/main.js` | Camera, sky, HUD, menus, input, saving, main loop |
| `src/head.html`, `src/body.html` | Styles and page markup |
