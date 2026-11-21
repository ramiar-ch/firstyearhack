// hud.ts - the text overlays on top of the game (plain HTML elements).

const prompt = document.getElementById('prompt')!;
const speedo = document.getElementById('speedo')!;

/** Show a hint like "Press E to get in" in the middle-bottom (or hide with ""). */
export function setPrompt(text: string) {
  prompt.textContent = text;
  prompt.style.display = text ? 'block' : 'none';
}

/** Show speed in mph (UK!) while driving, or hide it with null. */
export function setSpeed(metresPerSecond: number | null) {
  if (metresPerSecond === null) {
    speedo.style.display = 'none';
    return;
  }
  speedo.style.display = 'block';
  speedo.textContent = `${Math.round(Math.abs(metresPerSecond) * 2.237)} mph`;
}
