// A patrol follows connected road segments and can turn around at junctions.
import * as THREE from 'three';
import { buildCarMesh } from './car.js';

function patrolRoads(edges) {
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

function route(start, target) {
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

export class PolicePatrol {
  constructor(scene, edges) {
    this.roads = patrolRoads(edges);
    this.mesh = buildCarMesh(0xf4f6ff);
    this.mesh.name = 'Police patrol';
    this.mesh.visible = false;
    const bar = new THREE.BoxGeometry(0.75, 0.23, 0.45);
    this.lights = [-1, 1].map(side => {
      const light = new THREE.Mesh(bar, new THREE.MeshBasicMaterial({ color: 0x168aff }));
      light.position.set(side * 0.39, 1.63, 0.25);
      this.mesh.add(light);
      return light;
    });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.22, 3.8),
      new THREE.MeshBasicMaterial({ color: 0x1555ad }));
    stripe.position.y = 0.76;
    this.mesh.add(stripe);
    scene.add(this.mesh);
  }

  nearest(pos) {
    return this.roads.reduce((best, p) => distance(p, pos) < distance(best, pos) ? p : best);
  }

  dispatch(pos) {
    const destination = this.nearest(pos);
    // Search outwards along connected streets for a nearby responding unit.
    const queue = [destination], seen = new Set(queue);
    let spawn = destination;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (distance(p, destination) > distance(spawn, destination)) spawn = p;
      if (distance(spawn, destination) >= 45) break;
      for (const n of p.neighbours) {
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    this.mesh.position.set(spawn.x, 0, spawn.z);
    this.mesh.visible = true;
    this.path = [spawn];
    this.destination = null;
    this.replan = 0;
  }

  update(dt, pos) {
    this.replan -= dt;
    if (this.replan <= 0) {
      const destination = this.nearest(pos);
      if (destination !== this.destination) {
        this.path = route(this.path[0], destination);
        this.destination = destination;
      }
      this.replan = 0.5;
    }
    const flash = Math.floor(performance.now() / 180) % 2;
    this.lights.forEach((light, i) => light.material.color.setHex(i === flash ? 0x77eaff : 0x1032a8));
    let travel = Math.min(16 * dt, Math.max(0, distance(this.mesh.position, pos) - 4.5));
    while (travel > 0) {
      const next = this.path[0], p = this.mesh.position;
      const dx = next.x - p.x, dz = next.z - p.z, d = Math.hypot(dx, dz);
      if (d > 0) {
        const step = Math.min(d, travel);
        this.mesh.rotation.y = Math.atan2(-dx, -dz);
        p.x += dx * step / d;
        p.z += dz * step / d;
        travel -= step;
        if (step < d) break;
      }
      if (this.path.length === 1) break;
      this.path.shift();
    }
  }
}
