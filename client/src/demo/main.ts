import "./style.css";
import * as THREE from "three";

// --- Arcade driving constants (no physics engine) ---
const MAX_SPEED = 18;
const ACCELERATION = 28;
const BRAKE = 40;
const FRICTION = 12;
const STEER_SPEED = 2.2; // radians per second at full lock
const STEER_RETURN = 3.5;

const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
};

window.addEventListener("keydown", (e) => {
  if (e.code === "ArrowUp") keys.up = true;
  if (e.code === "ArrowDown") keys.down = true;
  if (e.code === "ArrowLeft") keys.left = true;
  if (e.code === "ArrowRight") keys.right = true;
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowUp") keys.up = false;
  if (e.code === "ArrowDown") keys.down = false;
  if (e.code === "ArrowLeft") keys.left = false;
  if (e.code === "ArrowRight") keys.right = false;
});

// --- Scene ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e18);
scene.fog = new THREE.Fog(0x0a0e18, 40, 90);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
// High overhead ~60° view of the whole map area
camera.position.set(0, 28, 22);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById("app")!.appendChild(renderer.domElement);

// Neon London lighting: deep blue ambient + sodium-orange key
const ambient = new THREE.AmbientLight(0x1a2744, 1.2);
scene.add(ambient);

const streetLight = new THREE.PointLight(0xff8c1a, 40, 50);
streetLight.position.set(0, 8, 0);
scene.add(streetLight);

const fill = new THREE.DirectionalLight(0x3a5a9a, 0.6);
fill.position.set(-10, 20, 10);
scene.add(fill);

// Dark wet road (placeholder Strand)
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 40),
  new THREE.MeshStandardMaterial({
    color: 0x11151c,
    roughness: 0.35,
    metalness: 0.4,
  }),
);
road.rotation.x = -Math.PI / 2;
scene.add(road);

// Simple road centre line
const centreLine = new THREE.Mesh(
  new THREE.PlaneGeometry(0.15, 36),
  new THREE.MeshBasicMaterial({ color: 0xff8c1a }),
);
centreLine.rotation.x = -Math.PI / 2;
centreLine.position.y = 0.02;
scene.add(centreLine);

// Placeholder car (black cab-ish box)
const car = new THREE.Group();

const body = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 0.7, 3.2),
  new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.5,
    metalness: 0.3,
  }),
);
body.position.y = 0.55;
car.add(body);

const cabin = new THREE.Mesh(
  new THREE.BoxGeometry(1.4, 0.55, 1.6),
  new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.4,
    metalness: 0.2,
  }),
);
cabin.position.set(0, 1.05, -0.2);
car.add(cabin);

const windowMat = new THREE.MeshStandardMaterial({
  color: 0x3a5a9a,
  roughness: 0.2,
  metalness: 0.6,
  emissive: 0x1a2744,
  emissiveIntensity: 0.3,
});
const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.08), windowMat);
windshield.position.set(0, 1.05, 0.55);
car.add(windshield);

// Headlights (sodium orange glow)
const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.1), headlightMat);
hlL.position.set(-0.45, 0.5, 1.6);
car.add(hlL);
const hlR = hlL.clone();
hlR.position.x = 0.45;
car.add(hlR);

car.position.set(0, 0, 0);
scene.add(car);

// Car state
let speed = 0;
let steerAngle = 0;

const clock = new THREE.Clock();

function updateCar(dt: number) {
  // Accelerate / brake
  if (keys.up) speed += ACCELERATION * dt;
  else if (keys.down) speed -= BRAKE * dt;
  else {
    // Friction slows you down toward 0
    if (speed > 0) speed = Math.max(0, speed - FRICTION * dt);
    else if (speed < 0) speed = Math.min(0, speed + FRICTION * dt);
  }
  speed = Math.max(-MAX_SPEED * 0.4, Math.min(MAX_SPEED, speed));

  // Steering (more responsive at speed)
  const steerInput = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  if (steerInput !== 0) {
    steerAngle += steerInput * STEER_SPEED * dt;
  } else {
    // Wheels return to centre
    if (steerAngle > 0) steerAngle = Math.max(0, steerAngle - STEER_RETURN * dt);
    else if (steerAngle < 0) steerAngle = Math.min(0, steerAngle + STEER_RETURN * dt);
  }
  steerAngle = Math.max(-0.6, Math.min(0.6, steerAngle));

  // Turn only when moving
  if (Math.abs(speed) > 0.1) {
    const turn = steerAngle * (speed / MAX_SPEED) * 2.5 * dt;
    car.rotation.y += turn;
  }

  // Move forward in the car's facing direction
  const forwardX = Math.sin(car.rotation.y);
  const forwardZ = Math.cos(car.rotation.y);
  car.position.x += forwardX * speed * dt;
  car.position.z += forwardZ * speed * dt;

  // Soft bounds so you stay on the placeholder road
  car.position.x = Math.max(-28, Math.min(28, car.position.x));
  car.position.z = Math.max(-18, Math.min(18, car.position.z));
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateCar(dt);
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
