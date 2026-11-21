/** Per-source play settings in localStorage (`kclCityPlay`). */

const KEY = 'kclCityPlay';
const DEFAULT = {
  lookSens: 1,
  invertY: false,
  camDistance: 4.5,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return Object.assign({}, DEFAULT, JSON.parse(raw));
  } catch (_) {
    return { ...DEFAULT };
  }
}

export function saveSettings(partial) {
  const next = Object.assign(loadSettings(), partial);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (_) {}
  return next;
}

export function applyToSource(source, settings) {
  if (!source) return;
  source.lookSens = settings.lookSens ?? 1;
  source.invertY = !!settings.invertY;
  source.defaultCamDistance = settings.camDistance ?? 4.5;
}
