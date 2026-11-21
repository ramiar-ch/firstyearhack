// main.ts - sets up Three.js, loads London, shows the character creator,
// then spawns the two players and runs the game loop.
//
// The game has two MODES:
//   'creator' - the character creator UI, London slowly turning behind it
//   'game'    - playing (both players outside the KCL Strand Building)

import './style.css';
import * as THREE from 'three';
import { loadLondonData } from './world/data';
import { buildWorld } from './world/index';
import { CollisionWorld } from './world/collision';
import { findCarSpawns } from './world/carSpawns';
import { Player } from './player/player';
import { Car, NO_INPUT } from './player/car';
import { OverheadCamera } from './player/overheadCamera';
import { PLAYER1_KEYS, PLAYER2_KEYS, endInputFrame } from './player/input';
import type { CharacterConfig } from './player/characterModel';
import { createPlayerHud, type PlayerHud } from './game/hud';
import { showCharacterCreator } from './ui/characterCreator';

// Car paint colours - Neon London palette (orange, deep blue, wet black, white).
const CAR_COLOURS = [0xff8c1a, 0x1f3fa8, 0x14161c, 0xd8dce6, 0xb8461b, 0x2a5bd7];
const GAME_FOG_FAR = 700; // metres (the creator view uses a longer fog so you see more city)

async function start() {
  // ---- Renderer + scene ----------------------------------------------------
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d); // wet black night sky
  const fog = new THREE.Fog(0x0a1020, 250, 2000); // light deep-blue fog
  scene.fog = fog;

  // Basic night lighting (the full "Neon London" look comes later).
  scene.add(new THREE.HemisphereLight(0x5577bb, 0x3a2410, 1.4)); // blue sky, warm ground
  const moon = new THREE.DirectionalLight(0xffb070, 0.9); // orange-ish city glow
  moon.position.set(-100, 200, 100);
  scene.add(moon);

  // ---- World ---------------------------------------------------------------
  const data = await loadLondonData();
  const world = new CollisionWorld(data.buildings, data.water, data.roads);
  const city = buildWorld(scene, data, world, renderer);

  // ---- Cars ----------------------------------------------------------------
  const cars = findCarSpawns(data, world).map(
    (s, i) => new Car(s.x, s.z, s.heading, CAR_COLOURS[i % CAR_COLOURS.length]),
  );
  for (const car of cars) scene.add(car.mesh);

  // ---- Camera ----------------------------------------------------------------
  const cam = new OverheadCamera(window.innerWidth / window.innerHeight);
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    cam.camera.aspect = window.innerWidth / window.innerHeight;
    cam.camera.updateProjectionMatrix();
  });

  // ---- Players (created when the character creator finishes) --------------
  let mode: 'creator' | 'game' = 'creator';
  const players: Player[] = [];
  const huds: PlayerHud[] = [];

  function spawnPlayers(configs: [CharacterConfig, CharacterConfig]) {
    const keys = [PLAYER1_KEYS, PLAYER2_KEYS];
    configs.forEach((config, i) => {
      const p = new Player((i + 1) as 1 | 2, keys[i], config);
      // Stand side by side on the Strand outside KCL, 4 m apart.
      p.character.mesh.position.set(data.spawn.x + (i === 0 ? -2 : 2), 0, data.spawn.z);
      scene.add(p.character.mesh);
      players.push(p);
      huds.push(createPlayerHud(p.index, p.name, p.colour));
    });
    cam.snapTo(midpoint());
  }

  /** The point halfway between the players (the shared camera looks here). */
  function midpoint() {
    return players[0].position.clone().add(players[1].position).multiplyScalar(0.5);
  }

  const creator = showCharacterCreator((configs) => {
    spawnPlayers(configs);
    fog.far = GAME_FOG_FAR;
    document.getElementById('help')!.style.display = 'block';
    mode = 'game';
    endInputFrame(); // the READY key press mustn't also count as "get in car"
  });

  document.getElementById('loading')?.remove();

  // Handy for debugging: type `game` in the browser console (F12).
  (window as any).game = { scene, renderer, cam, players, cars, world, data };

  // ---- Game loop -----------------------------------------------------------
  const timer = new THREE.Timer();
  let orbitAngle = 0;
  const kcl = new THREE.Vector3(0, 0, 0);

  renderer.setAnimationLoop(() => {
    timer.update();
    // dt = seconds since last frame (capped so a lag spike doesn't teleport us)
    const dt = Math.min(timer.getDelta(), 0.1);

    if (mode === 'creator') {
      // Slowly circle high above the KCL Strand Building.
      orbitAngle += dt * 0.05;
      cam.camera.position.set(Math.sin(orbitAngle) * 520, 420, Math.cos(orbitAngle) * 520);
      cam.camera.lookAt(kcl);
      city.update(dt, kcl);
      renderer.render(scene, cam.camera);
      creator.update(dt, renderer); // the two character previews on top
      endInputFrame();
      return;
    }

    // ---- Playing ----
    for (const p of players) p.update(dt, cars, world); // walking + enter/exit
    for (const car of cars) {
      const driver = players.find((p) => p.car === car);
      const crashed = car.update(dt, driver?.inputFor(car) ?? NO_INPUT, world);
      if (crashed && driver) driver.crashes++;
    }

    // HUD
    players.forEach((p, i) => {
      const hud = huds[i];
      hud.setCrashes(p.crashes);
      if (p.car) {
        hud.setPrompt('');
        hud.setSpeed(p.car.speed);
      } else {
        const key = p.index === 1 ? 'E' : 'Enter';
        hud.setPrompt(p.nearestCar(cars) ? `${key}: get in` : '');
        hud.setSpeed(null);
      }
    });

    // Shared camera (split-screen comes later): look between the players and
    // zoom out further when they're far apart, so both stay on screen.
    const mid = midpoint();
    const apart = players[0].position.distanceTo(players[1].position);
    const fastest = Math.max(...players.map((p) => p.speed));
    const anyInCar = players.some((p) => p.car !== null);
    city.update(dt, mid); // water ripples, label fading
    cam.update(dt, mid, fastest, anyInCar, apart * 0.6);
    renderer.render(scene, cam.camera);
    endInputFrame();
  });
}

start().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = String(err.message ?? err);
});
