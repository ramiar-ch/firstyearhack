import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const THIGH = 0.443;
const SHIN = 0.421;
const HIP = 0.919;
const ANKLE = 0.085;
const TAU = Math.PI * 2;
const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
const clamp = THREE.MathUtils.clamp;
export const strideLength = run => mix(1.28, 2.05, run);
export const PRIMARY_AVATAR = Object.freeze({style:'man',skin:0xc7926b,trousers:0x3c4852,scale:1.02});
export const PRIMARY_COLOUR = 0x8b444b;

// Stance covers most of a walk cycle. Its linear travel cancels body motion.
export function footTarget(phase, stride, run) {
  const t = ((phase % 1) + 1) % 1;
  const stance = mix(0.62, 0.48, run);
  const reach = stance * stride * 0.5;
  if (t < stance) {
    const u = t / stance;
    return { z: mix(reach, -reach, u), lift: 0, pitch: -0.15 * (1 - smooth(Math.min(1, u * 5))) + 0.26 * smooth(Math.max(0, (u - 0.73) / 0.27)) };
  }
  const u = (t - stance) / (1 - stance);
  return { z: mix(-reach, reach, smooth(u)), lift: Math.sin(Math.PI * u) ** 1.4 * mix(0.145, 0.25, run),
    pitch: mix(0.26, -0.15, smooth(u)) + Math.sin(Math.PI * u) * 0.19 };
}

