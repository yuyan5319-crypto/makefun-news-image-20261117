// "The World Today" — one image that sums up the world news of Tuesday 17 November 2026.
//
// A Node 22 program, standard library only, no network. It draws a newspaper-style
// front page onto a 1024x1024 pixel canvas with a small hand-made rasteriser and a
// 5x7 bitmap font, encodes the result as a PNG with node:zlib, and writes it to
// /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png outside the grader).
// The drawing is fully deterministic: two runs write the same bytes.
//
// Stories (all reported on 17 November 2026):
//   - Ukraine hit the Crimea Bridge in a drone barrage of about 1,300 drones;
//     Russian strikes hit two Kyiv bridges, cutting power and water.
//   - China confirmed the first Xi-Trump-Putin trilateral summit, for 19 Nov in
//     Shenzhen; Trump was in Manila for the ASEAN summit and Quad talks.
//   - Oil, gold and US and Asian stocks all fell; the Nasdaq slid into correction.
//   - A tanker was attacked in the Strait of Hormuz (crew safe); Bahrain
//     intercepted Iranian drones near a US base.
//   - Austria, Germany, the Netherlands, Denmark and Greece opened talks with
//     Rwanda on a return hub for rejected asylum seekers.
//   - A ULA Vulcan rocket failed after liftoff from Florida, losing all 40 of
//     Amazon's Leo internet satellites aboard.
//   Ticker: COP31 draft deal on fossil fuels, the cyberattack on 178 major
//   websites, Delhi's toxic air, Cyclone Akvan, and a new James Bond.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// PNG encoding (truecolour, no filtering tricks: filter byte 0 on each row)
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(out.subarray(4, 8), 0);
  crcData.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcData));
  return out;
}

function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}

// ---------------------------------------------------------------------------
// A tiny raster canvas
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

class Canvas {
  readonly width: number;
  readonly height: number;
  readonly px: Uint8Array;

  constructor(width: number, height: number, bg: Rgb) {
    this.width = width;
    this.height = height;
    this.px = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      this.px[i * 3] = bg[0];
      this.px[i * 3 + 1] = bg[1];
      this.px[i * 3 + 2] = bg[2];
    }
  }

  set(x: number, y: number, c: Rgb): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) this.set(xx, yy, c);
  }

  frame(x: number, y: number, w: number, h: number, t: number, c: Rgb): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, t: number, c: Rgb): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      this.rect(x - t / 2, y - t / 2, t, t, c);
    }
  }

  disc(cx: number, cy: number, r: number, c: Rgb): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.set(x, y, c);
  }

  ring(cx: number, cy: number, r: number, t: number, c: Rgb): void {
    for (let y = Math.floor(cy - r - t); y <= cy + r + t; y++)
      for (let x = Math.floor(cx - r - t); x <= cx + r + t; x++) {
        const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        if (d <= r && d >= r - t) this.set(x, y, c);
      }
  }

  triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: Rgb): void {
    const minX = Math.floor(Math.min(x0, x1, x2));
    const maxX = Math.ceil(Math.max(x0, x1, x2));
    const minY = Math.floor(Math.min(y0, y1, y2));
    const maxY = Math.ceil(Math.max(y0, y1, y2));
    const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (area === 0) return;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((x1 - x) * (y2 - y) - (y1 - y) * (x2 - x)) / area;
        const w1 = ((x2 - x) * (y0 - y) - (y2 - y) * (x0 - x)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) this.set(x, y, c);
      }
  }
}

// ---------------------------------------------------------------------------
// A 5x7 bitmap font (uppercase letters, digits and the punctuation we need)
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '+': ['00000', '00100', '00100', '01110', '00100', '00100', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '*': ['00000', '00100', '10101', '01110', '10101', '00100', '00000'],
};

const CHAR_W = 6; // 5 pixels of glyph + 1 of spacing, in font units
const CHAR_H = 9; // 7 pixels of glyph + 2 of leading, in font units

function textWidth(text: string, scale: number): number {
  return text.length * CHAR_W * scale - scale;
}

