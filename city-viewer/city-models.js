function createCityModels(THREE, mergeGeometries, time) {
  const white = new THREE.Color(0xffffff);

  function geometryBatch() {
    const parts = [];
    return {
      add(geometry, tint = white, limb = 0, dye = 0) {
        const count = geometry.attributes.position.count;
        const color = typeof tint === 'number' ? new THREE.Color(tint) : tint;
        const colors = new Float32Array(count * 3);
        const features = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
          color.toArray(colors, i * 3);
          features[i * 2] = limb;
          features[i * 2 + 1] = dye;
        }
        geometry.deleteAttribute('uv');
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('features', new THREE.BufferAttribute(features, 2));
        parts.push(geometry);
      },
      finish() {
        const merged = mergeGeometries(parts);
        for (const part of parts) part.dispose();
        return merged;
      },
    };
  }

  function box(batch, size, at, color, roll = 0) {
    batch.add(new THREE.BoxGeometry(...size).rotateZ(roll).translate(...at), color);
  }

  function surface(vertices, indices) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  // Cross-sections run from rear to front. Raised sills follow the tyres to form the wheel wells.
  function bodyShell(batch, profile, floor, axles = [], radius = 0, color, shoulder = 0.14) {
    const ends = [profile[0][0], profile.at(-1)[0]];
    const stations = new Set(profile.map(([z]) => z));
    const arch = radius + 0.07;
    for (const axle of axles) {
      const angle = Math.acos((floor - radius) / arch);
      for (let i = -4; i <= 4; i++) stations.add(axle + arch * Math.sin(angle * i / 4));
    }
    const rings = [...stations].sort((a, b) => a - b).filter(z => z >= ends[0] && z <= ends[1]);
    const vertices = [];
    const faces = [];
    const ringSize = 10;
    for (const z of rings) {
      const i = profile.findIndex(([end]) => end >= z && end > ends[0]);
      const [z0, w0, top0] = profile[i - 1];
      const [z1, w1, top1] = profile[i];
      const t = (z - z0) / (z1 - z0);
      const w = THREE.MathUtils.lerp(w0, w1, t);
      const top = THREE.MathUtils.lerp(top0, top1, t);
      let sill = floor;
      for (const axle of axles) {
        const d = z - axle;
        if (Math.abs(d) < arch) sill = Math.max(sill, radius + Math.sqrt(Math.max(0, arch * arch - d * d)));
      }
      const bevel = Math.min(shoulder, (top - sill) * 0.45);
      vertices.push([-w + 0.10, sill, z], [w - 0.10, sill, z], [w, sill + 0.05, z],
        [w, top - bevel, z], [w - 0.024, top - bevel * 0.24, z], [w - 0.075, top, z],
        [-w + 0.075, top, z], [-w + 0.024, top - bevel * 0.24, z], [-w, top - bevel, z], [-w, sill + 0.05, z]);
    }
    for (let r = 1; r < rings.length; r++) {
      for (let i = 0; i < ringSize; i++) {
        const a = (r - 1) * ringSize + i;
        const b = (r - 1) * ringSize + (i + 1) % ringSize;
        faces.push(a,b,b+ringSize,a,b+ringSize,a+ringSize);
      }
    }
    const last = vertices.length - ringSize;
    const caps = vertices.length;
    vertices.push(...vertices.slice(0,ringSize),...vertices.slice(last));
    for (let i = 1; i < ringSize-1; i++) {
      faces.push(caps,caps+i+1,caps+i,caps+ringSize,caps+i+ringSize,caps+i+ringSize+1);
    }
    batch.add(surface(vertices, faces), color);
  }

  function insetPanel(batches, corners, windows, wipers = []) {
    const [a, b, c, d] = corners.map(p => new THREE.Vector3(...p));
    const normal = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
    const point = (u, v) => a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v);
    const quad = (u0, u1, v0, v1) => surface([
      point(u0, v0).toArray(), point(u1, v0).toArray(), point(u1, v1).toArray(), point(u0, v1).toArray(),
    ], [0, 1, 2, 0, 2, 3]);
    // Share edges between the glazing, gasket and body. Slanted side panels
    // aren't always planar, so overlaying a pane used to cut through the paint.
    const sorted = values => [...new Set([0, 1, ...values])].sort((x, y) => x - y);
    const seal = ([left, right, bottom, top]) => [left + 0.010, right - 0.010, bottom + 0.016, top - 0.016];
    const glass = windows.map(seal);
    const u = sorted([...windows, ...glass].flatMap(([l,r]) => [l,r]));
    const v = sorted([...windows, ...glass].flatMap(([, ,b,t]) => [b,t]));
    const within = (panes, x, y) => panes.some(([l,r,b,t]) => x > l && x < r && y > b && y < t);
    for (let j = 1; j < v.length; j++) {
      const y = (v[j-1]+v[j])/2;
      const partAt = i => {
        const x = (u[i-1]+u[i])/2;
        return within(glass,x,y) ? 'glass' : within(windows,x,y) ? 'trim' : 'paint';
      };
      for (let i = 1; i < u.length;) {
        const part = partAt(i);
        let end = i;
        while (end + 1 < u.length && partAt(end + 1) === part) end++;
        batches[part].add(quad(u[i-1],u[end],v[j-1],v[j]),part === 'trim' ? black : white);
        i = end + 1;
      }
    }
    for (const [start, end, rise] of wipers) {
      const pivot = point(start,0.10).addScaledVector(normal,0.024);
      const tip = point(end,0.13+rise).addScaledVector(normal,0.022);
      const centre = pivot.clone().lerp(tip,0.72);
      rod(batches.trim,pivot.toArray(),centre.toArray(),0.010,black,5);
      rod(batches.trim,centre.clone().lerp(tip, -0.5).toArray(),tip.toArray(),0.012,black,5);
    }
  }

  function carCabin(batches, sill, roof, sideWindows) {
    const [rz, fz, rw, fw, y] = sill;
    const [rtz, ftz, rtw, ftw, h] = roof;
    const side = sign => [[sign * rw, y, rz], [sign * fw, y, fz], [sign * ftw, h, ftz], [sign * rtw, h, rtz]];
    const [rl, fl, ftl, rtl] = side(-1);
    const [rr, fr, ftr, rtr] = side(1);
    insetPanel(batches, [rl, fl, ftl, rtl], sideWindows);
    insetPanel(batches, [fr, rr, rtr, ftr], sideWindows.map(([a, b, c, d]) => [1 - b, 1 - a, c, d]));
    insetPanel(batches, [fl, fr, ftr, ftl], [[0.047, 0.953, 0.08, 0.93]], [[0.38, 0.12, 0.10], [0.73, 0.46, 0.09]]);
    insetPanel(batches, [rr, rl, rtl, rtr], [[0.09, 0.91, 0.13, 0.89]], [[0.49, 0.19, 0.14]]);
    bodyShell(batches.paint, [[rtz - 0.05, rtw * 0.92, h + 0.025], [rtz + 0.09, rtw + 0.04, h + 0.075],
      [ftz - 0.10, ftw + 0.04, h + 0.075], [ftz + 0.05, ftw * 0.92, h + 0.025]], h - 0.028, [], 0, white, 0.04);
  }

  const rubber = 0x242628;
  const black = 0x12171c;
  const chrome = 0x9ca5ad;
  const cream = 0xead9b1;

  function roundFace(batch, radius, depth, at, color) {
    batch.add(new THREE.CylinderGeometry(radius, radius, depth, 12).rotateX(Math.PI / 2).translate(...at), color);
  }

  function plate(batch, z, y, width) {
    box(batch, [width + 0.04, 0.13, 0.025], [0, y, z], black);
    box(batch, [width, 0.095, 0.021], [0, y, z + Math.sign(z) * 0.016], z > 0 ? 0xf3f0db : 0xf3c137);
    for (const x of [-0.28, -0.17, -0.06, 0.10, 0.21, 0.31]) {
      box(batch, [width * 0.042, 0.048, 0.008], [width * x, y, z + Math.sign(z) * 0.029], black);
    }
  }

  function tyre(radius, width, heavy, detail) {
    const batch = geometryBatch();
    const h = width / 2;
    const rim = radius * (heavy ? 0.54 : 0.67);
    const profile = [[rim, -h], [radius * 0.86, -h], [radius * 0.965, -h * 0.82],
      [radius, -h * 0.53], [radius, h * 0.53], [radius * 0.965, h * 0.82], [radius * 0.86, h], [rim, h]];
    const points = detail ? profile : profile.filter((_, i) => i !== 2 && i !== 5);
    const segments = detail ? 24 : 12;
    batch.add(new THREE.LatheGeometry(points.map(p => new THREE.Vector2(...p)), segments).rotateZ(-Math.PI / 2), rubber);
    batch.add(new THREE.CylinderGeometry(rim, rim, width + 0.008, segments).rotateZ(-Math.PI / 2), chrome);
    if (!detail) return batch.finish();
    batch.add(new THREE.CylinderGeometry(rim * 0.82, rim * 0.82, width + 0.014, segments).rotateZ(-Math.PI / 2), black);
    const hub = heavy ? 0x7b8388 : 0xb9c1cb;
    batch.add(new THREE.CylinderGeometry(rim * 0.37, rim * 0.37, width + 0.029, 10).rotateZ(-Math.PI / 2), hub);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      const spoke = new THREE.BoxGeometry(width + 0.022, rim * 0.64, rim * 0.15);
      spoke.translate(0, rim * 0.48, 0).rotateX(angle);
      batch.add(spoke, hub);
    }
    for (const side of [-1,1]) {
      batch.add(new THREE.TorusGeometry(rim * 0.91, 0.008, 4, segments).rotateY(Math.PI/2).translate(side*(h+0.012),0,0), hub);
    }
    return batch.finish();
  }

  function passengerBody(b, kind, axles, radius, rearLights) {
    const cab = kind === 'cab';
    const van = kind === 'van';
    const saloon = kind === 'saloon', estate = kind === 'estate';
    const end = van ? 2.65 : saloon ? 2.38 : estate ? 2.48 : cab ? 2.3 : 2.2;
    const w = van ? 1.0 : cab ? 0.94 : saloon || estate ? 0.92 : 0.89;
    const top = van ? 1.27 : cab ? 1.14 : estate ? 1.03 : saloon ? 0.91 : 0.98;
    const stations = [-end, -end + 0.16, -end + 0.55, 0.65, end - 0.36, end - 0.10, end];
    const widths = [0.88, 0.98, 1, 1, 0.99, 0.91, 0.84];
    const heights = [top - 0.18, top - 0.06, top, top, top - 0.04, top - 0.12, top - 0.22];
    bodyShell(b.paint, stations.map((z, i) => [z, w * widths[i], heights[i]]), radius * 0.91, axles, radius);
    const sill = van ? [-2.54, 1.77, 0.94, 0.90, top - 0.07] :
      saloon ? [-1.57, 1.19, 0.84, 0.86, top-0.04] : estate ? [-2.37, 1.16, 0.87, 0.86, top-0.055] :
      cab ? [-1.94, 1.16, 0.86, 0.84, top - 0.06] : [-1.79, 1.00, 0.81, 0.82, top - 0.06];
    const roof = van ? [-2.46, 0.97, 0.86, 0.80, 2.42] :
      saloon ? [-0.83,0.32,0.63,0.67,1.42] : estate ? [-2.01,0.39,0.72,0.71,1.59] :
      cab ? [-1.68, 0.47, 0.73, 0.71, 1.93] : [-1.25, 0.18, 0.64, 0.68, 1.49];
    const panes = van ? [[0.66, 0.96, 0.08, 0.81]] :
      estate ? [[0.065,0.26,0.18,0.87],[0.29,0.59,0.12,0.88],[0.63,0.95,0.12,0.87]] :
      [[0.09, 0.46, 0.12, 0.88], [0.51, 0.95, 0.12, 0.88]];
    carCabin(b, sill, roof, panes);
    if(estate){
      // Satin window belt and rear quarter outline sit just outside the gasket.
      const [rear,front,rearWidth,frontWidth,glassY]=sill;
      for(const side of [-1,1]){
        rod(b.trim,[side*(rearWidth+0.009),glassY+0.06,rear+0.18],
          [side*(frontWidth+0.012),glassY+0.06,front-0.20],0.009,0x8f9393,5);
        rod(b.trim,[side*0.722,1.57,-1.97],[side*0.714,1.57,0.36],0.008,0x797f80,5);
      }
    }

    for (const side of [-1, 1]) {
      const mx = side * (w + 0.045);
      const my = top + (cab ? 0.17 : 0.12);
      const mz = van ? 1.52 : cab ? 0.91 : 0.74;
      box(b.trim, [0.19, 0.04, 0.045], [mx, my - 0.03, mz], black);
      box(b.paint, [0.15, 0.092, 0.16], [mx + side * 0.065, my, mz]);
      box(b.trim, [0.115, 0.06, 0.012], [mx + side * 0.065, my, mz - 0.081], chrome);
      for (const z of van ? [-0.69, 0.79] : [-0.72, 0.31]) {
        box(b.trim, [0.014, 0.045, 0.148], [side * (w + 0.003), top - 0.16, z], black);
        box(b.trim, [0.017, 0.021, 0.106], [side * (w + 0.014), top - 0.155, z], cab ? chrome : 0x697078);
      }
      for (const z of van ? [-1.78,-0.22,1.37] : [-0.99,-0.20,0.81]) {
        const bottom = top - 0.29, sideX = side * (w + 0.005);
        // Thin shut lines follow the doors and meet the sill trim.
        rod(b.trim,[sideX,top-0.077,z],[sideX,bottom,z-0.063],0.0045,0x23282b,4);
      }
      box(b.trim,[0.012,0.035,van?2.9:1.75],[side*(w+0.004),top-0.30,van?-0.30:-0.09],rubber);
      const x = side * w * 0.70;
      if (estate) {
        rod(b.trim,[side*0.57,1.69,-1.80],[side*0.57,1.69,0.21],0.018,0x727776,6);
        for (const z of [-1.73,0.16])box(b.trim,[0.035,0.050,0.080],[side*0.57,1.665,z],black);
      }
      if (cab) {
        roundFace(b.trim, 0.168, 0.080, [x, top - 0.37, end - 0.015], chrome);
        roundFace(b.lights, 0.134, 0.047, [x, top - 0.37, end + 0.028], 0xffeece);
      } else {
        box(b.trim, [0.34, 0.132, 0.073], [x, top - 0.34, end - 0.015], black, side * 0.13);
        box(b.lights, [0.30, 0.077, 0.045], [x, top - 0.34, end + 0.02], 0xeaf4ff, side * 0.13);
        box(b.lights,[0.246,0.012,0.010],[x,top-0.312,end+0.047],0xffffff,side*0.13);
        box(b.lights,[0.044,0.033,0.011],[x+side*0.114,top-0.352,end+0.049],0xdcb17c,side*0.13);
      }
      box(b.trim, [0.24, 0.18, 0.055], [x, top - 0.31, -end], black);
      box(rearLights, [0.20, 0.083, 0.042], [x, top - 0.30, -end - 0.033], 0xe3262c);
      box(b.trim, [0.20, 0.032, 0.045], [x, top - 0.37, -end - 0.03], 0xc98230);
    }
    box(b.trim, [cab ? 0.59 : 0.65, cab ? 0.28 : 0.15, 0.032], [0, top - 0.39, end + 0.01], black);
    for (let i = 0; i < 4; i++) {
      box(b.trim, [0.51, 0.011, 0.012], [0, top - 0.445 + i * 0.027, end + 0.029], cab ? chrome : 0x384147);
    }
    for (const dir of [-1, 1]) {
      box(b.trim, [w * 1.62, 0.096, 0.097], [0, radius + 0.08, dir * (end - 0.012)], rubber);
      plate(b.trim, dir * (end + 0.045), top - 0.46 - (dir > 0 ? 0.15 : 0), 0.43);
    }
    box(b.trim,[w*1.25,0.046,0.028],[0,radius+0.182,end+0.014],0x394044);
    for(const side of [-1,1]){
      box(b.trim,[0.27,0.069,0.024],[side*w*0.64,radius+0.13,end+0.022],black);
      box(b.trim,[0.075,0.055,0.063],[side*w*0.57,radius+0.104,-end-0.026],0x6e7474);
    }
    if (cab) {
      box(b.trim, [0.51, 0.11, 0.25], [0, 2.03, 0.29], black);
      box(b.lights, [0.43, 0.075, 0.245], [0, 2.053, 0.29], 0xe5a039);
    }
  }

  function busPane(batch, x, y, z, width, height) {
    const a = [x - width / 2, y - height / 2, z];
    const b = [x + width / 2, y - height / 2, z];
    const c = [x + width / 2, y + height / 2, z];
    const d = [x - width / 2, y + height / 2, z];
    batch.add(surface(z > 0 ? [a, b, c, d] : [b, a, d, c], [0, 1, 2, 0, 2, 3]));
  }

  function busBody(b, classic, axles, radius) {
    const rear = classic ? -4.30 : -5.60;
    const nose = classic ? 4.30 : 5.60;
    const upperFront = classic ? 3.92 : nose;
    const lowerRear = classic ? -3.31 : rear;
    const w = classic ? 1.22 : 1.26;
    const profile = (from, to, h) => [[from, w - 0.16, h - 0.09], [from + 0.30, w, h],
      [to - 0.30, w, h], [to, w - 0.16, h - 0.09]];
    bodyShell(b.paint, profile(lowerRear, classic ? 3.91 : nose, 2.43), 0.43, axles, radius);
    bodyShell(b.paint, profile(rear, upperFront, 4.34), 2.34, [], 0, white, 0.27);

    for (const side of [-1, 1]) {
      for (const [from, to, height, n] of [[rear + 0.40, upperFront - 0.42, 3.46, classic ? 7 : 8],
        [lowerRear + 0.35, (classic ? 2.55 : nose - 0.45), 1.79, classic ? 5 : 7]]) {
        const step = (to - from) / n;
        for (let i = 0; i < n; i++) {
          const z = from + step * (i + 0.5);
          box(b.trim, [0.023, 0.79, step - 0.075], [side * w, height, z], black);
          box(b.glass, [0.022, 0.72, step - 0.14], [side * (w + 0.014), height + 0.012, z]);
          box(b.trim,[0.017,0.024,step-0.14],[side*(w+0.029),height+0.242,z],0x515456);
        }
      }
      box(b.trim, [0.018, 0.105, upperFront - rear - 0.62], [side * (w + 0.008), 2.51, (upperFront + rear) / 2], classic ? cream : black);
      const mirror = classic ? 3.72 : nose - 0.36;
      box(b.trim, [0.28, 0.052, 0.05], [side * (w + 0.09), 2.01, mirror], black);
      box(b.trim, [0.105, 0.235, 0.13], [side * (w + 0.22), 1.97, mirror], black);
      box(b.trim, [0.069, 0.185, 0.015], [side * (w + 0.22), 1.97, mirror - 0.071], chrome);
      roundFace(b.trim, 0.154, 0.075, [side * 0.91, 0.81, nose - 0.01], black);
      roundFace(b.lights, 0.116, 0.043, [side * 0.91, 0.81, nose + 0.028], 0xffedcf);
      roundFace(b.lights,0.049,0.032,[side*1.05,0.63,nose+0.021],0xdc9d54);
      box(b.lights, [0.19, 0.105, 0.05], [side * 0.87, 0.98, rear - 0.025], 0xe3262c);
      box(b.trim, [0.19, 0.055, 0.05], [side * 0.87, 0.85, rear - 0.025], 0xcb8430);
      busPane(b.glass, side * 0.52, 3.42, upperFront + 0.014, 0.96, 0.66);
    }
    busPane(b.glass, 0, 3.42, rear - 0.014, 1.76, 0.62);
    box(b.trim, [1.34, 0.25, 0.032], [0, 2.81, upperFront + 0.018], black);
    for (const [x, width] of [[-0.44, 0.27], [-0.08, 0.34], [0.35, 0.36]]) {
      box(b.lights, [width, 0.026, 0.016], [x, 2.82, upperFront + 0.04], 0xe1a43b);
      box(b.lights, [width * 0.77, 0.018, 0.016], [x, 2.765, upperFront + 0.04], 0xc3832f);
    }
    if (classic) {
      box(b.paint, [1.03, 1.54, 0.48], [-0.64, 1.27, 4.04]);
      busPane(b.glass, -0.64, 1.73, 4.295, 0.84, 0.58);
      box(b.paint, [1.12, 0.59, 0.49], [0.58, 0.78, 4.05]);
      box(b.trim, [0.77, 0.43, 0.039], [0.49, 0.83, 4.31], black);
      for (let i = 0; i < 7; i++) box(b.trim, [0.71, 0.014, 0.014], [0.49, 0.65 + i * 0.052, 4.336], chrome);
      box(b.paint, [w * 1.86, 0.32, 0.98], [0, 0.49, -3.80]);
      box(b.paint, [1.11, 1.78, 0.89], [-0.595, 1.40, -3.80]);
      box(b.trim, [0.93, 0.085, 0.21], [0.62, 0.31, -4.03], rubber);
      box(b.trim, [0.92, 0.035, 0.63], [0.61, 0.663, -3.78], rubber);
      b.trim.add(new THREE.CylinderGeometry(0.026, 0.026, 1.69, 8).translate(0.77, 1.48, -4.11), cream);
      busPane(b.glass, -0.60, 1.75, -4.26, 0.83, 0.55);
    } else {
      busPane(b.glass, 0, 1.83, nose + 0.014, 1.92, 0.79);
      box(b.trim,[0.032,0.73,0.016],[0,1.84,nose+0.019],black);
      box(b.trim,[0.70,0.095,0.035],[0,0.815,nose+0.024],black);
      for (const z of [nose - 0.84, rear + 0.95]) {
        box(b.trim, [0.025, 1.72, 0.84], [w + 0.022, 1.36, z], black);
        for (const d of [-0.20, 0.20]) box(b.glass, [0.019, 1.30, 0.33], [w + 0.039, 1.47, z + d]);
      }
    }
    const ventZ=rear+0.125;
    for(let i=0;i<6;i++)box(b.trim,[classic?0.76:1.43,0.021,0.037],[classic?-0.53:0,0.91+i*0.063,ventZ-0.143],0x292f30);
    box(b.trim, [w * 1.89, 0.14, 0.15], [0, 0.51, nose - 0.03], rubber);
    plate(b.trim, nose + 0.057, 0.50, 0.46);
    plate(b.trim, rear - 0.052, 0.52, 0.46);
  }

  function vehicle(kind, {separateBrakeLights = false} = {}) {
    const heavy = kind === 'bus' || kind === 'routemaster';
    const classic = kind === 'routemaster';
    const axles = classic ? [-1.85, 2.75] : kind === 'bus' ? [-3.40, 3.80] :
      kind === 'van' ? [-1.70, 1.70] : kind === 'cab' ? [-1.44, 1.44] :
      kind === 'estate' ? [-1.52,1.46] : kind === 'saloon' ? [-1.47,1.37] : [-1.38, 1.35];
    const radius = heavy ? 0.50 : kind === 'car' ? 0.32 : kind === 'saloon' || kind === 'estate' ? 0.34 : 0.36;
    const track = heavy ? 1.08 : kind === 'van' ? 0.87 : kind === 'cab' ? 0.82 : 0.77;
    const b = {paint: geometryBatch(), trim: geometryBatch(), glass: geometryBatch(), lights: geometryBatch()};
    const rearLights = !heavy && separateBrakeLights ? geometryBatch() : b.lights;
    if (heavy) busBody(b, classic, axles, radius);
    else passengerBody(b, kind, axles, radius, rearLights);
    const width = heavy ? 0.28 : 0.24;
    const wheel = tyre(radius, width, heavy, true);
    const trafficWheel = tyre(radius, width, heavy, false);
    const wheels = axles.flatMap((z, axle) => [-track, track].map(x => ({x, y: radius, z, front: axle === 1})));
    const dual = (source,x)=>{
      const inner=source.clone().translate(-Math.sign(x)*(width+0.036),0,0);
      const geometry=mergeGeometries([source,inner]);
      inner.dispose();
      return geometry;
    };
    if(heavy)for(const axle of wheels){if(!axle.front)axle.geometry=dual(wheel,axle.x);}
    const geometry = Object.fromEntries(Object.entries(b).map(([key, batch]) => [key, batch.finish()]));
    const parkedWheels = wheels.map(({x,y,z,front}) => (heavy&&!front?dual(trafficWheel,x):trafficWheel.clone()).translate(x,y,z));
    const trafficTrim = mergeGeometries([geometry.trim, ...parkedWheels]);
    parkedWheels.forEach(g => g.dispose());
    trafficWheel.dispose();
    return {geometry, trafficTrim, wheels, wheel, brakeLights: rearLights === b.lights ? null : rearLights.finish()};
  }

  function policeEquipment() {
    const trim = geometryBatch(), lenses = [];
    const navy = 0x245583, yellow = 0xd9bf53;
    for (const side of [-1, 1]) {
      for (let row=0; row<2; row++) for (let i=0; i<6; i++) {
        const z = -1.24 + i*0.46;
        const pane = new THREE.PlaneGeometry(0.43, 0.084).rotateY(side*Math.PI/2);
        trim.add(pane.translate(side*0.897, 0.688 + row*0.088, z), (i+row)%2 ? navy : yellow);
      }
      for (let i=0; i<3; i++) {
        const chevron = new THREE.PlaneGeometry(0.07, 0.15).rotateZ(side*0.52).rotateY(Math.PI);
        trim.add(chevron.translate(side*(0.12+i*0.105), 0.703, -2.205), i%2?0xb84c36:yellow);
      }
    }
    box(trim,[1.06,0.044,0.25],[0,1.573,-0.29],black);
    box(trim,[0.10,0.064,0.215],[0,1.62,-0.29],chrome);
    for(const side of [-1,1]) {
      const lens = geometryBatch();
      box(lens,[0.44,0.084,0.209],[side*0.27,1.628,-0.29],0x467dd8);
      box(lens,[0.045,0.068,0.214],[side*0.487,1.628,-0.29],0x8fbcf2);
      for (const offset of [0,0.12,0.24]) {
        box(lens,[0.072,0.037,0.008],[side*(0.142+offset),1.631,-0.398],0x92b3e6);
        box(lens,[0.072,0.037,0.008],[side*(0.142+offset),1.631,-0.182],0x92b3e6);
      }
      lenses.push(lens.finish());
    }
    return {trim:trim.finish(),lenses};
  }

  function vehicleMaterials() {
    return {
      paint: new THREE.MeshPhysicalMaterial({vertexColors: true, roughness: 0.31, metalness: 0.13, clearcoat: 0.74, clearcoatRoughness: 0.15}),
      trim: new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.67, metalness: 0.12}),
      glass: new THREE.MeshPhysicalMaterial({vertexColors: true, color: 0x20292c, roughness: 0.22, metalness: 0, ior: 1.5,
        clearcoat: 0.55, clearcoatRoughness: 0.14, side: THREE.FrontSide}),
      lights: new THREE.MeshBasicMaterial({vertexColors: true}),
    };
  }

  function rod(batch, from, to, radius, color, segments = 8) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const delta = b.clone().sub(a), mid = a.lerp(b, 0.5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    batch.add(new THREE.CylinderGeometry(radius, radius, delta.length(), segments).applyQuaternion(rotation)
      .translate(mid.x, mid.y, mid.z), color);
  }

  function bicycle() {
    const frame = geometryBatch(), trim = geometryBatch(), fork = geometryBatch(), rims = geometryBatch();
    const y = 0.345, rearZ = -0.64, frontZ = 0.62, steerer = 0.52;
    const back = [0, y, rearZ], crank = [0, 0.39, -0.12], seat = [0, 0.81, -0.32], head = [0, 0.79, steerer];
    for (const [a, b, radius] of [[back, crank, 0.024], [back, seat, 0.022], [crank, seat, 0.034], [crank, head, 0.051],
      [[0, 0.61, -0.26], head, 0.033]]) rod(frame, a, b, radius);
    rod(trim, seat, [0, 0.88, -0.34], 0.018, chrome);
    box(trim, [0.15, 0.054, 0.25], [0, 0.895, -0.35], black);
    box(trim, [0.13, 0.039, 0.25], [0, 0.70, -0.63], rubber);
    box(trim, [0.075, 0.046, 0.025], [0, 0.70, -0.768], 0xbd1d27);
    const mudguard = (batch, offset, tint) => {
      const points=Array.from({length:9},(_,i)=>{
        const angle=(i/8-0.5)*2.05;
        return new THREE.Vector3(0,y+Math.cos(angle)*0.365,offset+Math.sin(angle)*0.365);
      });
      batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),10,0.018,5,false),tint);
    };
    mudguard(trim,rearZ,rubber);
    mudguard(fork,frontZ-steerer,rubber);
    rod(trim,[0.06,y,rearZ],[0.08,0.39,-0.12],0.017,0x444c4b,6);
    trim.add(new THREE.CylinderGeometry(0.104,0.104,0.025,14).rotateZ(Math.PI/2).translate(0.07,0.39,-0.12),0x596362);
    for (const side of [-1, 1]) {
      rod(fork, [side * 0.055, y, frontZ - steerer], [side * 0.046, 0.76, 0], 0.024, chrome);
      rod(fork, [0, 1.035, -0.045], [side * 0.20, 1.045, -0.09], 0.014, chrome);
      rod(fork, [side * 0.20, 1.045, -0.09], [side * 0.286, 1.045, -0.132], 0.021, rubber);
      rod(fork,[side*0.205,1.035,-0.084],[side*0.268,1.017,-0.052],0.010,black,5);
      for(const y of [0.844,0.884,0.924]){
        box(fork, [0.022,0.019,0.217], [side*0.14,y,0.154], rubber);
      }
      for(const z of [0.056,0.252])box(fork,[0.024,0.129,0.021],[side*0.14,0.887,z],black);
    }
    rod(fork, [0, 0.71, 0.035], [0, 1.035, -0.045], 0.025, chrome);
    box(fork, [0.28, 0.034, 0.21], [0, 0.823, 0.154], black);
    for(const y of [0.845,0.885,0.925])box(fork,[0.28,0.018,0.024],[0,y,0.25],rubber);
    box(fork,[0.28,0.016,0.025],[0,0.951,0.25],black);
    box(fork,[0.093,0.052,0.020],[0,0.896,0.258],black);
    box(fork, [0.077, 0.047, 0.028], [0, 0.895, 0.268], 0xe9e9d7);
    rims.add(new THREE.TorusGeometry(0.318, 0.027, 6, 24).rotateY(Math.PI / 2), rubber);
    rims.add(new THREE.TorusGeometry(0.293, 0.011, 5, 24).rotateY(Math.PI / 2), chrome);
    rims.add(new THREE.CylinderGeometry(0.035, 0.035, 0.099, 8).rotateZ(Math.PI / 2), chrome);
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      rod(rims, [i % 2 ? 0.034 : -0.034, 0, 0], [0, 0.289 * Math.cos(angle), 0.289 * Math.sin(angle)], 0.003, chrome, 4);
    }
    return {geometry: {paint: frame.finish(), trim: trim.finish()}, fork: fork.finish(), steerer,
      wheels: [{x:0,y,z:rearZ,front:false},{x:0,y,z:frontZ,front:true}], wheel: rims.finish()};
  }

  // The shoes follow the same crank phase as the pedals, with the knees bending forward.
  function cyclist(accent = 0x35596a) {
    const group = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({color: accent, roughness: 0.87});
    const pants = new THREE.MeshStandardMaterial({color: 0x252e3c, roughness: 0.88});
    const skin = new THREE.MeshStandardMaterial({color: 0xbf8e70, roughness: 0.86});
    const shoe = new THREE.MeshStandardMaterial({color: 0x282b30, roughness: 0.9});
    const helmet = new THREE.MeshStandardMaterial({color: 0xe4e3d9, roughness: 0.62});
    function mesh(geo, mat) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      group.add(m);
      return m;
    }
    function ball(size, at, mat) {
      const m = mesh(new THREE.SphereGeometry(1, 10, 7), mat);
      m.scale.set(...size);
      m.position.set(...at);
      return m;
    }
    function limb(radius, mat) { return mesh(new THREE.CylinderGeometry(radius * 0.84, radius, 1, 7), mat); }
    function connect(limb, a, b) {
      const dir = b.clone().sub(a);
      limb.position.copy(a).addScaledVector(dir, 0.5);
      limb.scale.y = dir.length();
      limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    }
    ball([0.171, 0.274, 0.127], [0, 1.145, -0.217], jacket).rotation.x = 0.44;
    ball([0.085, 0.107, 0.092], [0, 1.44, -0.092], skin);
    ball([0.105, 0.070, 0.123], [0, 1.505, -0.088], helmet);
    const legs = [-1, 1].map(side => {
      const elbow = new THREE.Vector3(side * 0.245, 1.165, 0.048);
      connect(limb(0.055, jacket), new THREE.Vector3(side * 0.154, 1.304, -0.133), elbow);
      connect(limb(0.043, jacket), elbow, new THREE.Vector3(side * 0.255, 1.06, 0.38));
      ball([0.037, 0.027, 0.039], [side * 0.254, 1.063, 0.386], skin);
      return {side, upper:limb(0.075,pants),lower:limb(0.053,pants),foot:ball([0.057,0.036,0.112],[0,0,0],shoe)};
    });
    const hip = new THREE.Vector3(), knee = new THREE.Vector3(), foot = new THREE.Vector3();
    function pedal(phase) {
      for (const {side,upper,lower,foot:mesh} of legs) {
        const angle = phase + (side > 0 ? Math.PI : 0);
        hip.set(side * 0.105, 0.958, -0.316);
        foot.set(side * 0.125, 0.441 + 0.157 * Math.sin(angle), -0.12 + 0.157 * Math.cos(angle));
        knee.copy(hip).lerp(foot, 0.49);
        knee.z += 0.245 + 0.045 * Math.sin(angle);
        connect(upper, hip, knee);
        connect(lower, knee, foot);
        mesh.position.copy(foot);
        mesh.position.z += 0.046;
      }
    }
    pedal(0);
    return {group,pedal};
  }

  // The detailed mesh is used at street level. Both meshes use the same joint positions.
  function pedestrianGeometry(detail, style = 'man') {
    const batch = geometryBatch();
    const radial = detail ? 10 : 5;
    const woman = style === 'woman' || style === 'olderWoman';
    const older = style === 'older' || style === 'olderWoman';
    const child = style === 'child', teen = style === 'teen', worker = style === 'worker';
    function oval(size, at, color, limb = 0, dye = 0) {
      batch.add(new THREE.SphereGeometry(1, radial, detail ? 6 : 3).scale(...size).translate(...at), color, limb, dye);
    }
    function tapered(top, bottom, length, depth, at, color, limb, dye) {
      batch.add(new THREE.CylinderGeometry(top, bottom, length, radial, 1, !detail).scale(1, 1, depth).translate(...at), color, limb, dye);
    }
    const longCoat = woman || older;
    const jacket = [[0, longCoat ? 0.72 : 0.86], [0.14, longCoat ? 0.72 : 0.86], [woman ? 0.206 : 0.19, longCoat ? 0.79 : 0.91],
      [woman ? 0.155 : 0.179, 1.09], [woman ? 0.182 : 0.202, 1.34], [woman ? 0.158 : 0.187, 1.46],
      [0.112, 1.53], [0.063, 1.54], [0, 1.54]];
    batch.add(new THREE.LatheGeometry(jacket.map(p => new THREE.Vector2(...p)), radial).scale(1, 1, 0.67), white, 0, 1);
    const legProfile = [[0.044, 0.074], [0.049, 0.23], [0.061, 0.47], [0.086, 0.78], [0.085, 0.90]];
    for (const side of [-1, 1]) {
      const x = side * 0.096;
      const leg = new THREE.LatheGeometry(legProfile.map(p => new THREE.Vector2(...p)), radial);
      batch.add(leg.scale(1, 1, 1.04).translate(x, 0, 0), 0xb2bac2, side, 3);
      oval([0.063, 0.043, 0.125], [x, 0.043, 0.055], 0x282b2f, side);
      tapered(0.062, 0.051, 0.26, 0.96, [side * 0.215, 1.306, 0], white, side * 2, 1);
      tapered(0.052, 0.037, 0.252, 0.94, [side * 0.231, 1.062, 0.007], 0xe6e6e4, side * 3, 1);
      oval([0.039, 0.064, 0.033], [side * 0.234, 0.891, 0.016], white, side * 3, 2);
      if (detail) {
        oval([0.065, 0.080, 0.064], [side * 0.202, 1.422, 0], white, side * 2, 1);
        oval([0.052, 0.053, 0.047], [side * 0.228, 1.185, 0.005], 0xe8e9e7, side * 3, 1);
        oval([0.063, 0.012, 0.121], [x, 0.012, 0.053], 0x525158, side);
        oval([0.018, 0.031, 0.020], [side * 0.090, 1.646, 0.005], 0xe4c6b0, 0, 2);
        const pocket = new THREE.BoxGeometry(0.008, 0.087, 0.010).rotateZ(side * -0.47);
        batch.add(pocket.translate(side * 0.105, 1.045, 0.108), 0x676b70, 0, 1);
        if(!child&&!worker){
          const seam = new THREE.BoxGeometry(0.009,0.155,0.009).rotateZ(side*0.23);
          batch.add(seam.translate(side*0.145,1.298,0.088),0x8c8b8c,0,1);
        }
        tapered(0.041,0.037,0.036,0.94,[side*0.233,0.938,0.012],0xb1b4b4,side*3,1);
      }
    }
    tapered(0.052, 0.058, 0.13, 0.94, [0, 1.544, 0.009], 0xe8d4c4, 0, 2);
    const headRadial = detail ? 12 : 6;
    const headSize = child ? 1.19 : 1;
    batch.add(new THREE.SphereGeometry(1, headRadial, detail ? 8 : 4)
      .scale(0.089 * headSize, 0.113 * headSize, 0.092 * headSize).translate(0, 1.660, 0.013), white, 0, 2);
    const hair = new THREE.SphereGeometry(1, headRadial, detail ? 6 : 3, 0, Math.PI * 2, 0, Math.PI * 0.465);
    hair.rotateX(-0.21).scale(0.095 * headSize, 0.117 * headSize, 0.101 * headSize).translate(0, 1.671, 0.003);
    batch.add(hair, older ? 0xa4a29d : 0x392b27, 0, older ? 0 : 4);
    if (woman && !older) oval([0.083, 0.147, 0.084], [0, 1.565, -0.048], 0x392b27, 0, 4);
    if (older) {
      oval([0.104,0.043,0.073],[0,1.496,0.037],woman?0x9b5f57:0x6e6958);
      if(woman)oval([0.044,0.119,0.021],[0.052,1.399,0.117],0x93584f);
    }
    if (child || teen) {
      oval([0.146, 0.194, 0.086], [0, 1.232, -0.133], teen?0x41484b:0x76908c, 0, child?1:0);
      oval([0.081, 0.034, 0.064], [0, 1.439, -0.153], 0x283845);
      if(teen)oval([0.098,0.062,0.104],[0,1.504,-0.075],0xbcbdbe,0,1);
      for(const side of [-1,1])box(batch,[0.027,0.38,0.022],[side*0.094,1.254,0.122],0x41494c,side*-0.07);
    }
    if(worker){
      oval([0.100,0.041,0.110],[0,1.766,0.015],0xb4a65d);
      oval([0.109,0.013,0.128],[0,1.746,0.025],0xb0a36c);
      tapered(0.173,0.177,0.042,0.72,[0,1.113,0],0xa6aca3,0,1);
      box(batch,[0.062,0.091,0.014],[-0.087,1.35,0.131],0xc6c7b8);
    }
    if (detail) {
      oval([0.016, 0.027, 0.021], [0, 1.646, 0.099], 0xe4c6b0, 0, 2);
      oval([0.025,0.004,0.004],[0,1.613,0.100],0x7b5b50);
      for (const x of [-0.034, 0.034]) {
        const eyeZ = 0.013+0.085*headSize;
        oval([0.014,0.0055,0.0045],[x,1.684,eyeZ],0xc7b7a7);
        oval([0.006,0.0048,0.003],[x,1.684,eyeZ+0.004],0x3f3835);
        oval([0.017,0.0038,0.004],[x,1.699,eyeZ-0.001],older?0x74716b:0x473b34);
        if (older) batch.add(new THREE.TorusGeometry(0.020, 0.0028, 5, 9).translate(x, 1.682, eyeZ+0.008), 0x474347);
      }
      oval([0.091, 0.051, 0.081], [0, 1.511, -0.052], 0xa9aeb5, 0, 1);
      batch.add(new THREE.BoxGeometry(0.012, 0.55, 0.009).translate(0, 1.202, 0.135), 0x868d95, 0, 1);
    }
    return batch.finish();
  }

  function pedestrianMaterials(jacketMap,denimMap,denimTile=0.271) {
    const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.89});
    const depth = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking});
    const common = `
      uniform float walkTime;
      attribute vec2 features;
      attribute vec3 walk;
      vec3 rotateStride(vec3 p, float angle) {
        float c = cos(angle), s = sin(angle);
        return vec3(p.x, p.y*c - p.z*s, p.y*s + p.z*c);
      }
    `;
    const stride = `
      float phase = walkTime * walk.x + walk.y;
      float side = sign(features.x);
      float limb = abs(features.x);
      float walking = step(0.01, walk.x);
      float lift = max(0.0, -side * cos(phase)) * walking;
      float flex = limb == 1.0 ? (1.0 - smoothstep(0.36, 0.55, position.y)) : 0.0;
      float knee = lift * 0.48 * flex * (1.0 - walk.z);
      float elbow = limb > 2.5 ? (-0.10 - 0.16 * max(0.0, side * sin(phase)) * walking) : 0.0;
      float swing = side * sin(phase) * (limb == 1.0 ? 0.34 : -0.18) * (1.0 - walk.z * 1.7) * walking;
      float roll = 0.028 * sin(phase) * smoothstep(0.8, 1.45, position.y) * walking;
    `;
    for (const m of [material, depth]) {
      m.onBeforeCompile = shader => {
        shader.uniforms.walkTime = time;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + common)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            ${stride}
            if (limb == 1.0) {
              transformed = rotateStride(transformed - vec3(0.0, 0.47, 0.0), knee) + vec3(0.0, 0.47, 0.0);
            }
            if (limb > 2.5) {
              transformed = rotateStride(transformed - vec3(0.0, 1.19, 0.0), elbow) + vec3(0.0, 1.19, 0.0);
            }
            if (limb > 0.0) {
              float pivot = limb == 1.0 ? 0.88 : 1.43;
              transformed = rotateStride(transformed - vec3(0.0, pivot, 0.0), swing) + vec3(0.0, pivot, 0.0);
            }
            // Keep the shoe sole above the pavement and attenuate torso bob.
            transformed.y = max(0.0,transformed.y - 0.014 * sin(phase) * sin(phase) * walking);
            transformed.x += roll;
            transformed = rotateStride(transformed - vec3(0.0, 0.85, 0.0), walk.z * smoothstep(0.72, 1.4, position.y)) + vec3(0.0, 0.85, 0.0);
          `);
        if (m === material) {
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec3 skin; attribute vec3 trousers;')
            .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
              {
                ${stride}
                if (limb == 1.0) objectNormal = rotateStride(objectNormal, knee);
                if (limb > 2.5) objectNormal = rotateStride(objectNormal, elbow);
                if (limb > 0.0) objectNormal = rotateStride(objectNormal, swing);
                objectNormal = rotateStride(objectNormal, walk.z * smoothstep(0.72, 1.4, position.y));
              }
            `)
            .replace('#include <color_vertex>', `
              vColor = color;
              if (features.y == 1.0) vColor *= instanceColor;
              if (features.y == 2.0) vColor *= skin;
              if (features.y == 3.0) vColor *= trousers;
              if (features.y == 4.0) vColor *= 0.65 + skin * 0.75;
            `);
          if (jacketMap || denimMap) {
            shader.uniforms.jacketMap = {value:jacketMap};
            shader.uniforms.denimMap = {value:denimMap};
            const fabricVarying = 'varying vec3 vCloth; varying float vFabricKind;\n';
            shader.vertexShader = fabricVarying + shader.vertexShader.replace('#include <begin_vertex>',
              '#include <begin_vertex>\nvCloth=position; vFabricKind=features.y;');
            shader.fragmentShader = fabricVarying + 'uniform sampler2D jacketMap,denimMap;\n' + shader.fragmentShader
              .replace('#include <map_fragment>', `#include <map_fragment>
                vec2 fabric=vec2(vCloth.x+vCloth.z*0.7,vCloth.y);
                ${jacketMap?'if(abs(vFabricKind-1.0)<0.1)diffuseColor.rgb*=mix(0.70,1.32,texture2D(jacketMap,fabric/0.27).r);':''}
                ${denimMap?`if(abs(vFabricKind-3.0)<0.1)diffuseColor.rgb*=mix(0.80,1.35,luminance(texture2D(denimMap,fabric/${denimTile}).rgb)*3.2);`:''}`);
          }
        }
      };
      m.customProgramCacheKey = () => 'pedestrian-' + m.type;
    }
    return {material, depth};
  }

  return {vehicle, vehicleMaterials, policeEquipment, bicycle, cyclist, pedestrianGeometry, pedestrianMaterials};
}