export function createProtagonist(avatar = PRIMARY_AVATAR, colour = PRIMARY_COLOUR) {
  const root = new THREE.Group();
  root.name = 'P1 articulated protagonist';
  const materials = new Map();
  const parts = new Map();
  const coat = new THREE.Color(colour).lerp(new THREE.Color(0x575051), 0.52).getHex();
  const skin = avatar.skin;
  const denim = avatar.trousers;
  const seams = new THREE.Color(coat).multiplyScalar(0.57).getHex();
  const hair = 0x302622;
  const joint = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const add = (parent, colour, geometry, x, y, z) => {
    const key = parent.id + ':' + colour;
    if (!parts.has(key)) parts.set(key, { parent, colour, geometries: [] });
    parts.get(key).geometries.push(geometry.translate(x, y, z));
  };
  const oval = (p, c, x, y, z, sx, sy, sz) => add(p, c, new THREE.SphereGeometry(1, 16, 10).scale(sx, sy, sz), x, y, z);
  const tube = (p, c, top, bottom, len, depth, x, y, z) => add(p, c, new THREE.CylinderGeometry(top, bottom, len, 14).scale(1, 1, depth), x, y, z);
  const box = (p, c, x, y, z, w, h, d) => add(p, c, new THREE.BoxGeometry(w, h, d), x, y, z);
  const pelvis = joint(root, 0, HIP);
  pelvis.name='Pelvis';
  oval(pelvis, denim, 0, 0.005, -0.014, 0.167, 0.112, 0.109);
  const chest = joint(pelvis, 0, 0.035);
  chest.name='Chest';
  const jacket = [[0,-0.023],[0.155,-0.023],[0.169,0.01],[0.168,0.12],[0.173,0.26],[0.194,0.39],[0.183,0.48],[0.133,0.54],[0.071,0.562],[0,0.562]];
  add(chest, coat, new THREE.LatheGeometry(jacket.map(([r,y]) => new THREE.Vector2(r,y)), 24).scale(1, 1, 0.73), 0, 0, 0);
  tube(chest, seams, 0.166, 0.166, 0.032, 0.73, 0, -0.007, 0);
  oval(chest, coat, 0, 0.49, -0.087, 0.112, 0.087, 0.079);
  oval(chest, seams, 0, 0.536, -0.074, 0.103, 0.037, 0.066);
  oval(chest, coat, 0, 0.486, -0.128, 0.085, 0.066, 0.042);
  tube(chest, 0x35383a, 0.069, 0.083, 0.055, 0.92, 0, 0.55, 0);
  box(chest, 0x5c5e5a, 0, 0.256, 0.134, 0.009, 0.47, 0.012);
  box(chest, 0xb2aa9a, 0, 0.481, 0.143, 0.019, 0.031, 0.009);
  const head = joint(chest, 0, 0.598, 0.008);
  tube(head, skin, 0.050, 0.054, 0.102, 0.91, 0, -0.04, 0);
  oval(head, skin, 0, 0.075, 0.008, 0.088, 0.112, 0.091);
  oval(head, skin, 0, 0.026, 0.039, 0.067, 0.058, 0.066);
  oval(head, skin, 0, 0.071, 0.095, 0.016, 0.022, 0.022);
  oval(head, 0x794d43, 0, 0.025, 0.101, 0.023, 0.004, 0.005);
  const haircut = new THREE.SphereGeometry(1, 22, 10, 0, TAU, 0, Math.PI * 0.57).rotateX(-0.27).scale(0.092, 0.113, 0.094);
  add(head, hair, haircut, 0, 0.085, -0.001);
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    oval(head, skin, side * 0.086, 0.065, 0.001, 0.015, 0.025, 0.021);
    oval(head, 0xcdbeb0, side * 0.033, 0.090, 0.092, 0.0145, 0.0047, 0.004);
    oval(head, 0x453a33, side * 0.033, 0.090, 0.096, 0.0055, 0.0048, 0.002);
    oval(head, hair, side * 0.033, 0.101, 0.09, 0.016, 0.0025, 0.003);
    const pocket=new THREE.BoxGeometry(0.014,0.116,0.014).rotateZ(side*-0.23);
    add(chest,seams,pocket,side*0.111,0.148,0.105);
    box(chest,0x69645e,side*0.119,0.203,0.118,0.010,0.023,0.010);
    const shoulder = joint(chest, side * 0.184, 0.446);
    oval(shoulder, coat, side * 0.022, -0.025, 0, 0.073, 0.086, 0.076);
    tube(shoulder, coat, 0.068, 0.046, 0.274, 0.92, side * 0.018, -0.141, 0);
    const elbow = joint(shoulder, side * 0.019, -0.27);
    elbow.name=side<0?'Left elbow':'Right elbow';
    oval(elbow, coat, 0, 0, 0, 0.047, 0.055, 0.045);
    tube(elbow, coat, 0.047, 0.034, 0.239, 0.91, 0, -0.119, 0);
    tube(elbow, 0x343236, 0.038, 0.035, 0.049, 0.92, 0, -0.229, 0);
    oval(elbow, skin, 0, -0.279, 0.006, 0.033, 0.055, 0.026);
    oval(elbow, skin, -side * 0.025, -0.26, 0.019, 0.012, 0.025, 0.012);
    arms.push({ side, shoulder, elbow });
    const hip = joint(pelvis, side * 0.088);
    tube(hip, denim, 0.084, 0.059, THIGH, 1.08, 0, -THIGH / 2, 0);
    const knee = joint(hip, 0, -THIGH);
    oval(knee, denim, 0, 0.005, 0, 0.061, 0.064, 0.063);
    tube(knee, denim, 0.06, 0.046, SHIN, 1.03, 0, -SHIN / 2, -0.003);
    const foot = joint(knee, 0, -SHIN);
    foot.name=side<0?'Left ankle':'Right ankle';
    oval(foot, 0x303137, 0, -0.031, 0.053, 0.057, 0.042, 0.119);
    oval(foot, 0x585752, 0, -0.068, 0.055, 0.059, 0.013, 0.12);
    for (let i = 0; i < 3; i++) box(foot, 0x878176, 0, 0.004, 0.045 + i * 0.018, 0.049, 0.004, 0.007);
    legs.push({ hip, knee, foot });
  }
  for (const { parent, colour, geometries } of parts.values()) {
    if (!materials.has(colour)) materials.set(colour, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.86 }));
    const mesh = new THREE.Mesh(mergeGeometries(geometries), materials.get(colour));
    geometries.forEach(g => g.dispose());
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  }

  function animate(phase, gait, run, airborne, verticalSpeed) {
    const cycle = phase * TAU;
    const walkHeight = 0.009 - 0.022 * Math.cos(cycle * 2);
    const runHeight = -0.035 - 0.027 * Math.cos(cycle * 2);
    const stride = strideLength(run);
    const feet = [footTarget(phase,stride,run), footTarget(phase+0.5,stride,run)];
    const maxDrop = Math.min(...feet.map(target => {
      const reach = THIGH + SHIN - 0.006;
      return Math.sqrt(reach ** 2 - (target.z * gait) ** 2) + target.lift * gait;
    }));
    const bob = Math.min(mix(walkHeight, runHeight, run) * gait, ANKLE + maxDrop - HIP);
    pelvis.position.y = HIP + bob;
    chest.position.x = Math.sin(cycle) * 0.014 * gait;
    pelvis.rotation.y = Math.sin(cycle) * 0.07 * gait;
    chest.rotation.set((0.034 + run * 0.12) * gait, -Math.sin(cycle) * 0.19 * gait, Math.cos(cycle) * 0.034 * gait);
    head.rotation.set(-chest.rotation.x * 0.78, -chest.rotation.y * 0.58, -chest.rotation.z * 0.74);
    legs.forEach(({ hip, knee, foot }, i) => {
      const target = feet[i];
      const z = airborne ? (i ? -0.11 : 0.19) : target.z * gait;
      const pitch = airborne ? 0.19 : target.pitch * gait;
      const soleRoll = Math.sin(Math.abs(pitch)) * (pitch > 0 ? 0.065 : 0.175);
      const down = HIP + bob - ANKLE - (airborne ? 0.13 + (i ? 0.08 : 0.02) : target.lift * gait + soleRoll);
      const distance = clamp(Math.hypot(z, down), 0.12, THIGH + SHIN - 0.002);
      const bend = Math.PI - Math.acos(clamp((THIGH ** 2 + SHIN ** 2 - distance ** 2) / (2 * THIGH * SHIN), -1, 1));
      hip.rotation.x = Math.atan2(-z, down) - Math.acos(clamp((THIGH ** 2 + distance ** 2 - SHIN ** 2) / (2 * THIGH * distance), -1, 1));
      knee.rotation.x = bend;
      foot.rotation.x = pitch - bend - hip.rotation.x;
    });
    for (const { side, shoulder, elbow } of arms) {
      const swing = -side * Math.cos(cycle);
      shoulder.rotation.set(airborne ? -0.36 - clamp(verticalSpeed * 0.045, -0.18, 0.22) : swing * (0.29 + run * 0.26) * gait, 0, side * (0.09 + 0.07 * gait));
      elbow.rotation.x = -0.13 - (airborne ? 0.56 : (0.14 + run * 0.8 + 0.13 * Math.max(0, -swing)) * gait);
    }
  }
  function dispose() {
    root.traverse(object => object.geometry?.dispose());
    for (const material of materials.values()) material.dispose();
  }

  // The same body also rides the bicycle. Targets arrive in the bike's local
  // frame after steering/crank rotation, so grip, pedals and pelvis stay attached.
  const downAxis=new THREE.Vector3(0,-1,0);
  const direction=new THREE.Vector3(),bendPlane=new THREE.Vector3(),jointOffset=new THREE.Vector3();
  const target=new THREE.Vector3(),hint=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const footPitch=new THREE.Quaternion(),axisX=new THREE.Vector3(1,0,0);
  function poseLimb(upper,lower,end,plane,first,second) {
    direction.copy(end).sub(upper.position);
    const length=clamp(direction.length(),Math.abs(first-second)+0.002,first+second-0.001);
    direction.normalize();
    bendPlane.copy(plane).addScaledVector(direction,-plane.dot(direction)).normalize();
    const along=(first*first+length*length-second*second)/(2*length);
    jointOffset.copy(direction).multiplyScalar(along).addScaledVector(bendPlane,Math.sqrt(Math.max(0,first*first-along*along)));
    upper.quaternion.setFromUnitVectors(downAxis,rotationVector.copy(jointOffset).normalize());
    rotation.copy(upper.quaternion).invert();
    lower.quaternion.setFromUnitVectors(downAxis,direction.multiplyScalar(length).sub(jointOffset).normalize().applyQuaternion(rotation));
    lower.position.set(0,-first,0);
  }
  const rotationVector=new THREE.Vector3();
  function pedal(phase,steering,pedals) {
    pelvis.position.set(0,1.017,-0.346);
    pelvis.rotation.set(0,0,0);
    chest.position.x=0;
    const turn=steering.rotation.y;
    const lean=0.90+Math.abs(turn)*0.24;
    chest.rotation.set(lean,turn*0.36,0);
    head.rotation.set(0.11-lean,turn*0.22,0);
    // Updating the locals relative to a detached root is safe before its first render.
    steering.updateMatrix();
    root.updateWorldMatrix(true,false);
    chest.updateWorldMatrix(true,false);
    for(const {side,shoulder,elbow} of arms) {
      const grip=target.set(side*0.263,1.052,-0.121);
      grip.applyMatrix4(steering.matrix);
      root.localToWorld(grip);chest.worldToLocal(grip);
      poseLimb(shoulder,elbow,grip,hint.set(side*0.55,-0.62,-0.25),0.271,0.279);
    }
    for(let i=0;i<legs.length;i++) {
      const {hip,knee,foot}=legs[i];
      const {side,pedal}=pedals[i];
      const angle=phase+(i?Math.PI:0),tilt=0.12*Math.cos(angle);
      // Foot geometry extends 5.5 cm forward of the ankle. Align the sole
      // with the pedal's top after rotating that contact offset.
      footPitch.setFromAxisAngle(axisX,tilt);
      target.set(0,-0.081,0.055).applyQuaternion(footPitch).negate()
        .add(pedal.position).sub(pelvis.position);
      target.y+=0.014;
      poseLimb(hip,knee,target,hint.set(side*0.19,0.13,1),THIGH,SHIN);
      foot.quaternion.copy(hip.quaternion).multiply(knee.quaternion).invert().multiply(footPitch);
    }
  }
  animate(0, 0, 0, false, 0);
  return { root, animate, pedal, dispose };
}