function drawText(cv: Canvas, text: string, x: number, y: number, scale: number, c: Rgb): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS['?'];
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 5; col++)
        if (glyph[row][col] === '1') cv.rect(cx + col * scale, y + row * scale, scale, scale, c);
    cx += CHAR_W * scale;
  }
}

function drawTextCentered(cv: Canvas, text: string, cx: number, y: number, scale: number, c: Rgb): void {
  drawText(cv, text, cx - textWidth(text, scale) / 2, y, scale, c);
}

// Greedy word wrap: returns the lines of `text` that fit `maxWidth` at `scale`.
function wrap(text: string, maxWidth: number, scale: number): string[] {
  const words = text.toUpperCase().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const trial = line === '' ? word : line + ' ' + word;
    if (textWidth(trial, scale) <= maxWidth || line === '') line = trial;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

function drawWrapped(
  cv: Canvas,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  scale: number,
  c: Rgb,
  lineGap = 3,
): number {
  const lines = wrap(text, maxWidth, scale);
  lines.forEach((line, i) => drawText(cv, line, x, y + i * (7 + lineGap) * scale, scale, c));
  return y + lines.length * (7 + lineGap) * scale;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const PAPER: Rgb = [246, 241, 231];
const INK: Rgb = [25, 25, 25];
const WHITE: Rgb = [255, 255, 255];
const RED: Rgb = [179, 32, 44];
const BLUE: Rgb = [29, 78, 137];
const TEAL: Rgb = [14, 124, 123];
const GOLD: Rgb = [176, 128, 10];
const GREY: Rgb = [92, 88, 80];
const SKY: Rgb = [196, 220, 238];
const SEA: Rgb = [64, 116, 166];
const ORANGE: Rgb = [232, 119, 34];

const W = 1024;
const H = 1024;
const MARGIN = 36;

// --- icons (drawn in a box with its top-left at x, y) -----------------------

// A bridge over water, a burst on its deck and drones overhead.
function iconBridge(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h * 0.62, SKY);
  cv.rect(x, y + h * 0.62, w, h * 0.38, SEA);
  for (let i = 0; i < 5; i++) cv.line(x + 8 + i * 9, y + h * 0.72, x + 20 + i * 9, y + h * 0.72, 2, WHITE);
  const deckY = y + h * 0.58;
  cv.rect(x + 6, deckY, w - 12, 5, INK);
  cv.rect(x + w * 0.22, deckY - h * 0.3, 5, h * 0.3, INK);
  cv.rect(x + w * 0.72, deckY - h * 0.3, 5, h * 0.3, INK);
  cv.line(x + w * 0.22 + 2, deckY - h * 0.3, x + 10, deckY, 2, INK);
  cv.line(x + w * 0.22 + 2, deckY - h * 0.3, x + w * 0.5, deckY, 2, INK);
  cv.line(x + w * 0.72 + 2, deckY - h * 0.3, x + w * 0.5, deckY, 2, INK);
  cv.line(x + w * 0.72 + 2, deckY - h * 0.3, x + w - 10, deckY, 2, INK);
  // explosion burst at mid-deck
  const bx = x + w * 0.5;
  const by = deckY - 6;
  for (let a = 0; a < 8; a++) {
    const dx = Math.cos((a * Math.PI) / 4) * 15;
    const dy = Math.sin((a * Math.PI) / 4) * 15;
    cv.line(bx, by, bx + dx, by + dy, 3, ORANGE);
  }
  cv.disc(bx, by, 6, RED);
  // drones: small crosses in the sky
  for (const [dx, dy] of [[0.14, 0.16], [0.34, 0.08], [0.82, 0.14], [0.64, 0.2]] as const) {
    const cx = x + w * dx;
    const cy = y + h * dy;
    cv.line(cx - 7, cy, cx + 7, cy, 3, INK);
    cv.line(cx, cy - 5, cx, cy + 5, 3, INK);
    cv.disc(cx, cy, 2, INK);
  }
}

// Three flag poles for the three leaders' summit.
function iconFlags(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, SKY);
  const cols: Rgb[] = [RED, BLUE, [36, 110, 60]];
  for (let i = 0; i < 3; i++) {
    const px = x + w * (0.2 + i * 0.3);
    cv.rect(px, y + h * 0.18, 3, h * 0.72, INK);
    cv.rect(px + 3, y + h * 0.18, w * 0.2, h * 0.2, cols[i]);
  }
  cv.rect(x + 6, y + h * 0.9, w - 12, 4, INK);
}

