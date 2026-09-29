// A small QR code encoder (ISO/IEC 18004) for the request link's QR sheet: byte mode (UTF-8), error correction level
// M, the smallest of versions 1-10 that fits (up to 213 bytes; a request link is about 90-130), all eight masks
// scored with the four penalty rules, format and version information. Renders to one SVG path. No dependency: the app
// bundles everything (SPEC §6.6) and adding one needs Jesse's OK. Pure; unit-tested in qr.test.ts, and real links
// were decoded from the rendered SVG by OpenCV's QR detector.

interface QrCode {
  version: number;
  mask: number;
  /** Modules per side (17 + 4 * version). */
  size: number;
  /** [row][column]; true = dark. */
  modules: boolean[][];
}

/** Level M for versions 1-10: EC codewords per block, and each block's data codeword count (shorter blocks first). */
const LEVEL_M: readonly { ec: number; blocks: readonly number[] }[] = [
  { ec: 10, blocks: [16] },
  { ec: 16, blocks: [28] },
  { ec: 26, blocks: [44] },
  { ec: 18, blocks: [32, 32] },
  { ec: 24, blocks: [43, 43] },
  { ec: 16, blocks: [27, 27, 27, 27] },
  { ec: 18, blocks: [31, 31, 31, 31] },
  { ec: 22, blocks: [38, 38, 39, 39] },
  { ec: 22, blocks: [36, 36, 36, 37, 37] },
  { ec: 26, blocks: [43, 43, 43, 43, 44] },
];

/** Alignment pattern centers (rows and columns) for versions 1-10. */
const ALIGN: readonly (readonly number[])[] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

const MAX_VERSION = LEVEL_M.length;
/** Level M's two format bits (L = 01, M = 00, Q = 11, H = 10). */
const EC_M = 0;

// ---------------------------------------------------------------------------------------------------------------------
// Reed-Solomon over GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
// ---------------------------------------------------------------------------------------------------------------------
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** The generator polynomial of the given degree, without its leading 1 (highest power first). */
function rsDivisor(degree: number): number[] {
  const out = new Array<number>(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j] ?? 0, root) ^ (j + 1 < degree ? (out[j + 1] ?? 0) : 0);
    }
    root = gfMul(root, 0x02);
  }
  return out;
}

