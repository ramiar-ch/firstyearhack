// The patrol graph follows connected road segments through junctions.
export function buildPatrolRoads(edges) {
  const junctions = new Map();
  const points = [];
  function point(x, z) {
    const p = { x, z, neighbours: [] };
    points.push(p);
    return p;
  }
  function junction(node, x, z) {
    if (!junctions.has(node)) junctions.set(node, point(x, z));
    return junctions.get(node);
  }
  for (const { a, b, pts } of edges) {
    let prev = junction(a, ...pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const [x, z] = pts[i - 1];
      const [ex, ez] = pts[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(ex - x, ez - z) / 8));
      for (let j = 1; j <= steps; j++) {
        const next = i === pts.length - 1 && j === steps ? junction(b, ex, ez)
          : point(x + (ex - x) * j / steps, z + (ez - z) * j / steps);
        prev.neighbours.push(next);
        next.neighbours.push(prev);
        prev = next;
      }
    }
  }
  return points;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function route(start, target) {
  const parent = new Map([[start, null]]);
  const queue = [start];
  let closest = start;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p === target) { closest = p; break; }
    if (distance(p, target) < distance(closest, target)) closest = p;
    for (const n of p.neighbours) {
      if (parent.has(n)) continue;
      parent.set(n, p);
      queue.push(n);
    }
  }
  const path = [];
  for (let p = closest; p; p = parent.get(p)) path.push(p);
  return path.reverse();
}

export function nearestPatrolPoint(roads, pos) {
  return roads.reduce((best, point) => distance(point, pos) < distance(best, pos) ? point : best);
}
