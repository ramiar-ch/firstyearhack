const CityTraffic = (() => {
  function footprint(x, z, yaw, width, length) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const hw = width / 2, hl = length / 2;
    return {x, z, fx, fz, hw, hl,
      ex: Math.abs(fz) * hw + Math.abs(fx) * hl,
      ez: Math.abs(fx) * hw + Math.abs(fz) * hl};
  }

  function reaches(a, b, ax, az) {
    const distance = Math.abs((b.x - a.x) * ax + (b.z - a.z) * az);
    const extent = box => Math.abs(box.fz * ax - box.fx * az) * box.hw +
      Math.abs(box.fx * ax + box.fz * az) * box.hl;
    return distance < extent(a) + extent(b);
  }

  function vehicleOverlap(a, b) {
    if (Math.abs(a.x - b.x) >= a.ex + b.ex || Math.abs(a.z - b.z) >= a.ez + b.ez) return false;
    return reaches(a, b, a.fx, a.fz) && reaches(a, b, a.fz, -a.fx) &&
      reaches(a, b, b.fx, b.fz) && reaches(a, b, b.fz, -b.fx);
  }

  function circleOverlap(box, x, z, radius) {
    const dx = x - box.x, dz = z - box.z;
    const across = Math.max(0, Math.abs(dx * box.fz - dz * box.fx) - box.hw);
    const along = Math.max(0, Math.abs(dx * box.fx + dz * box.fz) - box.hl);
    return across * across + along * along < radius * radius;
  }

  function wallOverlap(box, ax, az, bx, bz) {
    const mx = (ax + bx) / 2 - box.x, mz = (az + bz) / 2 - box.z;
    const dx = (bx - ax) / 2, dz = (bz - az) / 2;
    const x = mx * box.fz - mz * box.fx, z = mx * box.fx + mz * box.fz;
    const sx = dx * box.fz - dz * box.fx, sz = dx * box.fx + dz * box.fz;
    return Math.abs(x) <= box.hw + Math.abs(sx) && Math.abs(z) <= box.hl + Math.abs(sz) &&
      Math.abs(x * sz - z * sx) <= box.hw * Math.abs(sz) + box.hl * Math.abs(sx);
  }

  function createSpace(cellSize = 12, overlaps = vehicleOverlap) {
    const cells = new Map(), occupancy = new Map();
    function eachCell(box, visit) {
      const minX = Math.floor((box.x - box.ex) / cellSize), maxX = Math.floor((box.x + box.ex) / cellSize);
      const minZ = Math.floor((box.z - box.ez) / cellSize), maxZ = Math.floor((box.z + box.ez) / cellSize);
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (visit(x * 100003 + z)) return true;
        }
      }
      return false;
    }
    return {
      remove(actor) {
        const occupied = occupancy.get(actor);
        if (!occupied) return;
        for (const key of occupied.keys) {
          const cell = cells.get(key);
          cell.delete(actor);
          if (!cell.size) cells.delete(key);
        }
        occupancy.delete(actor);
      },
      place(actor, box) {
        const previous = occupancy.get(actor);
        const first = Math.floor((box.x-box.ex)/cellSize)*100003 + Math.floor((box.z-box.ez)/cellSize);
        const last = Math.floor((box.x+box.ex)/cellSize)*100003 + Math.floor((box.z+box.ez)/cellSize);
        if (previous && first === previous.keys[0] && last === previous.keys.at(-1)) {
          previous.box = box;
          return;
        }
        this.remove(actor);
        const keys = [];
        eachCell(box, key => {
          keys.push(key);
          if (!cells.has(key)) cells.set(key, new Set());
          cells.get(key).add(actor);
        });
        occupancy.set(actor, {box, keys});
      },
      hit(box, ignore, alsoIgnore) {
        let found;
        eachCell(box, key => {
          const cell = cells.get(key);
          if (!cell) return false;
          for (const actor of cell) {
            if (actor !== ignore && actor !== alsoIgnore && overlaps(box, occupancy.get(actor).box)) {
              found = actor;
              return true;
            }
          }
          return false;
        });
        return found;
      },
    };
  }

  function canRecycle(x, z, anchors, clearance, visible) {
    const clearanceSq = clearance * clearance;
    return anchors.every(p => (p.x-x)**2 + (p.z-z)**2 > clearanceSq) && !visible(x,z);
  }

  function sweepPedestrians(start, end, radius, boxAt, space, push) {
    const dx = end.x-start.x, dz = end.z-start.z, turn = end.yaw-start.yaw;
    const travel = Math.hypot(dx,dz) + Math.abs(turn)*radius;
    if (!travel) return {pose:end, hit:null};
    const broad = footprint((start.x+end.x)/2, (start.z+end.z)/2, 0,
      Math.abs(dx)+2*radius, Math.abs(dz)+2*radius);
    if (!space.hit(broad)) return {pose:end, hit:null};

    const steps = Math.ceil(travel/0.17);
    let pose = start;
    for (let i = 1; i <= steps; i++) {
      const t = i/steps;
      const next = {x:start.x+dx*t, z:start.z+dz*t, yaw:start.yaw+turn*t};
      const box = boxAt(next);
      let pedestrian;
      while ((pedestrian = space.hit(box))) {
        if (!push(pedestrian, box, boxAt(pose))) return {pose, hit:pedestrian};
      }
      pose = next;
    }
    return {pose:end, hit:null};
  }

  function pedestrianEgress(pedestrian, box, radius, isFree) {
    const across = (pedestrian.x-box.x)*box.fz - (pedestrian.z-box.z)*box.fx;
    const side = across < 0 ? -1 : 1;
    for (const direction of [side,-side]) {
      const offset = direction*(box.hw+radius+0.09)-across;
      if (Math.abs(offset) > box.hw+radius+0.35) continue;
      const x = pedestrian.x + box.fz*offset, z = pedestrian.z - box.fx*offset;
      if (isFree(x,z)) return {x,z};
    }
    return null;
  }

  // Step the fastest-moving corner as well as the centre, and stop at the last clear pose.
  function sweep(start, dx, dz, turn, radius, blocked) {
    const travel = Math.hypot(dx, dz) + Math.abs(turn) * radius;
    const steps = Math.max(1, Math.ceil(travel / 0.17));
    let pose = start;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const next = {x: start.x + dx * t, z: start.z + dz * t, yaw: start.yaw + turn * t};
      const hit = blocked(next);
      if (hit) {
        // Closing in on the contact avoids leaving a visible gap from the discrete step.
        let low = (i - 1) / steps, high = t;
        for (let j = 0; j < 5; j++) {
          const mid = (low + high) / 2;
          const test = {x: start.x + dx * mid, z: start.z + dz * mid, yaw: start.yaw + turn * mid};
          if (blocked(test)) high = mid;
          else { low = mid; pose = test; }
        }
        return {pose, hit};
      }
      pose = next;
    }
    return {pose, hit: null};
  }

  return {footprint, vehicleOverlap, circleOverlap, wallOverlap, createSpace, canRecycle, sweep, sweepPedestrians, pedestrianEgress};
})();