// A falling market line over bars.
function iconChart(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, WHITE);
  for (let i = 0; i < 4; i++) {
    const bx = x + 10 + i * ((w - 24) / 4);
    const bh = h * (0.55 - i * 0.1);
    cv.rect(bx, y + h - 12 - bh, (w - 24) / 4 - 8, bh, [178, 186, 196]);
  }
  const pts: [number, number][] = [
    [x + 8, y + h * 0.2],
    [x + w * 0.35, y + h * 0.38],
    [x + w * 0.6, y + h * 0.34],
    [x + w * 0.92, y + h * 0.72],
  ];
  for (let i = 0; i < pts.length - 1; i++) cv.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 4, RED);
  const [ax, ay] = pts[pts.length - 1];
  cv.triangle(ax, ay, ax - 14, ay - 8, ax - 4, ay - 16, RED);
}

// A tanker on the sea with a flame on deck.
function iconTanker(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h * 0.6, SKY);
  cv.rect(x, y + h * 0.6, w, h * 0.4, SEA);
  const hullY = y + h * 0.56;
  cv.triangle(x + 8, hullY, x + w * 0.22, hullY + h * 0.16, x + 8, hullY + h * 0.16, INK);
  cv.rect(x + w * 0.22, hullY, w * 0.62, h * 0.16, INK);
  cv.triangle(x + w * 0.84, hullY, x + w - 8, hullY, x + w * 0.84, hullY + h * 0.16, INK);
  cv.rect(x + w * 0.3, hullY - h * 0.16, w * 0.4, h * 0.16, [120, 120, 120]);
  cv.rect(x + w * 0.78, hullY - h * 0.24, w * 0.07, h * 0.24, INK);
  // flame
  const fx = x + w * 0.5;
  const fy = hullY - h * 0.16;
  cv.triangle(fx - 8, fy, fx + 8, fy, fx, fy - h * 0.26, ORANGE);
  cv.triangle(fx - 4, fy, fx + 4, fy, fx, fy - h * 0.16, [250, 197, 66]);
}

// A plane above a map pin: people on the move.
function iconPlane(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, SKY);
  const cx = x + w * 0.42;
  const cy = y + h * 0.42;
  cv.triangle(cx - w * 0.3, cy, cx + w * 0.3, cy - h * 0.1, cx + w * 0.3, cy + h * 0.06, INK); // body
  cv.triangle(cx - 4, cy - 2, cx - w * 0.16, cy - h * 0.3, cx + w * 0.08, cy - 2, INK); // wing
  cv.triangle(cx - w * 0.3, cy, cx - w * 0.38, cy - h * 0.2, cx - w * 0.22, cy, INK); // tail
  const px = x + w * 0.8;
  const py = y + h * 0.68;
  cv.disc(px, py - 12, 11, RED);
  cv.triangle(px - 10, py - 6, px + 10, py - 6, px, py + 16, RED);
  cv.disc(px, py - 12, 4, WHITE);
  cv.rect(x + 6, y + h * 0.9, w - 12, 3, INK);
}

