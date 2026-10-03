// e2e mock of a request map's sheet: a synthetic plan set (grid lines with bubbles, walls, room tags, a title block),
// one page per level like a set kept as one PDF, handed out as a data: URL. 36 x 24 in like a real plan sheet. Nothing
// real in it.

const W = 2592;
const H = 1728;
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const ROWS = ['1', '2', '3', '4', '5'];
const GRID_X0 = 260;
const GRID_DX = 300;
const GRID_Y0 = 260;
const GRID_DY = 300;
/** The set's pages: one floor plan per level. */
const LEVELS = [1, 2, 3];

const n = (v: number) => String(Math.round(v * 100) / 100);

function circle(cx: number, cy: number, r: number): string {
  const k = r * 0.5523;
  return [
    `${n(cx + r)} ${n(cy)} m`,
    `${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
    `${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} c`,
    `${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
    `${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} c S`,
  ].join('\n');
}

function text(x: number, y: number, size: number, s: string): string {
  return `BT /F1 ${String(size)} Tf ${n(x)} ${n(y)} Td (${s}) Tj ET`;
}

function content(level: number): string {
  const out: string[] = ['0.2 0.2 0.2 RG 0.2 0.2 0.2 rg', '3 w 36 36 2520 1656 re S'];
  const right = GRID_X0 + GRID_DX * (COLS.length - 1);
  const top = H - GRID_Y0;
  const bottom = top - GRID_DY * (ROWS.length - 1);
  // Grid: dashed lines, a bubble with its letter or number at the end of each.
  out.push('0.6 w [24 8 4 8] 0 d');
  COLS.forEach((_, i) => {
    const x = GRID_X0 + i * GRID_DX;
    out.push(`${n(x)} ${n(bottom - 60)} m ${n(x)} ${n(top + 60)} l S`);
  });
  ROWS.forEach((_, j) => {
    const y = top - j * GRID_DY;
    out.push(`${n(GRID_X0 - 60)} ${n(y)} m ${n(right + 60)} ${n(y)} l S`);
  });
  out.push('[] 0 d 1.2 w');
  COLS.forEach((c, i) => {
    const x = GRID_X0 + i * GRID_DX;
    out.push(circle(x, top + 96, 30), text(x - 9, top + 87, 26, c));
  });
  ROWS.forEach((r, j) => {
    const y = top - j * GRID_DY;
    out.push(circle(GRID_X0 - 96, y, 30), text(GRID_X0 - 104, y - 9, 26, r));
  });
  // Walls: the outline, a corridor and two rows of rooms.
  out.push('8 w', `${n(GRID_X0)} ${n(bottom)} ${n(right - GRID_X0)} ${n(top - bottom)} re S`);
  const corridorTop = top - 2 * GRID_DY + 70;
  const corridorBottom = top - 2 * GRID_DY - 70;
  out.push(`${n(GRID_X0)} ${n(corridorTop)} m ${n(right)} ${n(corridorTop)} l S`);
  out.push(`${n(GRID_X0)} ${n(corridorBottom)} m ${n(right)} ${n(corridorBottom)} l S`);
  out.push('5 w');
  for (let i = 1; i < COLS.length - 1; i += 1) {
    const x = GRID_X0 + i * GRID_DX;
    out.push(`${n(x)} ${n(top)} m ${n(x)} ${n(corridorTop)} l S`, `${n(x)} ${n(corridorBottom)} m ${n(x)} ${n(bottom)} l S`);
  }
  for (let i = 0; i < COLS.length - 1; i += 1) {
    const cx = GRID_X0 + i * GRID_DX + GRID_DX / 2;
    out.push(text(cx - 62, top - 140, 22, `ROOM ${String(level)}${String(i + 1).padStart(2, '0')}`));
    out.push(text(cx - 62, bottom + 140, 22, `ROOM ${String(level)}${String(i + 11)}`));
  }
  out.push(text(GRID_X0 + 40, top - 2 * GRID_DY + 24, 22, 'CORRIDOR'));
  // Title block.
  out.push('3 w 2196 36 m 2196 1692 l S', '2196 330 m 2556 330 l S');
  out.push(
    text(2226, 270, 30, 'SAMPLE JOB A'),
    text(2226, 220, 22, `LEVEL 0${String(level)} FLOOR PLAN`),
    text(2226, 90, 90, `A-10${String(level)}`),
  );
  return out.join('\n');
}

function pdf(): string {
  // Objects: 1 catalog, 2 pages, 3 font, then each page and its content stream.
  const pageRef = (k: number) => 4 + 2 * k;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${LEVELS.map((_, k) => `${String(pageRef(k))} 0 R`).join(' ')}] /Count ${String(LEVELS.length)} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ...LEVELS.flatMap((level, k) => {
      const stream = content(level);
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(W)} ${String(H)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(pageRef(k) + 1)} 0 R >>`,
        `<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`,
      ];
    }),
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${String(i + 1)} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return body;
}

/** The synthetic sheet as a data: URL (ASCII only, so its length is its byte count). */
export function sheetUrl(): string {
  return `data:application/pdf;base64,${btoa(pdf())}`;
}
