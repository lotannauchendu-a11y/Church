# Ember Brigade

An original run-and-gun arcade shooter: ten missions, ten boss machines, six weapons,
all drawn and synthesised in code (no image or audio files, no dependencies).
Plays in any modern browser with touch controls, a keyboard, or a gamepad.

## Play

Open `index.html` in a browser, or serve the folder with any static host
(for example GitHub Pages: Settings > Pages > deploy from the branch root).

| Action            | Touch                      | Keyboard            | Gamepad        |
|-------------------|----------------------------|---------------------|----------------|
| Move / aim / duck | left thumb stick           | Arrows or WASD      | stick or d-pad |
| Fire              | FIRE (hold)                | Z or J (hold)       | X / RT         |
| Jump              | JUMP                       | X, K or Space       | A              |
| Throw bomb        | BOMB                       | C or L              | B / Y          |
| Pause             | pause button               | P or Esc            | Start          |

- Push up to aim high, diagonals to aim at an angle, down in mid-air to shoot below you.
- Hold down on the ground to duck under high shots; duck + jump drops through thin platforms.
- Break supply crates and free caged Pips for weapons, bombs and repairs.
- **Casual** mode gives more health and lives and slows enemy fire; **Classic** is the tougher arcade tuning.
- **Auto fire** (on by default on touch screens) shoots for you whenever a target is on screen.
- Progress (unlocked missions, best score, options) is saved in the browser.

## Missions

1. Dustline Outpost
2. Mangrove Mire
3. Rivet Harbor
4. Freight Run
5. Glowroot Caverns
6. Frostpeak Relay
7. Foundry Nine
8. Skyline Siege
9. Stratos Carrier
10. Core Citadel

## Code map

| File              | What it holds                                               |
|-------------------|-------------------------------------------------------------|
| `js/core.js`      | constants, palette, sprite baking, pixel primitives, font   |
| `js/sprites.js`   | hero, enemy, prop and pickup pixel art                      |
| `js/audio.js`     | WebAudio sound effects and the chiptune sequencer           |
| `js/input.js`     | keyboard, touch stick and buttons, gamepad                  |
| `js/themes.js`    | skies, parallax layers, tilesets and scenery per mission    |
| `js/levels.js`    | level builder and the ten mission layouts                   |
| `js/entities.js`  | physics, player, weapons, enemies, hazards, pickups         |
| `js/bosses.js`    | the ten bosses and their attack scripts                     |
| `js/game.js`      | main loop, camera, HUD, menus and mission flow              |

Adding `?level=N` to the URL starts on mission N; `&god=1` disables damage (handy for testing).