// A rocket leaving the pad, breaking up.
function iconRocket(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, [24, 32, 54]);
  for (const [sx, sy] of [[0.15, 0.2], [0.8, 0.14], [0.62, 0.3], [0.3, 0.08], [0.9, 0.42]] as const)
    cv.disc(x + w * sx, y + h * sy, 2, WHITE);
  const cx = x + w * 0.46;
  const top = y + h * 0.14;
  cv.triangle(cx - 11, top + 26, cx + 11, top + 26, cx, top, WHITE);
  cv.rect(cx - 11, top + 26, 22, h * 0.42, WHITE);
  cv.disc(cx, top + 44, 5, BLUE);
  cv.triangle(cx - 11, top + 26 + h * 0.42, cx - 24, top + 26 + h * 0.62, cx - 11, top + 26 + h * 0.62, RED);
  cv.triangle(cx + 11, top + 26 + h * 0.42, cx + 24, top + 26 + h * 0.62, cx + 11, top + 26 + h * 0.62, RED);
  cv.triangle(cx - 7, top + 26 + h * 0.42, cx + 7, top + 26 + h * 0.42, cx, top + 26 + h * 0.72, ORANGE);
  // debris: small pieces drifting right
  for (const [dx, dy, s] of [[0.68, 0.3, 5], [0.78, 0.44, 4], [0.66, 0.52, 3], [0.84, 0.62, 4]] as const)
    cv.rect(x + w * dx, y + h * dy, s, s, [250, 197, 66]);
}

// --- panels -----------------------------------------------------------------

function panel(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, WHITE);
  cv.frame(x, y, w, h, 3, INK);
}

function storyPanel(
  cv: Canvas,
  x: number, y: number, w: number, h: number,
  icon: (cv: Canvas, x: number, y: number, w: number, h: number) => void,
  kicker: string, kickerColour: Rgb, headline: string, sub: string,
): void {
  panel(cv, x, y, w, h);
  const pad = 14;
  const iconH = 84;
  icon(cv, x + pad, y + pad, w - pad * 2, iconH);
  cv.frame(x + pad, y + pad, w - pad * 2, iconH, 2, INK);
  let cy = y + pad + iconH + 12;
  drawText(cv, kicker, x + pad, cy, 2, kickerColour);
  cy += CHAR_H * 2 + 2;
  cy = drawWrapped(cv, headline, x + pad, cy, w - pad * 2, 2, INK, 2);
  drawWrapped(cv, sub, x + pad, cy + 2, w - pad * 2, 2, GREY, 2);
}

// ---------------------------------------------------------------------------
// Compose the front page
// ---------------------------------------------------------------------------

