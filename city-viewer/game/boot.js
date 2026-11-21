// game/boot.js - the opening: the game "boots up in 1997" (pixels, scanlines,
// a fake DOS-style loading screen), then FLASHES into 2026 and the intro
// swoop flies down onto KCL. Old tech -> new tricks, in the first 5 seconds.

const LINES = [
  'STRAND THEFT AUTO   v1.0   (C) 1997',
  'CHECKING CD-ROM DRIVE ........ OK',
  'LOADING LONDON.DAT ........... OK',
  'LOADING STRAND.MAP ........... OK',
  'SOUND BLASTER 16 ............. OK',
  'MEMORY: 16384 KB',
  '',
  'WARNING: TIME MACHINE DETECTED',
  'UPGRADING TO 2026 ...',
];

export const BOOT_SECONDS = 4; // how long we stay in 1997 before the flash

/**
 * Starts the boot screen. warp = the TimeWarp (it does the 1997 look + flash).
 * Returns { cancel() } - used if someone skips the intro.
 */
export function playBoot(warp) {
  warp.setRetro(true, true); // straight into 1997, no flash, no message
  const el = document.createElement('div');
  el.id = 'boot';
  el.innerHTML = '<pre></pre><div class="boot-cursor">_</div>';
  document.body.appendChild(el);
  const pre = el.querySelector('pre');

  // Type the lines one by one, like an old PC starting up.
  const timers = LINES.map((line, i) =>
    setTimeout(() => { pre.textContent += line + '\n'; }, 250 + i * ((BOOT_SECONDS - 1) * 1000) / LINES.length));
  // Then: flash -> 2026.
  timers.push(setTimeout(() => {
    warp.warp(); // white flash, swaps back to the modern look
    setTimeout(() => el.remove(), 250);
  }, BOOT_SECONDS * 1000));

  return {
    cancel() {
      timers.forEach(clearTimeout);
      el.remove();
      if (warp.retro) warp.setRetro(false, true);
    },
  };
}
