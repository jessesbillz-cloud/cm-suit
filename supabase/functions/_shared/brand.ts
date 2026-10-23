// The job's brand for the server-made PDFs (migration 0110): the company the job shows (projects.brand_org_id, else the
// company that runs it), its letterhead (org_letterheads: the name as printed, address, phone, website) and its logo
// (orgs.logo_path in the private org-logos bucket). Read with the server key, and only by functions that already passed
// the record's own gate as the caller (or the receipt-gated request link): the brand is what anyone on the job may read.
// The PDFs draw it through the ONE letterhead (pdf/letterhead.ts).
import { type Db, must, storageError } from './db.ts';
import { sha256HexBytes } from './crypto.ts';
import { HttpError } from './http.ts';
import type { Letterhead } from './pdf/letterhead.ts';

/** The bucket's own limit (0110); a bigger file is not a logo this app stored. */
const LOGO_MAX_BYTES = 1024 * 1024;

export interface JobBrand {
  orgId: string;
  /** The name as printed: the letterhead's, else the company's. */
  name: string;
  /** Address, phone, website: the ones set, in that order. */
  lines: string[];
  logoPath: string | null;
  /** The company has a letterhead with something in it. */
  hasLetterhead: boolean;
}

interface LetterheadRow {
  print_name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
}

/** The brand a job shows, from its rows. Pure: the PDFs' tests use it. */
export function brandOf(org: { id: string; name: string; logo_path: string | null }, row: LetterheadRow | null): JobBrand {
  const lines = [row?.address, row?.phone, row?.website].map((v) => v?.trim() ?? '').filter((v) => v !== '');
  const printName = row?.print_name?.trim() ?? '';
  return {
    orgId: org.id,
    name: printName || org.name,
    lines,
    logoPath: org.logo_path,
    hasLetterhead: printName !== '' || lines.length > 0,
  };
}

export async function jobBrand(service: Db, projectId: string): Promise<JobBrand> {
  const p = must(await service.from('projects').select('org_id, brand_org_id').eq('id', projectId).single(), 'project brand') as
    { org_id: string; brand_org_id: string | null };
  const orgId = p.brand_org_id ?? p.org_id;
  const org = must(await service.from('orgs').select('id, name, logo_path').eq('id', orgId).single(), 'brand company') as
    { id: string; name: string; logo_path: string | null };
  const row = must(
    await service.from('org_letterheads').select('print_name, address, phone, website').eq('org_id', orgId).maybeSingle(),
    'letterhead',
  ) as LetterheadRow | null;
  return brandOf(org, row);
}

/** The brand's logo bytes, or null when it has none. */
export async function brandLogo(service: Db, brand: JobBrand): Promise<Uint8Array | null> {
  if (brand.logoPath === null) return null;
  const { data, error } = await service.storage.from('org-logos').download(brand.logoPath);
  if (error || !data) throw storageError(error ?? { message: 'no data' }, 'company logo');
  if (data.size > LOGO_MAX_BYTES) throw new HttpError(400, 'The company logo is over 1 MB. Upload it again in Settings.');
  return new Uint8Array(await data.arrayBuffer());
}

/** What the IR, the dailies and the map print: only when the brand has a logo or a letterhead, else nothing (the form
 *  as it was). */
export function letterheadOf(brand: JobBrand, logo: Uint8Array | null): Letterhead | null {
  if (logo === null && !brand.hasLetterhead) return null;
  return { name: brand.name, lines: brand.lines, logo };
}

/** The job's letterhead, logo bytes included, or null. */
export async function jobLetterhead(service: Db, projectId: string): Promise<Letterhead | null> {
  const brand = await jobBrand(service, projectId);
  return letterheadOf(brand, await brandLogo(service, brand));
}

/** What a letterhead shows, for a stored PDF's key: a new logo or line makes a new PDF. Null when nothing prints. */
export async function letterheadKey(lh: Letterhead | null): Promise<Record<string, unknown> | null> {
  if (lh === null) return null;
  return { name: lh.name, lines: lh.lines, logo: lh.logo ? await sha256HexBytes(lh.logo) : null };
}
