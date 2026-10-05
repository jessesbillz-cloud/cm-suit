// e2e mock of previews: like the server, a photo or a PDF only (anything else is refused). A photo is a synthetic
// job-site scene drawn as an SVG data URL, varied by the file id so tiles differ; a PDF is the synthetic plan set
// (mock/sheet), so the viewer has real pages to draw. A safety sign-in sheet (kept by the safety mock, not as a file
// row) is a PDF too. Nothing is stored.
import { isPhotoFile } from '../../lib/photos';
import { DataError } from '../errors';
import * as api from './api';
import { isSheet } from './safety';
import { sheetUrl } from './sheet';

function seedOf(id: string): number {
  let n = 7;
  for (let i = 0; i < id.length; i += 1) n = (n * 31 + id.charCodeAt(i)) % 9973;
  return n;
}

/** Sky, sun, a slab with columns and rebar, a tower crane. 4:3, so tiles crop it like a phone photo. */
function sitePhoto(seed: number): string {
  const sky = 196 + (seed % 5) * 7;
  const ground = ['#b8a489', '#a9987e', '#c1af92'][seed % 3] ?? '#b8a489';
  const lift = (seed % 4) * 6;
  const cols = [0, 1, 2, 3, 4, 5].map((i) => 58 + i * 54);
  const columns = cols.map((x) => `<rect x="${String(x)}" y="${String(122 + lift)}" width="14" height="${String(80 - lift)}"/>`).join('');
  const rebar = cols
    .map((x) => [3, 7, 11].map((d) => `<line x1="${String(x + d)}" y1="${String(84 + lift)}" x2="${String(x + d)}" y2="${String(114 + lift)}"/>`).join(''))
    .join('');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${String(sky)},52%,60%)"/>` +
    `<stop offset="1" stop-color="hsl(${String(sky)},45%,88%)"/></linearGradient></defs>` +
    '<rect width="400" height="300" fill="url(#s)"/>' +
    `<circle cx="${String(292 + (seed % 3) * 22)}" cy="56" r="17" fill="#fff8dc" opacity=".85"/>` +
    `<path d="M0 206 L400 190 L400 300 L0 300Z" fill="${ground}"/>` +
    '<path d="M28 202 L372 194 L388 252 L12 264Z" fill="#a3a7ac"/>' +
    `<g fill="#8b9096">${columns}</g>` +
    `<rect x="48" y="${String(114 + lift)}" width="304" height="9" fill="#7d8288"/>` +
    `<g stroke="#9a5a30" stroke-width="2">${rebar}</g>` +
    '<g stroke="#dfa12a" stroke-width="5"><line x1="344" y1="200" x2="344" y2="34"/><line x1="232" y1="38" x2="394" y2="38"/></g>' +
    '<line x1="256" y1="38" x2="256" y2="96" stroke="#3f4349" stroke-width="1.5"/>' +
    '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function isPdf(name: string, mime: string): boolean {
  return mime.toLowerCase() === 'application/pdf' && /\.pdf$/i.test(name);
}

export async function previewUrl(fileId: string): Promise<string> {
  const f = await api.file(fileId);
  if (!f && isSheet(fileId)) return sheetUrl();
  if (!f) throw new DataError('That file no longer exists.', 'P0002', null);
  if (isPhotoFile(f.original_name, f.mime)) return sitePhoto(seedOf(fileId));
  if (isPdf(f.original_name, f.mime)) return sheetUrl();
  throw new DataError('not_image', '42501', null);
}
