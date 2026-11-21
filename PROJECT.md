# Running the project

Run `npm start` or `npm run dev` from the repository root to start the Strand City Viewer at [localhost:8080](http://localhost:8080/). In IntelliJ IDEA, use the **Strand City Viewer** run configuration.

To play both from the same server, run `npm ci --prefix client` once and `npm run build`, then choose **Two-player game** in the viewer. The original driving demo is at `/game/demo.html`.

For development on the two-player character creator and overhead London game, run `npm ci --prefix client` once, then `npm --prefix client run dev`. Open the URL Vite prints. The original single-car driving demo is available at `/demo.html` on that server.

## Strand Theft Auto (working title)

A browser driving game set at night on the real streets around King's College London's Strand campus. It is a retro remix of 1997-era top-down open-world driving games, rebuilt for 2026.

**Hackathon track:** "Retro Remix — Old Tech, New Tricks" (judged on: reinventive, surprising + faithful). We are also entering "Best Use of Snowflake".

**Team:** 3-person first-year team, ~7 hours.

---

## Core loop

Players drive delivery vehicles (black cab, night bus, moped). A mission "phone call" gives a pickup and a drop-off at a real landmark. Deliver before the timer runs out to get "MISSION PASSED +£5". Crashing raises your wanted level (shown as flashing blue lights, 0–5). At 1+ a police car chases you; if it touches you: "NICKED". Match lasts 3 minutes; highest money wins.

---

## Visual style: "Neon London"

Rainy London at 2am: wet reflective dark roads, sodium-orange street lights, fog, neon theatre signs along Aldwych, deep blue shadows.

**Palette:** orange, deep blue, wet black. NOT pink/teal.

All art must be original or from Kenney.nl (CC0). Do not use any Grand Theft Auto / Rockstar names, logos, fonts, characters, music or assets.

### Map (simplified, fits one screen)

- The Strand running left–right across the middle
- Aldwych as a crescent at the top
- Kingsway going up off-screen
- Waterloo Bridge going down off-screen

**Labelled landmarks:** Bush House, Somerset House, King's College (Strand Building), Temple station, Montreal Place.

### 1997 MODE

Pressing **R** toggles a retro look (very low resolution pixelated render, chiptune music). Default is the modern neon look.

---

## Tech

### ENGINE (3D)

Vite + TypeScript + Three.js. Fixed high overhead camera at ~60° showing the whole map. Kenney Car Kit + City Kit glTF models. Bloom post-processing for neon. Arcade driving maths (speed + steering angle), box collisions, no physics engine. 1997 MODE = render at 320×180 and upscale with `image-rendering: pixelated`.

### Server

Node.js + Express + Socket.io in `/server` (later: phone controllers).

### Snowflake (later)

Game events batched every 5s into a `GAME_EVENTS` table; Cortex AI writes mission call scripts and a post-match "police report"; Streamlit dashboard with a crash heatmap. Secrets in `.env` only, never committed.

---

## Folder structure

```
/client    -> the game (Vite)
/server    -> Node server
/snowflake -> SQL + Streamlit
```

Keep code simple and readable — we are beginners and must understand it.

---

## Priorities (build in this order; each must work before the next)

1. One car driving with the keyboard on the map, with collisions.
2. Mission loop: pickup → drop-off → MISSION PASSED, timer, money.
3. Local 2-player: WASD vs arrow keys, two cars, scoreboard.
4. Wanted level + chasing police car + NICKED.
5. 1997 MODE toggle.
6. Mission "phone call" popup with browser text-to-speech (British voice).
7. Snowflake integration.
8. Phone controllers via QR code (optional).

---

## Step 1 (first build)

Set up the `/client` project with the chosen engine and TypeScript, add a `.gitignore` (`node_modules`, `dist`, `.env`, `.idea/workspace.xml`), and show one placeholder car on a dark road that can be driven with the arrow keys.
