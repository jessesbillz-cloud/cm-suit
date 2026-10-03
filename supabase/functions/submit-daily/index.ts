// Submit a daily report: a signed legal record (SPEC §13.1, §6.9). "Update & resubmit" is the same call on a submitted
// report: same number, same filename, a new signature, and the PDF stored as the next version of the same file.
//
// Order: requireUser → load the report AS THE CALLER (RLS; unseen = 404) → author check + requireCapability
// ('dailies.write') → the version the person saw → signing re-confirmation (signedInRecently, else 403
// reauth_required) → content hash → begin_daily_submit AS THE CALLER (numbers the report on its first signing, records
// the hash; refuses if the content or photos moved) → the PDF from the saved content (the work log's
// pdf/dailyReport.ts, the superintendent's or foreman's daily pdf/gcDaily.ts, or a company form, e.g. pdf/vis.ts,
// SPEC §8.3; then the ONE stamp) → storeGeneratedPdf
// into Reports/<author> → finish_daily_submit (service role) marks it submitted. Nothing before the finish marks the
// report submitted; if storing or finishing fails, the new file is taken back out and the call fails loudly.
//
// A company form's report prints the setup's job values and the company's logo (orgs.logo_path of the job's company);
// the job values are part of the signed hash, and so are photo descriptions.
//
// Service client (listed in admin_service_key_allowlist.txt): reading photo and logo bytes from private storage,
// storing the PDF (users cannot write storage objects for files they didn't upload) and finish_daily_submit (not
// user-callable).
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient, storageError } from '../_shared/db.ts';
import { requireCapability, requireUser, signingConfirmed } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { contentHash } from '../_shared/crypto.ts';
import { storeGeneratedPdf } from '../_shared/generatedPdf.ts';
import { buildFilename } from '../_shared/buildFilename.ts';
import {
  asPdfName,
  DAILY_REPORT_TYPE,
  type DailyContent,
  dailyContentSchema,
  dailyFilenameFields,
  type DailyHeader,
  dailyHeaderSchema,
  type DailySettings,
  parseDailySettings,
} from '../_shared/dailies.ts';
import { dailyValues, formIdOf, formOf, lockedValues, REPORT_FORMS, type ReportFormId } from '../_shared/reportForms.ts';
import { buildDailyReportPdf, type DailyPdfPhoto, dayLabel, instantLabel, PhotoReadError } from '../_shared/pdf/dailyReport.ts';
import { buildFormDailyPdf } from '../_shared/pdf/gcDaily.ts';
import { buildVisPdf, FormFitError, VIS_SIGNATURE_AT, visDate, visPhotoTime } from '../_shared/pdf/vis.ts';
import { stampSignature, type StampSpot } from '../_shared/pdf/stamp.ts';

const Body = z.object({ report_id: uuid, version: z.number().int().min(1) }).strict();

/** Type aliases (not interfaces) so rows are assignable to http.ts Json. */
type Report = {
  id: string;
  org_id: string;
  project_id: string;
  author_id: string;
  report_type: string;
  report_date: string;
  status: string;
  number: number | null;
  header: unknown;
  content: unknown;
  version: number;
  filename: string | null;
  pdf_file_id: string | null;
  sign_pending_at: string | null;
  signed_at: string | null;
  signed_version: number | null;
  submitted_at: string | null;
};

const REPORT_COLS = 'id, org_id, project_id, author_id, report_type, report_date, status, number, header, content, version, ' +
  'filename, pdf_file_id, sign_pending_at, signed_at, signed_version, submitted_at';

type Photo = {
  id: string;
  file_id: string;
  row_key: string | null;
  caption: string;
  description: string;
  taken_at: string | null;
  version: number;
};

type PhotoFile = { id: string; storage_path: string; mime: string; upload_complete: boolean };

/** A photo's bytes with its row, oldest first (the order both PDFs print). */
type PhotoBytes = { photo: Photo; bytes: Uint8Array; mime: string };

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The photo list begin_daily_submit checks: id:version, by id (the same order as SQL `order by id`). */
function photosStamp(photos: readonly Photo[]): string {
  return [...photos].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((p) => `${p.id}:${p.version}`).join(',');
}

