#!/usr/bin/env python3
"""Place a job's rated walls on their plan sheets from the room pictures (OFS job setup, step "walls on the plan").

Each room picture is a crop of a floor plan sheet with the room's walls traced on it (rev_room_walls.line, fractions of
the picture). This finds where each picture sits on its sheet (edge template matching over a range of scales) and turns
each traced line into the sheet's fractions (rev_areas.geom), the coordinates the app's Plan view draws in.

Input (JSON on stdin or --input): {"sheets": {"A201A": "/path/A201A ....pdf", ...},
  "rooms": [{"image": "/path/Room 0127.png", "sheet": "A201A", "crop": [x0, y0, x1, y1] and "scale": [lo, hi] (both optional),
             "walls": [{"area_id": "...", "line": [[x, y], ...]}, ...]}, ...]}
Output (JSON on stdout): {"placed": [{"area_id", "sheet", "geom", "score", "room"}], "rooms": [{"image", "sheet",
  "score", "box"}], "weak": [image names whose best match scored under --min-score]}

Nothing here writes to the database: the lead reviews the output, then saves each wall's line with rev_area_draw (or a
one-off SQL load run as the job's manager). Needs numpy, opencv (cv2) and pdftoppm.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np

DPI = 72  # one pixel per PDF point: enough to match, cheap to search


def render(pdf: str, dpi: int) -> np.ndarray:
    """Page 1 of the PDF as a grayscale image, rotation applied (as the app's pdf.js shows it)."""
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, 'p')
        subprocess.run(['pdftoppm', '-r', str(dpi), '-f', '1', '-l', '1', '-gray', '-png', pdf, out], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        name = next(f for f in os.listdir(d) if f.endswith('.png'))
        img = cv2.imread(os.path.join(d, name), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise RuntimeError(f'could not render {pdf}')
    return img


def edges(img: np.ndarray) -> np.ndarray:
    """Line work only: dark strokes as white, blurred a little so a one-pixel offset still overlaps."""
    ink = (img < 160).astype(np.uint8) * 255
    return cv2.GaussianBlur(ink, (3, 3), 0)


def find(sheet_e: np.ndarray, tmpl: np.ndarray, scales: np.ndarray) -> tuple[float, float, tuple[int, int], tuple[int, int]]:
    """Best (score, scale, top-left, size) of the template on the sheet over the scales."""
    best = (-1.0, 0.0, (0, 0), (0, 0))
    sh, sw = sheet_e.shape
    for s in scales:
        h, w = int(round(tmpl.shape[0] * s)), int(round(tmpl.shape[1] * s))
        if h < 24 or w < 24 or h >= sh or w >= sw:
            continue
        t = edges(cv2.resize(tmpl, (w, h), interpolation=cv2.INTER_AREA))
        if t.std() < 1:
            continue
        res = cv2.matchTemplate(sheet_e, t, cv2.TM_CCOEFF_NORMED)
        _, v, _, loc = cv2.minMaxLoc(res)
        if v > best[0]:
            best = (float(v), float(s), (int(loc[0]), int(loc[1])), (w, h))
    return best


def locate(sheet: np.ndarray, sheet_e: np.ndarray, tmpl: np.ndarray, min_px: int,
           scale: list[float] | None = None) -> tuple[float, tuple[int, int, int, int]]:
    """Coarse scale sweep, then a fine one around the best. Returns (score, (x, y, w, h)) in sheet pixels.
    min_px: the smallest the picture may be on the sheet (its longest side, in points). Shrunk smaller, a picture
    turns into a speck that matches noise with a high score (Hunter Hall: every false match was under 60 px)."""
    if scale:  # known from the job's other pictures (they are usually cut at one resolution)
        score, _, (x, y), (w, h) = find(sheet_e, tmpl, np.linspace(scale[0], scale[1], 25))
        return score, (x, y, w, h)
    longest = max(tmpl.shape)
    lo, hi = min_px / longest, min(sheet.shape) * 0.95 / longest
    coarse = np.geomspace(lo, hi, 60)
    score, s, _, _ = find(sheet_e, tmpl, coarse)
    fine = np.linspace(s * 0.93, s * 1.07, 29)
    score, s, (x, y), (w, h) = find(sheet_e, tmpl, fine)
    return score, (x, y, w, h)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--input', help='JSON input file (default: stdin)')
    ap.add_argument('--min-score', type=float, default=0.45)
    ap.add_argument('--min-px', type=int, default=150, help='smallest a room picture may be on the sheet (points)')
    ap.add_argument('--debug-dir', help='write each match drawn on its sheet here, to look at')
    args = ap.parse_args()
    spec = json.load(open(args.input) if args.input else sys.stdin)

    sheets: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for ref, pdf in spec['sheets'].items():
        img = render(pdf, DPI)
        sheets[ref] = (img, edges(img))

    placed, rooms, weak = [], [], []
    for room in spec['rooms']:
        ref = room['sheet']
        if ref not in sheets:
            weak.append(room['image'])
            continue
        sheet, sheet_e = sheets[ref]
        full = cv2.imread(room['image'], cv2.IMREAD_GRAYSCALE)
        if full is None:
            weak.append(room['image'])
            continue
        # A picture that stacks two sheets (an exterior: Area A above, Area B below) is matched one part at a time:
        # crop [x0, y0, x1, y1] in fractions of the picture. Lines stay in the whole picture's fractions.
        cx0, cy0, cx1, cy1 = room.get('crop', [0, 0, 1, 1])
        fh, fw = full.shape
        tmpl = full[int(cy0 * fh):int(cy1 * fh), int(cx0 * fw):int(cx1 * fw)]
        score, (x, y, w, h) = locate(sheet, sheet_e, tmpl, args.min_px, room.get('scale'))
        rooms.append({'image': os.path.basename(room['image']), 'sheet': ref, 'score': round(score, 3),
                      'box': [x, y, w, h]})
        if score < args.min_score:
            weak.append(os.path.basename(room['image']))
        H, W = sheet.shape
        if args.debug_dir:
            dbg = cv2.cvtColor(sheet, cv2.COLOR_GRAY2BGR)
            cv2.rectangle(dbg, (x, y), (x + w, y + h), (0, 0, 255), 3)
        for wall in room['walls']:
            pts = [[round((x + (px - cx0) / (cx1 - cx0) * w) / W, 5), round((y + (py - cy0) / (cy1 - cy0) * h) / H, 5)]
                   for px, py in wall['line']]
            placed.append({'area_id': wall['area_id'], 'sheet': ref, 'geom': pts, 'score': round(score, 3),
                           'room': os.path.basename(room['image'])})
            if args.debug_dir:
                cv2.polylines(dbg, [np.array([[p[0] * W, p[1] * H] for p in pts], np.int32)], False, (0, 160, 0), 4)
        if args.debug_dir:
            os.makedirs(args.debug_dir, exist_ok=True)
            pad = 120
            crop = dbg[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad]
            cv2.imwrite(os.path.join(args.debug_dir, os.path.splitext(os.path.basename(room['image']))[0] + ' ' + ref + '.png'), crop)

    # A wall in two rooms keeps the line from the better match.
    best: dict[str, dict] = {}
    for p in placed:
        if p['area_id'] not in best or p['score'] > best[p['area_id']]['score']:
            best[p['area_id']] = p
    json.dump({'placed': list(best.values()), 'rooms': rooms, 'weak': weak}, sys.stdout, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
