// input.ts - remembers which keys are currently held down.
// We use KeyboardEvent.code ("KeyW", "ArrowUp", ...) so it works on any layout.

const held = new Set<string>();

window.addEventListener('keydown', (e) => held.add(e.code));
window.addEventListener('keyup', (e) => held.delete(e.code));
// If the window loses focus we never get the keyup, so clear everything.
window.addEventListener('blur', () => held.clear());

export function isDown(code: string): boolean {
  return held.has(code);
}

// Key layout for one player. Player 2 (arrow keys) will get its own in Step 3.
export interface KeyMap {
  up: string;
  down: string;
  left: string;
  right: string;
  run: string;
}

export const PLAYER1_KEYS: KeyMap = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
};
