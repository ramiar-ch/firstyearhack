# City viewer — 2 km around KCL Strand

A browser game and 3D sightseeing viewer covering the real streets within 2 km of King's College London's Strand campus. Both use the same Three.js city and run without a build step.

## Run it

Run `npm start` from the repository root and open <http://localhost:8080>.

On Windows, double-click `start-game.cmd` in the repository root to start the server and open the game automatically. Keep its console window open while playing. Opening `index.html` directly with a `file://` address cannot run the game's ES modules; that page shows launcher instructions instead of a loading bar.

The opening cover stays visible while the shared map loads. Once it is ready, the main menu offers **Street Missions** and **Sightseeing**. Choosing a mode starts its population and player systems using the already loaded map. Street Missions opens at the Strand car and includes deliveries, police pursuits, time travel and local split screen. Sightseeing opens in Orbit mode and includes Walk, Fly and traffic driving, including bicycles.

Press **Esc** or click **Menu** to pause. The pause menu offers Resume, Settings, Main menu and Exit game. Settings contains the shortcuts, language, time and display controls. Sightseeing also has Places and View controls there. Exit stops the current session and shows the exit screen in a normal browser tab.

**Shortcuts:** in Esc → Settings → Shortcuts, click a binding and press its replacement. Conflicts are rejected, Esc cancels capture, and Reset shortcuts restores defaults. Bindings apply to movement, gameplay actions and P2, and persist in this browser. Esc always opens the pause menu.

**Main menu and saves:** returning to the main menu pauses the existing world and keeps phone pairing alive. Choosing the same mode resumes immediately without loading the map again. Choosing the other mode reloads the world and restores that mode's save if present. Esc offers Save game and Load saved game; the launcher also offers dated load buttons. Returning to the main menu and exiting save automatically. Each mode has its own local save containing position, view, vehicle, time, mission stage/timer, earnings, wanted level, era and two-car state. Loading a save skips the opening sequence. Ambient traffic and temporary scanned props are regenerated rather than saved. Saves belong to this browser and origin (use the same localhost address and port); clearing site data removes them.

The first visit needs internet access for Three.js and the QR code library on jsDelivr. Menus default to English on each visit. The **中文** button in the launcher and Settings switches the language for the current visit, and `?lang=zh` explicitly opens in Chinese.

## Controls

| Key | Mode | |
|---|---|---|
| 1 | Orbit | left drag rotate · right drag pan · wheel zoom · WASD move · Q/E turn |
| 2 | Walk | click to lock the mouse · WASD walk · Shift jog · Space jump |
| 3 | Fly | WASD move · Space/E up · C/Q down · Shift faster · wheel speed |
| 4 | Drive or ride the nearest available vehicle | W/S accelerate/brake (hold S to back up) · A/D steer · Space brake · V change vehicle · C chase/first-person camera · R back on the road |
| 5 | Street vehicle | Enter the selected nearby vehicle · WASD/arrows drive · Space handbrake · V chase/overhead |
| F | Street vehicle interaction | Get out, or enter the selected accessible vehicle within 6 m of its body |
| G / H or mouse wheel | Street vehicle selection | Previous / next nearby vehicle while on foot |
| J | Street item | Use the equipped item (P1) |

In single-viewport driving, hold the left mouse button and drag to look around. Hold the forward key (W by default) to steer toward the view. The camera centers on the vehicle heading after about 1.25 seconds of mouse inactivity. A/D overrides the steering assistance.

In Street Missions, the 1997 boot and opening swoop end at the orange Strand car. Press a key to skip the intro or open `?skipIntro=1`. Press B or use the split-screen toggle in Settings for two cars. P1 uses WASD, and P2 uses the arrow keys with Right Ctrl for the handbrake. Entering Walk ends the two-car session. In Sightseeing Walk, V switches between first and third person. Press A on a gamepad or select **Add bot** under Settings for up to four walking views.

While walking in Street Missions, nearby cars, taxis, vans, buses and bicycles appear in a small bubble beside the character. The range is 6 m from the vehicle's body; vehicles behind walls or outside the playable area are excluded. G/H and the mouse wheel choose a candidate, and F enters it. The range is checked again on entry, so moving traffic cannot be selected from far away. F gets out into a clear space beside the vehicle. Previously used vehicles stay parked and can be entered again. The selected model, paint and parked vehicles are included in the Street save. These desktop shortcuts remain editable in Settings; phone controls are unchanged.

Deliveries take place within 750 m of KCL. Reach the orange pickup marker, then the blue drop-off before time expires. Either driver can complete a delivery. Up to three patrol cars chase the drivers along the streets. Use the red phone box with E (Enter for P2), or press R in the Strand car or on foot, to travel between 2026 and 1997.

In Street Missions, open **Esc → Settings → Phone controllers**, or press **P**. Put both phones on the same Wi-Fi as the computer. Scan the **P1** code on one phone and the **P2** code on the other. Each phone controls its own car, and connecting P2 enables split screen. The controller's scanner and in-game feedback follow the paired player. Returning to the launcher keeps pairing alive; switching mode or exiting ends both connections.

The first mission is the Exam Paper Heist. Collect the papers at Bush House, lose the patrol, and deliver them to Somerset House. Dispatch gives spoken directions at each stage. Open `?demo=1` to show phone settings after the intro. Press K for a spoken incident report. The report can use Snowflake when configured and has a local fallback.

T runs/pauses time, U hides the UI, and clicking the minimap moves you there.

Teal dots on the minimap mark shared bicycle stations. Select a station in Orbit or Walk mode, then enter Drive near an available bicycle to ride it. Switch back to Walk to dismount. A shared bicycle docks in a free slot when you dismount within about three metres of one.

