import { describe, expect, it } from 'vitest';
import { dataCodewords, encodeQr, formatBits, qrPath, rsRemainder, versionBits } from './qr';

const LINK = `https://app.example.test/r/3f2b9c4e-1d2a-4b7c-9e8f-0a1b2c3d4e5f?t=${'A'.repeat(43)}`;

function at(m: boolean[][], row: number, col: number): boolean {
  const v = m[row]?.[col];
  if (v === undefined) throw new Error(`no module at ${String(row)},${String(col)}`);
  return v;
}

/** Reads bits (least significant first) from the listed modules. */
function read(m: boolean[][], cells: [number, number][]): number {
  return cells.reduce((acc, [r, c], i) => acc | ((at(m, r, c) ? 1 : 0) << i), 0);
}

describe('qr', () => {
  it('Reed-Solomon: the standard 1-M "HELLO WORLD" example gets its known EC codewords', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('format bits for level M match the standard table', () => {
    const table = ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001',
      '100000011001110', '100111110010111', '100101010100000'];
    table.forEach((bits, mask) => {
      expect(formatBits(mask).toString(2).padStart(15, '0')).toBe(bits);
    });
  });

  it('version bits for versions 7-10 match the standard table', () => {
    expect([7, 8, 9, 10].map(versionBits)).toEqual([0x07c94, 0x085bc, 0x09a99, 0x0a4d3]);
  });

  it('byte mode: mode, count, data, terminator, then 0xEC 0x11 padding', () => {
    expect(dataCodewords(new TextEncoder().encode('hello'), 1)).toEqual([
      0x40, 0x56, 0x86, 0x56, 0xc6, 0xc6, 0xf0, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec,
    ]);
  });

  it('picks the smallest version that fits and refuses what does not', () => {
    expect([14, 15, 106, 107, 213].map((n) => encodeQr('a'.repeat(n)).version)).toEqual([1, 2, 6, 7, 10]);
    expect(encodeQr(LINK).size).toBe(17 + 4 * encodeQr(LINK).version);
    expect(() => encodeQr('a'.repeat(214))).toThrow(/Too long/);
  });

  it('draws the fixed patterns: finders, separators, timing, the dark module, format and version information', () => {
    const q = encodeQr(LINK);
    const m = q.modules;
    const n = q.size;
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      for (let i = 0; i < 7; i++) {
        expect(at(m, r0, c0 + i) && at(m, r0 + 6, c0 + i) && at(m, r0 + i, c0) && at(m, r0 + i, c0 + 6)).toBe(true);
      }
      expect(at(m, r0 + 1, c0 + 1) || at(m, r0 + 5, c0 + 5)).toBe(false);
      expect(at(m, r0 + 3, c0 + 3)).toBe(true);
    }
    for (let i = 0; i < 8; i++) expect(at(m, 7, i) || at(m, i, 7)).toBe(false);
    for (let c = 8; c < n - 8; c++) expect(at(m, 6, c)).toBe(c % 2 === 0);
    for (let r = 8; r < n - 8; r++) expect(at(m, r, 6)).toBe(r % 2 === 0);
    expect(at(m, n - 8, 8)).toBe(true);

    const first: [number, number][] = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7],
      [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]];
    const second: [number, number][] = [
      ...Array.from({ length: 8 }, (_, i): [number, number] => [8, n - 1 - i]),
      ...Array.from({ length: 7 }, (_, i): [number, number] => [n - 7 + i, 8]),
    ];
    expect(read(m, first)).toBe(formatBits(q.mask));
    expect(read(m, second)).toBe(formatBits(q.mask));

    expect(q.version).toBeGreaterThanOrEqual(7);
    const block = Array.from({ length: 18 }, (_, i): [number, number] => [Math.floor(i / 3), n - 11 + (i % 3)]);
    expect(read(m, block)).toBe(versionBits(q.version));
    expect(read(m, block.map(([r, c]) => [c, r]))).toBe(versionBits(q.version));
  });

  it('renders one path of whole modules inside the quiet zone', () => {
    const q = encodeQr('hello');
    const path = qrPath(q);
    expect(path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
    const runs = [...path.matchAll(/M(\d+) (\d+)h(\d+)/g)].map((x) => x.slice(1).map(Number));
    expect(runs.reduce((a, [, , w]) => a + (w ?? 0), 0)).toBe(q.modules.flat().filter(Boolean).length);
    expect(Math.min(...runs.map(([x]) => x ?? 0), ...runs.map(([, y]) => y ?? 0))).toBe(4);
    expect(Math.max(...runs.map(([x, , w]) => (x ?? 0) + (w ?? 0)))).toBe(q.size + 4);
  });
});