/** The content hash (SPEC §6.9): the saved record exactly as stored, its photos, and a company form's job values. */
function hashOf(r: Report, photos: readonly Photo[], jobValues: Record<string, string> | null): Promise<string> {
  return contentHash({
    report_type: r.report_type,
    report_date: r.report_date,
    author_id: r.author_id,
    header: r.header,
    content: r.content,
    photos: photos.map((p) => ({ file_id: p.file_id, caption: p.caption, description: p.description, taken_at: p.taken_at, row_key: p.row_key }))
      .sort((a, b) => (a.file_id < b.file_id ? -1 : 1)),
    ...(jobValues === null ? {} : { job: jobValues }),
  });
}

function filenameFor(pattern: string, number: number, r: Report, header: DailyHeader): string {
  try {
    return asPdfName(buildFilename(pattern, { number, date: r.report_date, fields: dailyFilenameFields(header) }));
  } catch (e) {
    throw new HttpError(400, `Filename pattern: ${e instanceof Error ? e.message : String(e)}. Fix it in Setup.`);
  }
}

async function readPhotos(client: Db, service: Db, photos: readonly Photo[]): Promise<PhotoBytes[]> {
  if (photos.length === 0) return [];
  // The author reads their own photo files through RLS; only the bytes need the service client.
  const files = must(
    await client.from('files').select('id, storage_path, mime, upload_complete').in('id', photos.map((p) => p.file_id)).is('deleted_at', null),
    'photo files',
  ) as PhotoFile[];
  const byId = new Map(files.map((f) => [f.id, f]));
  const sorted = [...photos].sort((a, b) => (a.taken_at ?? '').localeCompare(b.taken_at ?? '') || a.id.localeCompare(b.id));
  return await Promise.all(sorted.map(async (p, i): Promise<PhotoBytes> => {
    const f = byId.get(p.file_id);
    if (!f) throw new HttpError(400, `Photo ${i + 1} is gone. Remove it from the report.`);
    if (!f.upload_complete) throw new HttpError(409, 'A photo is still uploading. Submit when it finishes.');
    const { data, error } = await service.storage.from('files').download(f.storage_path);
    if (error || !data) throw storageError(error ?? { message: 'no data' }, `photo ${p.file_id}`);
    return { photo: p, bytes: new Uint8Array(await data.arrayBuffer()), mime: f.mime };
  }));
}

/** The signer's saved signature (PNG), read as the caller (own folder in the private signatures bucket), or null. */
async function signatureImage(client: Db, path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await client.storage.from('signatures').download(path);
  if (error || !data) throw storageError(error ?? { message: 'no data' }, 'signature image');
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) throw new HttpError(400, 'Your signature image must be a PNG. Add it again in Settings.');
  return bytes;
}

/** The job's company logo (orgs.logo_path, read as the caller; bytes from the private org-logos bucket), or null. */
async function companyLogo(client: Db, service: Db, orgId: string): Promise<Uint8Array | null> {
  const org = must(await client.from('orgs').select('logo_path').eq('id', orgId).maybeSingle(), 'company lookup') as
    { logo_path: string | null } | null;
  if (!org?.logo_path) return null;
  const { data, error } = await service.storage.from('org-logos').download(org.logo_path);
  if (error || !data) throw storageError(error ?? { message: 'no data' }, 'company logo');
  return new Uint8Array(await data.arrayBuffer());
}

interface RenderInput {
  client: Db;
  service: Db;
  report: Report;
  number: number;
  header: DailyHeader;
  content: DailyContent;
  settings: DailySettings;
  photos: PhotoBytes[];
  inspector: string;
}