**Look:** the default "London mood" is a low overcast sky, silver haze, soft shadows, rain-wet roads and pavements with puddles that reflect the sky, light drizzle (toggle "Drizzle"), and a muted cool colour grade that keeps reds (buses, phone boxes, post boxes) vivid. At night the clouds glow sodium-brown and shopfronts light up. Switch to "Natural" in the Display panel for a physical sky.

You can use `?play=street` or `?play=sightseeing` to bypass the main menu. Sightseeing accepts `?mode=walk|fly|drive`, `?car=cab|car|routemaster|van|bus|bike`, and `?at=51.5113,-0.1198`. Both modes accept `?time=21.5`, `?look=natural|london` and `?lang=zh|en`.

## What is real and what is generated

- **Real (OpenStreetMap):** street layout and names, one-way streets, bus lanes, building footprints and heights/storeys where tagged, the Thames, bridges, rail viaducts, parks, street trees, and the positions of traffic lights, crossings, bus stops, phone boxes, post boxes, benches and Tube entrances.
- **Generated:** facades of ordinary buildings (London styles: Portland stone, Victorian red brick, Georgian stock brick, stucco, glass, concrete, warehouse), shopfronts, mansard roofs, chimneys, tree species (London plane, lime, birch, conifer), vehicles including classic Routemaster-style double-deckers, cyclists, shared bicycle stations, and pedestrians of different ages. Heights are estimated where OSM has none. The ground is flat.

The Places menu frames the detailed landmark models. Elizabeth Tower's four dials follow the viewer clock, and Somerset House's courtyard fountains animate in close views. Architectural references include [UK Parliament](https://virtualtours-assets.parliament.uk/elizabeth-tower/index.html), [St Paul's Cathedral](https://www.stpauls.co.uk/wren-office-drawings), [Somerset House](https://www.somersethouse.org.uk/venue-hire/our-spaces/the-edmond-j-safra-fountain-court), and the Historic England listings for [Bush House](https://historicengland.org.uk/listing/the-list/list-entry/1066492) and the [Royal Courts of Justice](https://historicengland.org.uk/listing/the-list/list-entry/1264258).

## Collisions and modding

Building walls (from the OSM footprints), Thames embankments, bridge parapets and railway viaduct walls are stored as line segments. Trees, posts, docks, street furniture and viaduct piers use circles. Walking, driving and cycling use the same collision world. Each car, bus and bicycle has a footprint that turns with it. The player and AI traffic check the full motion to the next position against those footprints and static obstacles. Traffic follows the road network on the left and yields to red lights and occupied space.

Run the collision, phone pairing, save, shortcut and nearby vehicle regression tests with `node --test tools/test-traffic.js tools/test-relay.js tools/test-save-controls.js tools/test-nearby-vehicles.js` from `city-viewer`.

A racing or game mod can use the world through `window.CityWorld`. It is available after the page fires the `cityworld-ready` event. Coordinates are metres, with x pointing east and z pointing south from the Strand campus.

```js
window.addEventListener('cityworld-ready', () => {
  const W = window.CityWorld;
  const start = W.latLonToWorld(51.5113, -0.1198);   // -> {x, z}
  W.spawnCar(start.x, start.z);                      // switch to Drive mode at that point
  const stop = W.onUpdate(dt => {                    // called every frame
    const hit = W.collideCircle(W.player.x, W.player.z, 1.0); // {x, z, hit, nx, nz, depth}
    if (hit.hit) console.log('bump!', hit.depth);
  });
});
```

| Member | What it does |
|---|---|
| `collideCircle(x, z, r)` | Push a circle out of all static solids; returns the corrected position and contact normal |
| `raycast(x0, z0, x1, z1)` | Distance to the first wall along a line (`Infinity` if clear) |
| `addCircle(x, z, r)` / `addSegment(ax, az, bx, bz)` | Add your own solid props or barriers (e.g. race track walls, cones) |
| `nearestRoad(x, z, maxDist)` | Closest road point, direction, width, name, type, one-way flag |
| `isWater(x, z)` / `isBuilding(x, z)` | Quick map tests (about 1 m resolution) |
| `traffic()` / `pedestrians()` | Current positions of vehicles and people, including vehicle type and pedestrian style |
| `bikeStations()` | Shared bicycle station locations, slots and availability |
| `player` | The driven car: `x, z, yaw, vx, vz, kind` |
| `spawnCar(x, z)`, `setMode(name)` | Place the player car / switch camera mode |
| `onUpdate(fn)` | Per-frame callback `fn(dt)`; returns a function that removes it |
| `scene`, `camera`, `renderer`, `THREE` | The underlying Three.js objects for adding your own meshes |

## Files

- `index.html` — the viewer
- `city-models.js` — vehicle, rider and pedestrian geometry
- `city-traffic.js` — vehicle footprints, collision queries and motion checks
- `city-landmarks.js` — landmark geometry and animations
- `city-data.js` — processed OSM data (~5.5 MB)
- `serve.js` — tiny static server
- `tools/` — scripts to rebuild `city-data.js`

## Rebuilding the data

```
node tools/fetch-osm.js
node tools/process-osm.js city-data.js tools/osm-raw/q1.json tools/osm-raw/q2.json tools/osm-raw/q3.json tools/osm-raw/q4.json tools/osm-raw/q5.json tools/osm-raw/q6.json tools/osm-raw/q7.json tools/osm-raw/q8.json
```

`fetch-osm.js` downloads about 60 MB from the public Overpass API (retrying across mirrors when busy) into `tools/osm-raw/`, which git ignores. The centre point and radius are set at the top of `process-osm.js`.

Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).
