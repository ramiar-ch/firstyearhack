# Project brief

You are helping a 3-person first-year team build a 2-minute DEMO of a game for a hackathon. We are beginners: keep code simple, readable and commented, and tell us how to run everything. I'm on Windows: use npm.cmd instead of npm in PowerShell.

First save this whole brief as PROJECT.md in the repo root and commit it. Then build ONLY "Step 1" at the bottom, run it, and tell me how to test it.

## Concept: "Strand Theft Auto" (working title)
A 3D browser game that is a retro remix of 1997-era top-down open-world driving games, set in the REAL streets of central London around King's College London's Strand campus. Players spawn outside the KCL Strand Building, walk around, jump into cars, do missions and get chased by police.
Hackathon track: "Retro Remix — Old Tech, New Tricks" (judged on: reinventive, surprising + faithful). Also entering "Best Use of Snowflake".
All art must be original, procedural, or from Kenney.nl (CC0). Do NOT use any Grand Theft Auto / Rockstar names, logos, fonts, characters, music or assets.

## The unique features (these are what the demo must show)
1. REAL LONDON: buildings and roads from OpenStreetMap within a radius of the KCL Strand Building (lat 51.5115, lon -0.1160). Start with RADIUS = 1000 m as a config value (we may raise it to 2000 m). Credit "© OpenStreetMap contributors" on screen.
2. SPLIT-SCREEN: 2 players on one screen, each with their own overhead camera.
3. SCAN-A-WEAPON: take a photo of a real object (e.g. a soda can) with the webcam or upload an image -> background removed -> it appears in the game as a flat "paper cut-out" 3D object -> the player can throw it (cartoon effect: it stuns police cars, splashes, no gore).
4. SNOWFLAKE AI: Snowflake Cortex names the scanned item and invents funny weapon stats as JSON; game events go to Snowflake; after the match Cortex writes a funny "Met Police report".
5. 1997 MODE: press R to switch between modern "Neon London" and a retro pixelated look.

## Visual style: "Neon London"
Rainy London at 2am: dark wet roads, sodium-orange street lamps, light fog, neon accents, deep blue shadows. Palette: orange, deep blue, wet black. NOT pink/teal.
1997 MODE = render at 320x180 and upscale with CSS image-rendering: pixelated.

## Camera
NOT third-person. A high overhead camera (~60 degrees) following each player, zooming out slightly with speed — faithful to the 1997 top-down games, in modern 3D. Split-screen = left/right halves using renderer.setViewport/setScissor.

## Controls
Player 1: WASD to move/drive, E to enter/exit car, Q to throw item.
Player 2: arrow keys to move/drive, Enter to enter/exit car, / (slash) to throw item.

## Tech
- /client: Vite + TypeScript + Three.js. Arcade driving maths (speed, steering, drag), NO physics engine. Simple box collisions.
- OpenStreetMap data: a Node script /client/scripts/fetch-osm.mjs that queries the Overpass API ONCE for buildings (with heights/levels where available, default 15 m) and roads within RADIUS, converts lat/lon to local metres around the spawn point, and saves /client/public/data/london.json. The game loads this file (never calls Overpass at runtime). Merge building geometry for performance.
- Characters/cars: start with simple shapes (capsule person, box car with headlights). Later replace with Kenney .glb models from /client/public/models via GLTFLoader.
- Scanning: in-browser background removal (e.g. @imgly/background-removal) -> image used as a texture on a thin cut-out 3D object.
- /server: Node + Express (later Socket.io for phones). /snowflake: SQL + Streamlit. Secrets only in .env, never committed.
- Folders so teammates don't clash: client/src/world (map), client/src/player (characters, cars, cameras), client/src/scan (scanning + items), client/src/game (missions, police, HUD), server/, snowflake/.

## Build order (each must work before the next)
1. OSM fetch script + 3D London blocks and roads around KCL Strand, spawn point, one walking character with overhead camera.
2. Drivable car + enter/exit car + building collisions.
3. Split-screen 2 players.
4. Neon London look (bloom, street lamps, fog, headlights) + 1997 MODE.
5. Simple mission (pickup -> drop-off -> "MISSION PASSED +£5"), wanted level (0-5 blue lights), chasing police car, "NICKED", 3-minute match + winner screen.
6. Scan-a-weapon: webcam/upload -> background removal -> cut-out item -> throw it -> stuns police.
7. Snowflake: Cortex names the item + weapon stats JSON; batched game events; post-match police report.
8. Enter the KCL Strand Building: walking into the entrance loads a placeholder lobby room (later replaced by a scanned .glb of the real interior).
LATER (not now): phones as controllers and phone camera scanning via Socket.io.

## Step 1 (do only this now)
Create the /client Vite + TypeScript + Three.js project and a .gitignore (node_modules, dist, .env, .idea/workspace.xml). Write and run the OSM fetch script for RADIUS = 1000 m. Render the buildings as dark extruded blocks and roads as flat strips, spawn a capsule character outside the KCL Strand Building, move it with WASD, with the overhead follow camera and the OSM credit on screen. Run the dev server and tell me the URL.
