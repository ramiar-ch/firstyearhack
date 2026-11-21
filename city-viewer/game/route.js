// game/route.js - find the shortest route ALONG THE ROADS (like a satnav),
// so navigation never goes through buildings.
//
// Uses the viewer's road graph: junctions ("nodes") joined by road pieces
// ("edges", each with its list of points). We run A* (a classic shortest-path
// search) from the junction nearest you to the junction nearest the target,
// then stitch the road points together into one polyline [[x, z], ...].

export class Router {
  /** graph = { nodes: Map, edges: [{ pts, len, a, b }] } (from the viewer's buildGraph) */
  constructor(graph) {
    this.nodes = [...graph.nodes.values()];
    // Each node's position = the matching end of one of its edges.
    for (const n of this.nodes) {
      const e = n.e[0];
      const p = e.a === n ? e.pts[0] : e.pts[e.pts.length - 1];
      n.x = p[0]; n.z = p[1];
    }
    // Only use the BIGGEST connected road network: little cut-off bits (cul-de-sacs,
    // private lanes) would otherwise give "no route" when you snap onto them.
    let main = [];
    const seen = new Set();
    for (const n0 of this.nodes) {
      if (seen.has(n0)) continue;
      const part = [], stack = [n0];
      seen.add(n0);
      while (stack.length) {
        const n = stack.pop();
        part.push(n);
        for (const e of n.e) { const m = e.a === n ? e.b : e.a; if (!seen.has(m)) { seen.add(m); stack.push(m); } }
      }
      if (part.length > main.length) main = part;
    }
    // Grid of nodes (50 m squares) to find the nearest junction quickly.
    this.grid = new Map();
    for (const n of main) {
      const k = cellKey(n.x, n.z);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(n);
    }
  }

  nearestNode(x, z) {
    let best = null, bestD = Infinity;
    for (let r = 0; r <= 4 && !best; r++) { // search outwards ring by ring
      const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
      for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) {
        for (const n of this.grid.get(`${i},${j}`) ?? []) {
          const d = (n.x - x) ** 2 + (n.z - z) ** 2;
          if (d < bestD) { bestD = d; best = n; }
        }
      }
    }
    return best;
  }

  /** Road route from (from) to (to) as [[x, z], ...], or null if none found. */
  route(from, to) {
    const start = this.nearestNode(from.x, from.z), goal = this.nearestNode(to.x, to.z);
    if (!start || !goal) return null;
    if (start === goal) return [[from.x, from.z], [to.x, to.z]];

    // A*: always explore the junction with the lowest (distance so far + straight
    // line to the goal) next. `came` remembers how we reached each junction.
    const h = (n) => Math.hypot(n.x - goal.x, n.z - goal.z);
    const dist = new Map([[start, 0]]);
    const came = new Map();
    const open = new MinHeap();
    open.push(h(start), start);
    const done = new Set();
    while (open.size) {
      const n = open.pop();
      if (n === goal) break;
      if (done.has(n)) continue;
      done.add(n);
      for (const e of n.e) {
        const m = e.a === n ? e.b : e.a;
        const d = dist.get(n) + e.len;
        if (d < (dist.get(m) ?? Infinity)) {
          dist.set(m, d);
          came.set(m, { n, e });
          open.push(d + h(m), m);
        }
      }
    }
    if (!came.has(goal)) return null;

    // Walk back from the goal, collecting road points in the right order.
    const pts = [[to.x, to.z]];
    let n = goal;
    while (n !== start) {
      const { n: prev, e } = came.get(n);
      const road = e.a === prev ? e.pts : [...e.pts].reverse(); // prev -> n
      for (let i = road.length - 1; i >= 1; i--) pts.push(road[i]);
      n = prev;
    }
    pts.push([start.x, start.z], [from.x, from.z]);
    return pts.reverse();
  }
}

/**
 * The point `ahead` metres further along the route from where (pos) is,
 * plus how many metres of road are left to the end.
 */
export function pointAhead(route, pos, ahead) {
  // 1. Find the route segment closest to the player.
  let bestI = 0, bestD = Infinity, bestT = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const [ax, az] = route[i], [bx, bz] = route[i + 1];
    const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((pos.x - ax) * ex + (pos.z - az) * ez) / L2));
    const d = (ax + ex * t - pos.x) ** 2 + (az + ez * t - pos.z) ** 2;
    if (d < bestD) { bestD = d; bestI = i; bestT = t; }
  }
  // 2. The rest of the route, starting from that closest point.
  const [ax, az] = route[bestI], [bx, bz] = route[bestI + 1];
  const rest = [[ax + (bx - ax) * bestT, az + (bz - az) * bestT], ...route.slice(bestI + 1)];
  let remaining = 0;
  for (let i = 0; i < rest.length - 1; i++) remaining += Math.hypot(rest[i + 1][0] - rest[i][0], rest[i + 1][1] - rest[i][1]);
  // 3. Walk `ahead` metres along it.
  let left = ahead;
  for (let i = 0; i < rest.length - 1; i++) {
    const [px, pz] = rest[i], [qx, qz] = rest[i + 1];
    const seg = Math.hypot(qx - px, qz - pz);
    if (seg >= left) { const f = left / (seg || 1); return { x: px + (qx - px) * f, z: pz + (qz - pz) * f, remaining }; }
    left -= seg;
  }
  const end = rest[rest.length - 1];
  return { x: end[0], z: end[1], remaining };
}

const cellKey = (x, z) => `${Math.floor(x / 50)},${Math.floor(z / 50)}`;

/** Tiny priority queue (smallest priority first). */
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(p, v) {
    const a = this.a; a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let s = i;
        if (l < a.length && a[l][0] < a[s][0]) s = l;
        if (r < a.length && a[r][0] < a[s][0]) s = r;
        if (s === i) break;
        [a[i], a[s]] = [a[s], a[i]]; i = s;
      }
    }
    return top[1];
  }
}
