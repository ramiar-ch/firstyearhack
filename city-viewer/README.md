# City viewer — 2 km around KCL Strand

A standalone 3D model of the real streets within 2 km of King's College London's Strand campus, built with Three.js. You can orbit, walk the streets at eye level, fly, or take over a vehicle, including bicycles. Separate from the game in `/client`. No build step.

## Run it

- Double-click `index.html`, or
- `node serve.js` and open <http://localhost:8080>

It needs an internet connection the first time to load Three.js from the jsDelivr CDN. The UI is in English by default; the **中文** button in the top bar switches to Chinese (remembered per browser).

## Controls

| Key | Mode | |
|---|---|---|
| 1 | Orbit | left drag rotate · right drag pan · wheel zoom · WASD move · Q/E turn |
| 2 | Walk | click to lock the mouse · WASD walk · Shift jog · Space jump |
| 3 | Fly | WASD move · Space/E up · C/Q down · Shift faster · wheel speed |
| 4 | Drive or ride the nearest available vehicle | W/S accelerate/brake (hold S to back up) · A/D steer · Space brake · V change vehicle · C chase/first-person camera · R back on the road |

T runs/pauses time, H hides the UI, and clicking the minimap moves you there.

Teal dots on the minimap mark shared bicycle stations. Select a station in Orbit or Walk mode, then enter Drive near an available bicycle to ride it. Switch back to Walk to dismount. A shared bicycle docks in a free slot when you dismount within about three metres of one.

**Look:** the default "London mood" is a low overcast sky, silver haze, soft shadows, rain-wet roads and pavements with puddles that reflect the sky, light drizzle (toggle "Drizzle"), and a muted cool colour grade that keeps reds (buses, phone boxes, post boxes) vivid. At night the clouds glow sodium-brown and shopfronts light up. Switch to "Natural" in the Display panel for a physical sky.

**URL options:** `?time=21.5` (start time, 0–24), `?look=natural|london`, `?lang=zh|en`, `?mode=walk|fly|drive`, `?car=cab|car|routemaster|van|bus|bike`, `?at=51.5113,-0.1198` (start at a lat/lon) — e.g. `index.html?mode=drive&car=bike&time=18`.

## What is real and what is generated

- **Real (OpenStreetMap):** street layout and names, one-way streets, bus lanes, building footprints and heights/storeys where tagged, the Thames, bridges, rail viaducts, parks, street trees, and the positions of traffic lights, crossings, bus stops, phone boxes, post boxes, benches and Tube entrances.
- **Generated:** facades of ordinary buildings (London styles: Portland stone, Victorian red brick, Georgian stock brick, stucco, glass, concrete, warehouse), shopfronts, mansard roofs, chimneys, tree species (London plane, lime, birch, conifer), vehicles including classic Routemaster-style double-deckers, cyclists, shared bicycle stations, and pedestrians of different ages. Heights are estimated where OSM has none. The ground is flat.

## Collisions and modding

Building walls (from the OSM footprints), Thames embankments, bridge parapets and railway viaduct walls are stored as line segments. Trees, posts, docks, street furniture and viaduct piers use circles. Walking, driving and cycling use the same collision world. Each car, bus and bicycle has a footprint that turns with it. The player and AI traffic check the full motion to the next position against those footprints and static obstacles. Traffic follows the road network on the left and yields to red lights and occupied space.

Run the collision regression tests with `node --test tools/test-traffic.js` from `city-viewer`.

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