/** The photos as the work log and the built-in forms print them: caption, the job and the time taken, the row. */
function stampedPhotos(i: RenderInput, rowLabel: (key: string) => string | null): DailyPdfPhoto[] {
  const { header } = i;
  return i.photos.map(({ photo: p, bytes, mime }) => ({
    bytes, mime, caption: p.caption,
    stamp: `${header.project_name} · ${instantLabel(p.taken_at ?? new Date().toISOString(), header.timezone)}`,
    rowLabel: p.row_key ? rowLabel(p.row_key) : null,
  }));
}

/** The PDF (before the signature) and where its signature goes: the last page's corner, or a company form's line. */
async function render(form: ReportFormId | null, i: RenderInput): Promise<{ bytes: Uint8Array; at: StampSpot | undefined }> {
  const { header, content, settings } = i;
  if (form === null) {
    const rows = new Map(content.work.map((w) => [w.key, w.company.trim()]));
    const bytes = await buildDailyReportPdf({
      header, number: i.number, dateLabel: dayLabel(i.report.report_date), content, photosPerPage: settings.photos_per_page,
      photos: stampedPhotos(i, (key) => rows.get(key) || null),
    });
    return { bytes, at: undefined };
  }
  switch (form) {
    // The forms made of fields and tables (the superintendent's and the foreman's daily): the corner, like the work log.
    case 'gc_daily':
    case 'foreman_daily': {
      const f = REPORT_FORMS[form];
      const bytes = await buildFormDailyPdf({
        form: f, header, number: i.number, dateLabel: dayLabel(i.report.report_date),
        day: dailyValues(f, content.fields, content.standing_note), tables: content.tables,
        inspections: content.inspections.map((e) => e.text), photosPerPage: settings.photos_per_page,
        photos: stampedPhotos(i, () => null),
      });
      return { bytes, at: undefined };
    }
    case 'vis_daily': {
      const f = REPORT_FORMS[form];
      const bytes = await buildVisPdf({
        ...visDate(i.report.report_date),
        job: lockedValues(f, settings.locked),
        day: dailyValues(f, content.fields, content.standing_note),
        inspections: content.inspections.map((e) => e.text),
        inspector: i.inspector,
        logo: await companyLogo(i.client, i.service, i.report.org_id),
        photosPerPage: settings.photos_per_page,
        photos: i.photos.map(({ photo: p, bytes }) => ({
          bytes,
          caption: [p.caption.trim(), p.taken_at ? visPhotoTime(p.taken_at, header.timezone) : ''].filter((s) => s !== '').join(' · '),
          description: p.description,
        })),
      });
      return { bytes, at: VIS_SIGNATURE_AT };
    }
  }
}

/** render(), with a photo that can't be read or a value too long for the form refused by name. */
async function renderOr400(form: ReportFormId | null, i: RenderInput): Promise<{ bytes: Uint8Array; at: StampSpot | undefined }> {
  try {
    return await render(form, i);
  } catch (e) {
    if (e instanceof PhotoReadError || e instanceof FormFitError) throw new HttpError(400, e.message);
    throw e;
  }
}

