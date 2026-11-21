// 将 Overpass JSON 精简为本地数据文件 city-data.js
// 用法: node process.js out.js r1.json r2.json ...（自动按 type+id 去重）
const fs = require('fs');
const [,, outFile, ...inFiles] = process.argv;
const seen = new Set(), merged = [];
for (const f of inFiles) { let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.warn('skip', f, e.message); continue; }
  for (const el of j.elements) { const k = el.type + el.id; if (seen.has(k)) continue; seen.add(k); merged.push(el); } }
const raw = { elements: merged };
const LAT0 = 51.5115, LON0 = -0.1160, R = 2000, RSKY = 3600;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 111250;
const P = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const q = v => Math.round(v * 10); // 分米整数

const names = [], nameIdx = new Map();
const N = s => { if (!s) return undefined; if (!nameIdx.has(s)) { nameIdx.set(s, names.length); names.push(s); } return nameIdx.get(s); };
const num = s => { if (s == null) return undefined; const m = String(s).replace(',', '.').match(/-?[0-9.]+/); return m ? parseFloat(m[0]) : undefined; };

function ringFromGeom(g) { return g.map(p => P(p.lat, p.lon)); }
function area(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; }
function closeRing(r) { if (r.length > 2) { const a = r[0], b = r[r.length - 1]; if (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01) r = r.slice(0, -1); } return r; }
function simplify(r, tol = 0.15) { // 去掉近共线与重复点
  const out = [];
  for (let i = 0; i < r.length; i++) {
    const p = r[i], prev = out[out.length - 1];
    if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < tol) continue;
    out.push(p);
  }
  return out;
}
function flat(r) { const a = []; for (const p of r) a.push(q(p[0]), q(p[1])); return a; }
function minDist(r) { let m = 1e9; for (const p of r) m = Math.min(m, Math.hypot(p[0], p[1])); return m; }
function assemble(ways) { // 将多段 way 拼接成闭合环
  const segs = ways.map(w => w.slice()); const rings = [];
  const key = p => p[0].toFixed(2) + ',' + p[1].toFixed(2);
  while (segs.length) {
    let cur = segs.shift();
    let guard = 0;
    while (key(cur[0]) !== key(cur[cur.length - 1]) && guard++ < 5000) {
      const end = key(cur[cur.length - 1]);
      let found = -1, rev = false;
      for (let i = 0; i < segs.length; i++) {
        if (key(segs[i][0]) === end) { found = i; break; }
        if (key(segs[i][segs[i].length - 1]) === end) { found = i; rev = true; break; }
      }
      if (found < 0) break;
      let s = segs.splice(found, 1)[0]; if (rev) s = s.reverse();
      cur = cur.concat(s.slice(1));
    }
    if (cur.length >= 4) rings.push(closeRing(cur));
  }
  return rings;
}
// 矩形裁剪（Sutherland–Hodgman）
function clipRect(poly, x0, z0, x1, z1) {
  const edges = [[p => p[0] >= x0, (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + t * (b[1] - a[1])]; }],
    [p => p[0] <= x1, (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + t * (b[1] - a[1])]; }],
    [p => p[1] >= z0, (a, b) => { const t = (z0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), z0]; }],
    [p => p[1] <= z1, (a, b) => { const t = (z1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), z1]; }]];
  let out = poly;
  for (const [inside, inter] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (inside(b)) { if (!inside(a)) out.push(inter(a, b)); out.push(b); } else if (inside(a)) out.push(inter(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

const BTYPE = ['yes','residential','apartments','house','terrace','commercial','office','retail','industrial','warehouse','church','cathedral','chapel','university','college','school','hospital','hotel','train_station','transportation','public','civic','government','museum','theatre','roof','construction','garage','other'];
const bt = s => { const i = BTYPE.indexOf(s); return i < 0 ? BTYPE.length - 1 : i; };
const ROOFS = ['flat','gabled','hipped','pyramidal','dome','onion','skillion','mansard','round','cone','gambrel','other'];
const rsIdx = s => { if (!s) return undefined; const i = ROOFS.indexOf(s); return i < 0 ? ROOFS.length - 1 : i; };
const HW = ['motorway','trunk','primary','secondary','tertiary','unclassified','residential','service','living_street','pedestrian','footway','path','cycleway','steps','trunk_link','primary_link','secondary_link','tertiary_link','track','corridor','other'];
const hwIdx = s => { const i = HW.indexOf(s); return i < 0 ? HW.length - 1 : i; };

const out = { center: [LAT0, LON0], r: R, names, btype: BTYPE, roofs: ROOFS, hw: HW, b: [], roads: [], rail: [], water: [], green: [], pts: {} };
const parts = []; const outlines = [];

function addBuilding(rings, holes, t, isPart) {
  for (let ring of rings) {
    ring = simplify(closeRing(ring));
    if (ring.length < 3) continue;
    const md = minDist(ring);
    let h = num(t.height), lv = num(t['building:levels']), mh = num(t.min_height), ml = num(t['building:min_level']), rl = num(t['roof:levels']), rh = num(t['roof:height']);
    if (md > R + 60) { // 远景：只保留高楼
      if (md > RSKY || !(h >= 40)) continue;
    }
    if (area(ring) < 0) ring.reverse(); // 统一为逆时针（x 东, z 南 坐标系下面积为正）
    const e = { p: flat(ring) };
    if (holes && holes.length) e.hl = holes.map(hh => { hh = simplify(closeRing(hh)); if (area(hh) > 0) hh.reverse(); return flat(hh); }).filter(a => a.length >= 6);
    if (h != null) e.H = +h.toFixed(1);
    if (lv != null) e.L = lv;
    if (rl != null) e.RL = rl;
    if (rh != null) e.RH = +rh.toFixed(1);
    if (mh != null) e.m = +mh.toFixed(1); else if (ml != null) e.ML = ml;
    e.t = bt(isPart ? (t.building || 'yes') : t.building);
    const rs = rsIdx(t['roof:shape']); if (rs != null) e.rs = rs;
    if (t['building:colour']) e.c = t['building:colour'];
    if (t['roof:colour']) e.rc = t['roof:colour'];
    if (t['building:material']) e.mat = t['building:material'];
    if (t['roof:material']) e.rm = t['roof:material'];
    if (t.name) e.n = N(t.name);
    const op = (t.operator || '') + ' ' + (t.name || '') + ' ' + (t['addr:housename'] || '');
    if (/King's College|King’s College|KCL/i.test(op)) e.k = 1;
    if (t.shop || t.amenity === 'restaurant' || t.amenity === 'cafe' || t.amenity === 'pub' || t.amenity === 'bank') e.s = 1;
    if (t.historic || t.heritage || t.listed_status) e.hi = 1;
    if (t.start_date) { const y = parseInt(t.start_date); if (y) e.y = y; }
    if (md > R + 60) e.sky = 1;
    if (isPart) { e.pt = 1; parts.push(e); } else outlines.push(e);
    out.b.push(e);
  }
}

const els = raw.elements;
for (const el of els) {
  const t = el.tags || {};
  if (el.type === 'node') {
    const [x, z] = P(el.lat, el.lon); if (Math.hypot(x, z) > R + 80) continue;
    const put = (k, v) => { (out.pts[k] = out.pts[k] || []).push(...v); };
    if (t.natural === 'tree') put('tree', [q(x), q(z)]);
    else if (t.highway === 'crossing') put('cross', [q(x), q(z), t.crossing === 'zebra' || t.crossing_ref === 'zebra' ? 1 : t.crossing === 'traffic_signals' ? 2 : 0]);
    else if (t.highway === 'traffic_signals') put('signal', [q(x), q(z)]);
    else if (t.highway === 'bus_stop') put('bus', [q(x), q(z), N(t.name) ?? -1]);
    else if (t.highway === 'street_lamp') put('lamp', [q(x), q(z)]);
    else if (t.amenity === 'post_box') put('post', [q(x), q(z)]);
    else if (t.amenity === 'telephone') put('phone', [q(x), q(z)]);
    else if (t.amenity === 'bench') put('bench', [q(x), q(z)]);
    else if (t.amenity === 'waste_basket') put('bin', [q(x), q(z)]);
    else if (t.railway === 'subway_entrance') put('tube', [q(x), q(z), N(t.name) ?? -1]);
    continue;
  }
  if (el.type === 'way') {
    if (!el.geometry) continue;
    const g = ringFromGeom(el.geometry);
    const closed = el.nodes && el.nodes[0] === el.nodes[el.nodes.length - 1];
    if (t.building || t['building:part']) { if (closed || g.length > 3) addBuilding([g], null, t, !t.building && !!t['building:part']); continue; }
    if (t.highway) {
      if (t.tunnel && t.tunnel !== 'no' && t.tunnel !== 'building_passage') continue;
      if (t.highway === 'proposed' || t.highway === 'construction' || t.highway === 'elevator' || t.highway === 'platform') continue;
      if (minDist(g) > R + 150) continue;
      if (t.area === 'yes' && closed) { out.green.push({ p: flat(simplify(closeRing(g))), k: 'plaza' }); continue; }
      const e = { p: flat(g), t: hwIdx(t.highway) };
      if (t.name) e.n = N(t.name);
      const w = num(t.width); if (w) e.w = w;
      const ln = num(t.lanes); if (ln) e.l = ln;
      if (t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout') e.o = 1; else if (t.oneway === '-1') e.o = -1;
      if (t.bridge && t.bridge !== 'no') e.b = 1;
      if (t.layer) e.ly = num(t.layer);
      if (t.footway === 'sidewalk' || t.footway === 'crossing') e.sw = 1;
      if (t.busway || t['bus:lanes'] || /bus/.test(t['lanes:psv'] || '')) e.bus = 1;
      out.roads.push(e); continue;
    }
    if (t.railway) {
      if (t.tunnel && t.tunnel !== 'no') continue; if (minDist(g) > R + 300) continue;
      const e = { p: flat(g) }; if (t.bridge && t.bridge !== 'no') e.b = 1; if (t.layer) e.ly = num(t.layer); if (t.service) e.sv = 1; out.rail.push(e); continue;
    }
    if (t.natural === 'water') { if (closed) out.water.push(flat(closeRing(g))); continue; }
    if (t.man_made === 'pier') { out.green.push({ p: flat(closeRing(g)), k: closed ? 'pier' : 'pierl' }); continue; }
    if (closed && (t.leisure || t.landuse || t.amenity === 'grave_yard')) { if (minDist(g) > R + 200) continue; out.green.push({ p: flat(simplify(closeRing(g))), k: t.leisure || t.landuse || 'grave_yard' }); continue; }
  }
  if (el.type === 'relation') {
    const outer = [], inner = [];
    for (const m of el.members || []) { if (m.type !== 'way' || !m.geometry) continue; (m.role === 'inner' ? inner : outer).push(ringFromGeom(m.geometry.filter(Boolean))); }
    const oR = assemble(outer), iR = assemble(inner);
    if (t.building || t['building:part']) { for (const r of oR) addBuilding([r], iR.filter(h => h.length > 2), t, !t.building); continue; }
    if (t.natural === 'water') { for (const r of oR) { const c = clipRect(r, -RSKY, -RSKY, RSKY, RSKY); if (c.length > 2) out.water.push(flat(simplify(c, 1))); } out.waterHoles = (out.waterHoles || []).concat(iR.map(r => flat(simplify(r, 1)))); continue; }
    if (t.leisure) { for (const r of oR) out.green.push({ p: flat(simplify(r)), k: t.leisure }); }
  }
}
// 有 building:part 的外轮廓不渲染（仅保留碰撞）
function inPoly(x, z, f) { let ins = false; for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) { const xi = f[i], zi = f[i + 1], xj = f[j], zj = f[j + 1]; if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) ins = !ins; } return ins; }
const grid = new Map(); const GK = (x, z) => Math.floor(x / 500) + ',' + Math.floor(z / 500);
for (const p of parts) { let cx = 0, cz = 0; const n = p.p.length / 2; for (let i = 0; i < p.p.length; i += 2) { cx += p.p[i]; cz += p.p[i + 1]; } cx /= n; cz /= n; p._c = [cx, cz]; const k = GK(cx, cz); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
let hidden = 0;
for (const o of outlines) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < o.p.length; i += 2) { x0 = Math.min(x0, o.p[i]); x1 = Math.max(x1, o.p[i]); z0 = Math.min(z0, o.p[i + 1]); z1 = Math.max(z1, o.p[i + 1]); }
  let found = false;
  for (let gx = Math.floor(x0 / 500); gx <= Math.floor(x1 / 500) && !found; gx++) for (let gz = Math.floor(z0 / 500); gz <= Math.floor(z1 / 500) && !found; gz++) {
    for (const p of grid.get(gx + ',' + gz) || []) { if (inPoly(p._c[0], p._c[1], o.p)) { found = true; break; } } }
  if (found) { o.hp = 1; hidden++; } }
for (const p of parts) delete p._c;
const js = 'window.CITY=' + JSON.stringify(out) + ';\n';
fs.writeFileSync(outFile, js);
const cnt = k => (out.pts[k] || []).length;
console.log(`buildings ${out.b.length} (parts ${parts.length}, outlines hidden ${hidden}, skyline ${out.b.filter(b => b.sky).length})`);
console.log(`roads ${out.roads.length} rail ${out.rail.length} water ${out.water.length} green ${out.green.length} names ${names.length}`);
console.log(`trees ${cnt('tree') / 2} crossings ${cnt('cross') / 3} signals ${cnt('signal') / 2} bus ${cnt('bus') / 3} lamps ${cnt('lamp') / 2} post ${cnt('post') / 2} phone ${cnt('phone') / 2} bench ${cnt('bench') / 2} tube ${cnt('tube') / 3}`);
console.log(`size ${(js.length / 1048576).toFixed(2)} MB`);
