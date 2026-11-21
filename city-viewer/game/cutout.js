// game/cutout.js - turns a photo into a "paper cut-out" sticker (no Three.js,
// so the PHONE can run it too and show a preview before sending).
//
// Steps: crop to the middle of the photo -> guess the background colour from
// the edges -> erase background connected to the edges -> keep only the
// biggest object -> add a white paper border. If that fails (busy photo),
// we make a neat round sticker of the middle of the photo instead.

const SIZE = 320; // working size in pixels (fast on phones)

export async function makeCutout(source) {
  const img = typeof source === 'string' ? await loadImage(source) : source;

  // 1. Crop the middle 75% (the object is usually in the middle; less clutter).
  const side = Math.min(img.width, img.height) * 0.75;
  const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
  const c = canvas(SIZE, SIZE);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
  const data = g.getImageData(0, 0, SIZE, SIZE);
  const px = data.data;

  // 2. Background colour + how much it varies, from the border pixels.
  const border = [];
  for (let i = 0; i < SIZE; i++) border.push(i, (SIZE - 1) * SIZE + i, i * SIZE, i * SIZE + SIZE - 1);
  let r = 0, gg = 0, b = 0;
  for (const p of border) { r += px[p * 4]; gg += px[p * 4 + 1]; b += px[p * 4 + 2]; }
  r /= border.length; gg /= border.length; b /= border.length;
  const diff = (i) => Math.abs(px[i] - r) + Math.abs(px[i + 1] - gg) + Math.abs(px[i + 2] - b);
  let spread = 0;
  for (const p of border) spread += diff(p * 4);
  spread /= border.length;
  const TOL = Math.max(70, Math.min(160, spread * 2.5 + 50)); // adapts to shadows / uneven light

  // 3. Flood fill from the edges: background-looking pixels -> transparent.
  const bg = new Uint8Array(SIZE * SIZE);
  const stack = [...border];
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || diff(p * 4) > TOL) continue;
    bg[p] = 1;
    const x = p % SIZE, y = (p / SIZE) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < SIZE - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - SIZE);
    if (y < SIZE - 1) stack.push(p + SIZE);
  }

  // 4. Keep only the biggest object (removes specks and bits of background).
  const label = new Int32Array(SIZE * SIZE);
  let best = 0, bestSize = 0, next = 1;
  for (let p0 = 0; p0 < SIZE * SIZE; p0++) {
    if (bg[p0] || label[p0]) continue;
    let size = 0;
    const s = [p0];
    label[p0] = next;
    while (s.length) {
      const p = s.pop();
      size++;
      const x = p % SIZE, y = (p / SIZE) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < SIZE - 1 ? p + 1 : -1, y > 0 ? p - SIZE : -1, y < SIZE - 1 ? p + SIZE : -1]) {
        if (q >= 0 && !bg[q] && !label[q]) { label[q] = next; s.push(q); }
      }
    }
    if (size > bestSize) { bestSize = size; best = next; }
    next++;
  }
  const share = bestSize / (SIZE * SIZE);
  let shape;
  if (share > 0.04 && share < 0.92) {
    for (let p = 0; p < SIZE * SIZE; p++) if (label[p] !== best) px[p * 4 + 3] = 0;
    g.putImageData(data, 0, 0);
    shape = trim(c);
  } else {
    // Didn't find a clear object: make a round sticker from the middle instead.
    shape = canvas(SIZE, SIZE);
    const sg = shape.getContext('2d');
    sg.beginPath();
    sg.arc(SIZE / 2, SIZE / 2, SIZE * 0.42, 0, Math.PI * 2);
    sg.clip();
    sg.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
  }
  return paperBorder(shape);
}

/** Backup "items" for the demo: a big emoji drawn as a sticker. */
export function emojiCutout(emoji) {
  const c = canvas(SIZE, SIZE);
  const g = c.getContext('2d');
  g.font = `${SIZE * 0.8}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, SIZE / 2, SIZE / 2 + SIZE * 0.05);
  return paperBorder(trim(c));
}

// ---- helpers ----------------------------------------------------------------------
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

/** Cut away empty transparent space around the shape. */
function trim(c) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const { data, width: w, height: h } = g.getImageData(0, 0, c.width, c.height);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  if (x1 <= x0 || y1 <= y0) return c;
  const out = canvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(c, -x0, -y0);
  return out;
}

/** White paper border around the shape (the "cut-out" look). */
function paperBorder(shape) {
  const pad = 10;
  const out = canvas(shape.width + pad * 2, shape.height + pad * 2);
  const o = out.getContext('2d');
  const white = canvas(shape.width, shape.height);
  const wg = white.getContext('2d');
  wg.drawImage(shape, 0, 0);
  wg.globalCompositeOperation = 'source-in';
  wg.fillStyle = '#fff';
  wg.fillRect(0, 0, white.width, white.height);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) o.drawImage(white, pad + Math.cos(a) * 6, pad + Math.sin(a) * 6);
  o.drawImage(shape, pad, pad);
  return out;
}
