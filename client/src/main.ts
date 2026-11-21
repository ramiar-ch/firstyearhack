// main.ts - sets up Three.js, loads London, spawns the player, runs the game loop.

import * as THREE from 'three';
import { loadLondonData, createBuildings, createRoads, createGround } from './world/london';
import { Character } from './player/character';
import { OverheadCamera } from './player/overheadCamera';
import { PLAYER1_KEYS } from './player/input';

async function start() {
  // ---- Renderer + scene ----------------------------------------------------
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d); // wet black night sky
  scene.fog = new THREE.Fog(0x0a1020, 250, 700); // light deep-blue fog (camera is ~110 m away)

  // Basic night lighting (the proper "Neon London" look comes in Step 4).
  scene.add(new THREE.HemisphereLight(0x6f8fd8, 0x2a1a0c, 2.2)); // blue sky, warm ground
  const moon = new THREE.DirectionalLight(0xffa64d, 1.6); // orange-ish city glow
  moon.position.set(-100, 200, 100);
  scene.add(moon);

  // ---- World ---------------------------------------------------------------
  const data = await loadLondonData();
  scene.add(createGround(data.radius));
  scene.add(createRoads(data));
  scene.add(createBuildings(data));

  // ---- Player --------------------------------------------------------------
  const player = new Character(PLAYER1_KEYS);
  player.mesh.position.set(data.spawn.x, 0, data.spawn.z); // on the Strand, outside KCL
  scene.add(player.mesh);

  const cam = new OverheadCamera(window.innerWidth / window.innerHeight);
  cam.snapTo(player.mesh.position);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    cam.camera.aspect = window.innerWidth / window.innerHeight;
    cam.camera.updateProjectionMatrix();
  });

  document.getElementById('loading')?.remove();

  // Handy for debugging: type `game` in the browser console (F12).
  (window as any).game = { scene, renderer, cam, player, data };

  // ---- Game loop -----------------------------------------------------------
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    // dt = seconds since last frame (capped so a lag spike doesn't teleport us)
    const dt = Math.min(clock.getDelta(), 0.1);
    player.update(dt);
    cam.update(dt, player.mesh.position, player.velocity.length());
    renderer.render(scene, cam.camera);
  });
}

start().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = String(err.message ?? err);
});