/** The EC codewords for one block of data codewords. */
export function rsRemainder(data: readonly number[], ecCount: number): number[] {
  const divisor = rsDivisor(ecCount);
  const out = new Array<number>(ecCount).fill(0);
  for (const b of data) {
    const factor = b ^ (out.shift() ?? 0);
    out.push(0);
    divisor.forEach((coef, i) => {
      out[i] = (out[i] ?? 0) ^ gfMul(coef, factor);
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Format and version information (BCH codes)
// ---------------------------------------------------------------------------------------------------------------------
/** The 15 format bits for level M and a mask, masked with 0x5412. */
export function formatBits(mask: number): number {
  const data = (EC_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

/** The 18 version bits (versions 7 and up). */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | (rem & 0xfff);
}

const bit = (value: number, i: number): boolean => ((value >>> i) & 1) !== 0;

// ---------------------------------------------------------------------------------------------------------------------
// The grid: modules plus which of them are function patterns (never data, never masked)
// ---------------------------------------------------------------------------------------------------------------------
interface Grid {
  size: number;
  dark: boolean[][];
  fixed: boolean[][];
}

function newGrid(size: number): Grid {
  const blank = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  return { size, dark: blank(), fixed: blank() };
}

function isDark(g: Grid, row: number, col: number): boolean {
  return g.dark[row]?.[col] ?? false;
}

function setModule(g: Grid, row: number, col: number, dark: boolean, fixed: boolean): void {
  const r = g.dark[row];
  const f = g.fixed[row];
  if (!r || !f || col < 0 || col >= g.size) return;
  r[col] = dark;
  if (fixed) f[col] = true;
}

/** A finder pattern centered at (row, col), with its light separator ring (clipped at the edges). */
function drawFinder(g: Grid, row: number, col: number): void {
  for (let dr = -4; dr <= 4; dr++) {
    for (let dc = -4; dc <= 4; dc++) {
      const d = Math.max(Math.abs(dr), Math.abs(dc));
      setModule(g, row + dr, col + dc, d !== 2 && d !== 4, true);
    }
  }
}

function drawAlignment(g: Grid, row: number, col: number): void {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) setModule(g, row + dr, col + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1, true);
  }
}

/** Both copies of the format bits, and the dark module. Also reserves the areas before the mask is known. */
function drawFormat(g: Grid, mask: number): void {
  const bits = formatBits(mask);
  const n = g.size;
  for (let i = 0; i <= 5; i++) setModule(g, i, 8, bit(bits, i), true);
  setModule(g, 7, 8, bit(bits, 6), true);
  setModule(g, 8, 8, bit(bits, 7), true);
  setModule(g, 8, 7, bit(bits, 8), true);
  for (let i = 9; i < 15; i++) setModule(g, 8, 14 - i, bit(bits, i), true);
  for (let i = 0; i < 8; i++) setModule(g, 8, n - 1 - i, bit(bits, i), true);
  for (let i = 8; i < 15; i++) setModule(g, n - 15 + i, 8, bit(bits, i), true);
  setModule(g, n - 8, 8, true, true);
}

function drawVersion(g: Grid, version: number): void {
  if (version < 7) return;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const a = g.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setModule(g, b, a, bit(bits, i), true);
    setModule(g, a, b, bit(bits, i), true);
  }
}

function drawFunctionPatterns(g: Grid, version: number): void {
  const n = g.size;
  for (let i = 0; i < n; i++) {
    setModule(g, 6, i, i % 2 === 0, true);
    setModule(g, i, 6, i % 2 === 0, true);
  }
  drawFinder(g, 3, 3);
  drawFinder(g, 3, n - 4);
  drawFinder(g, n - 4, 3);
  const centers = ALIGN[version - 1] ?? [];
  const last = centers.length - 1;
  centers.forEach((r, i) => {
    centers.forEach((c, j) => {
      // The three corners of the grid sit on the finder patterns.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      drawAlignment(g, r, c);
    });
  });
  drawFormat(g, 0);
  drawVersion(g, version);
}

// ---------------------------------------------------------------------------------------------------------------------
// Data: byte mode segment, padding, EC blocks, interleaving, zigzag placement
// ---------------------------------------------------------------------------------------------------------------------
function dataCapacity(version: number): number {
  return (LEVEL_M[version - 1]?.blocks ?? []).reduce((a, b) => a + b, 0);
}

function countBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

function pickVersion(byteCount: number): number {
  for (let v = 1; v <= MAX_VERSION; v++) {
    if (4 + countBits(v) + byteCount * 8 <= dataCapacity(v) * 8) return v;
  }
  throw new Error(`Too long for a QR code here (${String(byteCount)} bytes).`);
}

export function dataCodewords(bytes: Uint8Array, version: number): number[] {
  const capacity = dataCapacity(version);
  const bits: boolean[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push(bit(value, i));
  };
  push(0b0100, 4);
  push(bytes.length, countBits(version));
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity * 8 - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | (b ? 1 : 0), 0));
  for (let pad = 0xec; out.length < capacity; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

function withEc(data: readonly number[], version: number): number[] {
  const { ec, blocks } = LEVEL_M[version - 1] ?? { ec: 0, blocks: [] };
  const dataBlocks: number[][] = [];
  let at = 0;
  for (const length of blocks) {
    dataBlocks.push(data.slice(at, at + length));
    at += length;
  }
  const ecBlocks = dataBlocks.map((d) => rsRemainder(d, ec));
  const out: number[] = [];
  const longest = Math.max(...blocks);
  for (let i = 0; i < longest; i++) for (const d of dataBlocks) if (i < d.length) out.push(d[i] ?? 0);
  for (let i = 0; i < ec; i++) for (const e of ecBlocks) out.push(e[i] ?? 0);
  return out;
}

function placeData(g: Grid, codewords: readonly number[]): void {
  const n = g.size;
  const total = codewords.length * 8;
  let i = 0;
  for (let pair = n - 1; pair >= 1; pair -= 2) {
    // Column 6 is the vertical timing pattern: the pairs left of it shift one column left.
    const right = pair <= 6 ? pair - 1 : pair;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < n; step++) {
      const row = upward ? n - 1 - step : step;
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        if (g.fixed[row]?.[col] || i >= total) continue;
        setModule(g, row, col, bit(codewords[i >>> 3] ?? 0, 7 - (i & 7)), false);
        i++;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Masks and the penalty score
// ---------------------------------------------------------------------------------------------------------------------
function maskHit(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function masked(g: Grid, mask: number): Grid {
  const out: Grid = { size: g.size, dark: g.dark.map((r) => [...r]), fixed: g.fixed.map((r) => [...r]) };
  for (let row = 0; row < g.size; row++) {
    for (let col = 0; col < g.size; col++) {
      if (!g.fixed[row]?.[col] && maskHit(mask, row, col)) setModule(out, row, col, !isDark(g, row, col), false);
    }
  }
  drawFormat(out, mask);
  return out;
}

/** N1 (runs of 5+), N3 (finder-like 1:1:3:1:1 with four light modules on a side) for one row or column. */
function lineScore(line: readonly boolean[]): number {
  let score = 0;
  let run = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) {
      run++;
      continue;
    }
    if (run >= 5) score += run - 2;
    run = 1;
  }
  const text = line.map((d) => (d ? '1' : '0')).join('');
  for (const pattern of ['10111010000', '00001011101']) {
    for (let at = text.indexOf(pattern); at !== -1; at = text.indexOf(pattern, at + 1)) score += 40;
  }
  return score;
}

function penalty(modules: readonly (readonly boolean[])[]): number {
  const n = modules.length;
  let score = 0;
  let dark = 0;
  for (let i = 0; i < n; i++) {
    const row = modules[i] ?? [];
    score += lineScore(row) + lineScore(modules.map((r) => r[i] ?? false));
    dark += row.filter(Boolean).length;
  }
  for (let r = 0; r + 1 < n; r++) {
    for (let c = 0; c + 1 < n; c++) {
      const v = modules[r]?.[c];
      if (modules[r]?.[c + 1] === v && modules[r + 1]?.[c] === v && modules[r + 1]?.[c + 1] === v) score += 3;
    }
  }
  return score + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
}

// ---------------------------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------------------------
/** Encodes text (UTF-8, byte mode, level M) into the smallest version that fits, with the best-scoring mask. */
export function encodeQr(text: string): QrCode {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const base = newGrid(17 + 4 * version);
  drawFunctionPatterns(base, version);
  placeData(base, withEc(dataCodewords(bytes, version), version));
  let best = { mask: 0, grid: masked(base, 0), score: Infinity };
  for (let mask = 0; mask < 8; mask++) {
    const grid = masked(base, mask);
    const score = penalty(grid.dark);
    if (score < best.score) best = { mask, grid, score };
  }
  return { version, mask: best.mask, size: base.size, modules: best.grid.dark };
}

/** One SVG path of the dark modules (runs merged per row), offset by a quiet zone. viewBox: 0 0 size+2q size+2q. */
export function qrPath(code: QrCode, quiet = 4): string {
  const parts: string[] = [];
  code.modules.forEach((row, r) => {
    let c = 0;
    while (c < code.size) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < code.size && row[c]) c++;
      parts.push(`M${String(start + quiet)} ${String(r + quiet)}h${String(c - start)}v1h-${String(c - start)}z`);
    }
  });
  return parts.join('');
}
