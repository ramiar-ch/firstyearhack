// hud.ts - the text overlays on top of the game (plain HTML elements).
// Each player gets a little panel in their bottom corner (P1 left, P2 right):
// name, speed while driving, crash counter and hints like "E: get in".

export interface PlayerHud {
  setPrompt(text: string): void;
  setSpeed(metresPerSecond: number | null): void;
  setCrashes(count: number): void;
}

export function createPlayerHud(index: 1 | 2, name: string, colour: number): PlayerHud {
  const panel = document.createElement('div');
  panel.className = `player-hud p${index}`;
  panel.style.setProperty('--player-colour', `#${colour.toString(16).padStart(6, '0')}`);
  panel.innerHTML = `
    <div class="hud-name"></div>
    <div class="hud-speed"></div>
    <div class="hud-crashes"></div>
    <div class="hud-prompt"></div>`;
  panel.querySelector('.hud-name')!.textContent = `P${index} · ${name}`; // textContent = safe for any name
  document.body.appendChild(panel);

  const speed = panel.querySelector<HTMLElement>('.hud-speed')!;
  const crashes = panel.querySelector<HTMLElement>('.hud-crashes')!;
  const prompt = panel.querySelector<HTMLElement>('.hud-prompt')!;
  let lastCrashes = 0;

  return {
    setPrompt(text) {
      prompt.textContent = text;
      prompt.style.display = text ? 'block' : 'none';
    },
    setSpeed(ms) {
      speed.style.display = ms === null ? 'none' : 'block';
      if (ms !== null) speed.textContent = `${Math.round(Math.abs(ms) * 2.237)} mph`; // UK = mph
    },
    setCrashes(count) {
      if (count === lastCrashes) return;
      lastCrashes = count;
      crashes.textContent = `CRASHES ${count}`;
      crashes.style.display = 'block';
      crashes.classList.remove('flash');
      void crashes.offsetWidth; // restart the CSS animation
      crashes.classList.add('flash');
    },
  };
}
