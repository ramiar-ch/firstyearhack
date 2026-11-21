// input.ts - keeps track of the keyboard.
//   isDown(code)     -> true while the key is held (for walking / driving)
//   wasPressed(code) -> true only on the frame the key went down (for E = enter car)
// We use KeyboardEvent.code ("KeyW", "ArrowUp", ...) so it works on any layout.

const held = new Set<string>();
const pressedThisFrame = new Set<string>();

window.addEventListener('keydown', (e) => {
  if (!e.repeat) pressedThisFrame.add(e.code); // ignore auto-repeat when holding
  held.add(e.code);
});
window.addEventListener('keyup', (e) => held.delete(e.code));
// If the window loses focus we never get the keyup, so clear everything.
window.addEventListener('blur', () => held.clear());

export function isDown(code: string): boolean {
  return held.has(code);
}

export function wasPressed(code: string): boolean {
  return pressedThisFrame.has(code);
}

// Call once at the END of every frame so "pressed" only lasts one frame.
export function endInputFrame() {
  pressedThisFrame.clear();
}

// Key layout for one player. Player 2 (arrow keys) will get its own in Step 3.
export interface KeyMap {
  up: string; // walk up / accelerate
  down: string; // walk down / brake + reverse
  left: string; // walk left / steer left
  right: string; // walk right / steer right
  run: string; // run (on foot) / handbrake (in car)
  action: string; // enter / exit car
}

export const PLAYER1_KEYS: KeyMap = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
  action: 'KeyE',
};
