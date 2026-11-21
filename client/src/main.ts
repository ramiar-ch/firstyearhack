// main.ts - sets up Three.js, loads London, spawns the player + cars, runs the game loop.

import * as THREE from 'three';
import { loadLondonData, createBuildings, createRoads, createGround } from './world/london';
import { CollisionWorld } from './world/collision';
import { findCarSpawns } from './world/carSpawns';
import { Player } from './player/player';
import { Car } from './player/car';
import { OverheadCamera } from './player/overheadCamera';
import { PLAYER1_KEYS, endInputFrame } from './player/input';
import { setPrompt, setSpeed } from './game/hud';

// Car paint colours - Neon London palette (orange, deep blue, wet black, white).
const CAR_COLOURS = [0xff8c1a, 0x1f3fa8, 0x14161c, 0xd8dce6, 0xb8461b, 0x2a5bd7];

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
  const world = new CollisionWorld(data.buildings);

  // ---- Cars ----------------------------------------------------------------
  const cars = findCarSpawns(data, world).map(
    (s, i) => new Car(s.x, s.z, s.heading, CAR_COLOURS[i % CAR_COLOURS.length]),
  );
  for (const car of cars) scene.add(car.mesh);

  // ---- Player --------------------------------------------------------------
  const player = new Player(PLAYER1_KEYS);
  player.character.mesh.position.set(data.spawn.x, 0, data.spawn.z); // on the Strand, outside KCL
  scene.add(player.character.mesh);

  const cam = new OverheadCamera(window.innerWidth / window.innerHeight);
  cam.snapTo(player.position);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    cam.camera.aspect = window.innerWidth / window.innerHeight;
    cam.camera.updateProjectionMatrix();
  });

  document.getElementById('loading')?.remove();

  // Handy for debugging: type `game` in the browser console (F12).
  (window as any).game = { scene, renderer, cam, player, cars, world, data };

  // ---- Game loop -----------------------------------------------------------
  const timer = new THREE.Timer();
  renderer.setAnimationLoop(() => {
    timer.update();
    // dt = seconds since last frame (capped so a lag spike doesn't teleport us)
    const dt = Math.min(timer.getDelta(), 0.1);

    player.update(dt, cars, world); // walking + enter/exit
    for (const car of cars) car.update(dt, player.inputFor(car), world); // driving

    // HUD
    if (player.car) {
      setPrompt('');
      setSpeed(player.car.speed);
    } else {
      setPrompt(player.nearestCar(cars) ? 'Press E to get in' : '');
      setSpeed(null);
    }

    cam.update(dt, player.position, player.speed);
    renderer.render(scene, cam.camera);
    endInputFrame();
  });
}

start().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = String(err.message ?? err);
});
