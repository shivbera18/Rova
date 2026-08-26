/**
 * Generates the PWA icon set (PNG, no dependencies) for both web apps.
 * Run once from repo root:  node tools/generate-icons.mjs
 *
 * Art: indigo rounded square, white ring + forward chevron (ride motion).
 * Maskable variants keep all art inside the 80% safe zone (full-bleed bg).
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [79, 70, 229, 255]; // #4f46e5 electric indigo
const FG = [255, 255, 255, 255];
const TRANSPARENT = [0, 0, 0, 0];

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function insideRoundedSquare(x, y, s, r) {
  if (x < r && y < r && (x - r) ** 2 + (y - r) ** 2 > r * r) return false;
  if (x >= s - r && y < r && (x - (s - r)) ** 2 + (y - r) ** 2 > r * r) return false;
  if (x < r && y >= s - r && (x - r) ** 2 + (y - (s - r)) ** 2 > r * r) return false;
  if (x >= s - r && y >= s - r && (x - (s - r)) ** 2 + (y - (s - r)) ** 2 > r * r) return false;
  return true;
}

/** Render at `size`; art centred, scaled by `scale` of canvas.
 *  scale 1.0 = full-bleed opaque square (maskable / apple-touch): no rounded
 *  corners, because transparent corners defeat the mask and iOS blacks them. */
function renderIcon(size, scale) {
  const buf = Buffer.alloc(size * size * 4);
  const s = size * scale;
  const off = (size - s) / 2;
  const cornerR = scale >= 1 ? 0 : s * 0.18;
  const cx = off + s / 2;
  const cy = off + s / 2;
  const ringOuter = s * 0.30;
  const ringInner = s * 0.24;
  // chevron: right-pointing wedge inside the ring
  const tipX = cx + s * 0.115;
  const backX = cx - s * 0.075;
  const halfW = s * 0.105;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4;
      const lx = px + 0.5 - off;
      const ly = py + 0.5 - off;
      let color = TRANSPARENT;
      if (lx >= 0 && ly >= 0 && lx < s && ly < s && insideRoundedSquare(lx, ly, s, cornerR)) {
        color = BG;
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        const dist = Math.hypot(dx, dy);
        const inRing = dist <= ringOuter && dist >= ringInner;
        const inChevron =
          px + 0.5 <= tipX &&
          px + 0.5 >= backX &&
          Math.abs(dy) <= halfW * ((px + 0.5 - backX) / (tipX - backX));
        if (inRing || inChevron) color = FG;
      }
      buf[idx] = color[0];
      buf[idx + 1] = color[1];
      buf[idx + 2] = color[2];
      buf[idx + 3] = color[3];
    }
  }
  return png(size, buf);
}

for (const app of ["apps/rider-web/public/icons", "apps/driver-web/public/icons"]) {
  mkdirSync(app, { recursive: true });
  writeFileSync(`${app}/icon-512.png`, renderIcon(512, 0.82));
  writeFileSync(`${app}/icon-192.png`, renderIcon(192, 0.82));
  writeFileSync(`${app}/apple-touch-icon.png`, renderIcon(180, 1.0));
  writeFileSync(`${app}/favicon-64.png`, renderIcon(64, 0.82));
  writeFileSync(`${app}/icon-512-maskable.png`, renderIcon(512, 1.0));
  writeFileSync(`${app}/icon-192-maskable.png`, renderIcon(192, 1.0));
  console.log(`icons -> ${app}`);
}