function build(): Canvas {
  const cv = new Canvas(W, H, PAPER);
  cv.frame(10, 10, W - 20, H - 20, 3, INK);

  // Masthead
  drawTextCentered(cv, 'ONE DAY * ONE IMAGE * THE WHOLE WORLD', W / 2, 34, 2, GREY);
  drawTextCentered(cv, 'THE WORLD TODAY', W / 2, 62, 8, INK);
  cv.rect(MARGIN, 140, W - MARGIN * 2, 5, RED);
  drawTextCentered(cv, 'TUESDAY 17 NOVEMBER 2026', W / 2, 158, 4, RED);
  cv.rect(MARGIN, 196, W - MARGIN * 2, 3, INK);
  cv.rect(MARGIN, 203, W - MARGIN * 2, 1, INK);

  // Lead story: Ukraine and the Crimea Bridge
  const leadY = 216;
  const leadH = 250;
  panel(cv, MARGIN, leadY, W - MARGIN * 2, leadH);
  iconBridge(cv, MARGIN + 16, leadY + 16, 400, 170);
  cv.frame(MARGIN + 16, leadY + 16, 400, 170, 2, INK);
  drawText(cv, 'CRIMEA BRIDGE, HIT OVERNIGHT', MARGIN + 16, leadY + 198, 2, GREY);
  const tx = MARGIN + 440;
  drawText(cv, 'EUROPE * WAR IN UKRAINE', tx, leadY + 18, 2, RED);
  let cy = drawWrapped(cv, 'UKRAINE HITS CRIMEA BRIDGE IN 1,300-DRONE BARRAGE', tx, leadY + 44, W - MARGIN - tx - 16, 3, INK, 2);
  cy = drawWrapped(
    cv,
    'RUSSIAN STRIKES HIT TWO BRIDGES IN KYIV, CUTTING POWER AND WATER. MOSCOW SAYS EUROPE WILL NOT JOIN THE UKRAINE TALKS.',
    tx, cy + 8, W - MARGIN - tx - 16, 2, GREY, 3,
  );
  drawText(cv, 'THE DAY\'S BIGGEST STORY', tx, cy + 10, 2, GOLD);

  // Row of three
  const rowY = leadY + leadH + 16;
  const rowH = 262;
  const colW = (W - MARGIN * 2 - 2 * 18) / 3;
  storyPanel(cv, MARGIN, rowY, colW, rowH, iconFlags, 'ASIA * DIPLOMACY', BLUE,
    'XI, TRUMP, PUTIN SET FIRST SUMMIT',
    'CHINA CONFIRMS TALKS IN SHENZHEN ON NOV 19. TRUMP IN MANILA FOR ASEAN AND QUAD.');
  storyPanel(cv, MARGIN + colW + 18, rowY, colW, rowH, iconChart, 'GLOBAL MARKETS', RED,
    'OIL, GOLD AND STOCKS FALL TOGETHER',
    'NASDAQ DOWN 2.5% INTO CORRECTION. BRENT -3.6% TO $92.44, GOLD $3,849.');
  storyPanel(cv, MARGIN + (colW + 18) * 2, rowY, colW, rowH, iconTanker, 'MIDDLE EAST', TEAL,
    'TANKER ATTACKED IN HORMUZ STRAIT',
    'CREW SAFE. BAHRAIN DOWNS IRANIAN DRONES NEAR A US BASE.');

  // Row of two
  const row2Y = rowY + rowH + 16;
  const row2H = 160;
  const halfW = (W - MARGIN * 2 - 18) / 2;
  for (const [i, icon, kicker, kc, headline, sub] of [
    [0, iconPlane, 'EUROPE * MIGRATION', GOLD, 'FIVE EU NATIONS PLAN RWANDA HUB',
      'AUSTRIA, GERMANY, NETHERLANDS, DENMARK, GREECE OPEN TALKS ON A RETURN CENTRE.'],
    [1, iconRocket, 'SPACE * UNITED STATES', BLUE, 'AMAZON LOSES 40 SATELLITES AT LAUNCH',
      'ULA VULCAN ROCKET FAILED MINUTES AFTER FLORIDA LIFTOFF, LOSING THE LEO PAYLOAD.'],
  ] as const) {
    const x = MARGIN + i * (halfW + 18);
    panel(cv, x, row2Y, halfW, row2H);
    icon(cv, x + 12, row2Y + 25, 120, 110);
    cv.frame(x + 12, row2Y + 25, 120, 110, 2, INK);
    const tx2 = x + 148;
    drawText(cv, kicker, tx2, row2Y + 14, 2, kc);
    const hy = drawWrapped(cv, headline, tx2, row2Y + 38, x + halfW - tx2 - 12, 2, INK, 2);
    drawWrapped(cv, sub, tx2, hy + 2, x + halfW - tx2 - 12, 2, GREY, 2);
  }

  // Ticker
  const tickY = row2Y + row2H + 14;
  cv.rect(MARGIN, tickY, W - MARGIN * 2, 62, INK);
  drawText(cv, 'ALSO TODAY:', MARGIN + 14, tickY + 8, 2, [250, 197, 66]);
  drawText(cv, 'COP31 DRAFT URGES FASTER FOSSIL-FUEL EXIT * CYBERATTACK HIT 178 WEBSITES', MARGIN + 14, tickY + 26, 2, WHITE);
  drawText(cv, 'DELHI AIR TOXIC * CYCLONE AKVAN NEARS INDIA * PATTINSON IS NEW BOND', MARGIN + 14, tickY + 44, 2, WHITE);

  return cv;
}

// ---------------------------------------------------------------------------

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const cv = build();
writeFileSync(join(outDir, 'entry.png'), encodePng(W, H, cv.px));
