# City viewer — 2 km around KCL Strand

A standalone 3D model of the real streets within 2 km of King's College London's Strand campus, built with Three.js. You can orbit, walk the streets at eye level, or fly. Separate from the game in `/client`; no build step.

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

T runs/pauses time, H hides the UI, and clicking the minimap moves you there.

## What is real and what is generated

- **Real (OpenStreetMap):** street layout and names, one-way streets, bus lanes, building footprints and heights/storeys where tagged, the Thames, bridges, rail viaducts, parks, street trees, and the positions of traffic lights, crossings, bus stops, phone boxes, post boxes, benches and Tube entrances.
- **Generated:** facades of ordinary buildings (London styles: Portland stone, Victorian red brick, Georgian stock brick, stucco, glass, concrete, warehouse), shopfronts, mansard roofs, chimneys, traffic and pedestrians. Heights are estimated where OSM has none. The ground is flat.

## Files

- `index.html` — the viewer
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