/** Takes a stored PDF back out when the submit could not finish (and un-supersedes the one it replaced). */
async function takeBack(service: Db, fileId: string, replaced: string | null): Promise<void> {
  const { error } = await service.from('files').update({ deleted_at: new Date().toISOString() }).eq('id', fileId);
  if (error) throw new HttpError(500, `submit-daily cleanup: could not remove ${fileId}: ${error.message}`);
  if (replaced) {
    const { error: e2 } = await service.from('files').update({ superseded_by: null }).eq('id', replaced);
    if (e2) throw new HttpError(500, `submit-daily cleanup: could not restore ${replaced}: ${e2.message}`);
  }
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 4096);

  const report = must(
    await client.from('daily_reports').select(REPORT_COLS).eq('id', body.report_id).is('deleted_at', null).maybeSingle(),
    'report lookup',
  ) as Report | null;
  if (!report) throw new HttpError(404, 'Report not found');
  if (report.author_id !== user.id) throw new HttpError(403, 'Only its author signs a report');
  await requireCapability(client, report.project_id, 'dailies.write');
  if (report.version !== body.version) throw new HttpError(409, 'The report changed. Reload and try again.');
  const form = formIdOf(report.report_type);
  if (form === null && report.report_type !== DAILY_REPORT_TYPE) throw new HttpError(400, 'This report\'s form is not available.');

  if (!(await signingConfirmed(client, user, req))) {
    return refuse(req, 403, 'reauth_required', 'Sign in again to sign this report');
  }

  const header = dailyHeaderSchema.parse(report.header);
  const parsed = dailyContentSchema.safeParse(report.content);
  if (!parsed.success) throw new HttpError(400, `The report can't be read: ${parsed.error.issues[0]?.message ?? 'bad content'}`);
  const content = parsed.data;

  const setup = must(
    await client.from('daily_setups').select('settings').eq('project_id', report.project_id).eq('author_id', user.id)
      .eq('report_type', report.report_type).maybeSingle(),
    'setup lookup',
  ) as { settings: unknown } | null;
  const settings = parseDailySettings(setup?.settings);
  const jobValues = form === null ? null : lockedValues(REPORT_FORMS[form], settings.locked);
  // A broken filename pattern is refused before a number is used.
  filenameFor(settings.filename_pattern, report.number ?? 1, report, header);

  const photos = must(
    await client.from('daily_report_photos').select('id, file_id, row_key, caption, description, taken_at, version')
      .eq('report_id', report.id).is('deleted_at', null),
    'photo lookup',
  ) as Photo[];
  const profile = must(
    await client.from('profiles').select('full_name, signature_path').eq('user_id', user.id).single(),
    'profile lookup',
  ) as { full_name: string; signature_path: string | null };

  const service = serviceClient();
  const photoBytes = await readPhotos(client, service, photos);
  const signature = settings.signature ? await signatureImage(client, profile.signature_path) : null;

  const signer = profile.full_name.trim() || header.author_name;
  const renderInput = { client, service, report, header, content, settings, photos: photoBytes, inspector: signer };
  // A form that doesn't print the number (VIS) is rendered, and any problem refused, before a number is used.
  const early = form === null || formOf(report.report_type)?.numbered
    ? null
    : await renderOr400(form, { ...renderInput, number: report.number ?? 0 });

  const hash = await hashOf(report, photos, jobValues);
  const begun = await rpc<Report>(client, 'begin_daily_submit', {
    p_report_id: report.id,
    p_version: report.version,
    p_content_hash: hash,
    p_photos_stamp: photosStamp(photos),
  });
  if (begun.number === null || begun.sign_pending_at === null) throw new HttpError(500, `report ${report.id}: begin returned no number`);
  const folderId = await rpc<string>(client, 'daily_reports_folder', { p_project_id: report.project_id });
  const filename = begun.filename ?? filenameFor(settings.filename_pattern, begun.number, begun, header);

  const pdf = early ?? await renderOr400(form, { ...renderInput, number: begun.number });
  let bytes = pdf.bytes;
  if (settings.signature) {
    bytes = await stampSignature(bytes, {
      signaturePng: signature,
      name: signer,
      signedAtLabel: instantLabel(begun.sign_pending_at, header.timezone),
      ...(pdf.at ? { at: pdf.at } : {}),
    });
  }

  const stored = await storeGeneratedPdf(service, {
    projectId: report.project_id, folderId, name: filename, bytes, createdBy: user.id, replaces: report.pdf_file_id,
  });
  let finished: Report;
  try {
    finished = await rpc<Report>(service, 'finish_daily_submit', {
      p_report_id: report.id,
      p_version: begun.version,
      p_content_hash: hash,
      p_file_id: stored.id,
      p_filename: filename,
    });
  } catch (e) {
    await takeBack(service, stored.id, report.pdf_file_id);
    throw e;
  }

  return ok(req, {
    id: finished.id,
    status: finished.status,
    number: finished.number,
    filename: finished.filename,
    pdf_file_id: finished.pdf_file_id,
    version: finished.version,
    signed_at: finished.signed_at,
  });
}));
