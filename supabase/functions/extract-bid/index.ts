// Run extractBid on one received bid (SPEC §11.6, §8.7), on demand from the received list ("Read", "Read all").
// Listed in admin_service_key_allowlist.txt: the two draft writes (bid_extractions, bid_extraction_pricing), the
// ai_calls log and the page text (file_pages, files.text_status) have no user insert policy, so they use the service
// client, and only after every check below.
//
// Order: requireUser → load the submission AS THE CALLER (RLS: own, or bids.manage once bids are open) →
// requireCapability('bids.view_ai_findings') (aal2 via role_permissions) → refuse the submitter's own bid → sealed
// check → read the file's page text AS THE CALLER (RLS on files / file_pages); when the worker has not read the
// file yet, read it here (_shared/docText.ts) and store the pages once → run the task → write the draft.
//
// Money never leaves bid_extraction_pricing: dollar figures are stripped from every findings string, and `pricing`
// is in the response only when has_capability('bids.view_pricing') is true. Re-running overwrites a draft or rejected
// extraction; a confirmed one is left alone (409).
import { handle, HttpError, ok, refuse } from '../_shared/http.ts';
import { type Db, must, rpc, serviceClient } from '../_shared/db.ts';
import { requireCapability, requireUser } from '../_shared/auth.ts';
import { parseJson, uuid, z } from '../_shared/validate.ts';
import { audit } from '../_shared/audit.ts';
import { type BidEvidence, type ExtractBidResult, extractBidTask, runTask } from '../_shared/ai.ts';
import { type DocText, docKind, extractDocText, MAX_DOC_BYTES, MAX_PAGES } from '../_shared/docText.ts';

const Body = z.object({ submission_id: uuid }).strict();

/** ~100k tokens of bid text. Bid documents are a few pages; anything bigger is not a single bid. */
const MAX_DOC_CHARS = 400_000;

interface Submission { id: string; org_id: string; project_id: string; package_id: string; member_id: string | null; file_id: string }
interface BidFile { id: string; project_id: string; original_name: string; mime: string; size: number; storage_path: string; upload_complete: boolean; scan_status: string; text_status: string }
interface Page { page_no: number; text: string }
type Findings = ExtractBidResult['findings'];
type Pricing = ExtractBidResult['pricing'];

const hasText = (pages: Page[]) => pages.some((p) => p.text.trim() !== '');

/** Dollar figures in any findings string become "[amount]" (rule 3: money only in pricing tables). */
const MONEY = /(?:\$|USD\s?)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|mm|million|thousand)\b)?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|usd)\b/gi;
const redact = (s: string): string => s.replace(MONEY, '[amount]');
const redactEvidence = (e: BidEvidence | null): BidEvidence | null => (e ? { quote: redact(e.quote), page: e.page } : null);

function cleanFindings(f: Findings): Findings {
  const validDate = f.bid_date !== null && !Number.isNaN(Date.parse(`${f.bid_date}T00:00:00Z`)) &&
    new Date(`${f.bid_date}T00:00:00Z`).toISOString().startsWith(f.bid_date);
  return {
    ...f,
    bidder_name: f.bidder_name === null ? null : redact(f.bidder_name),
    bid_date: validDate ? f.bid_date : null,
    prevailing_wage_evidence: redactEvidence(f.prevailing_wage_evidence),
    scope_summary: f.scope_summary === null ? null : redact(f.scope_summary),
    inclusions: f.inclusions.map(redact),
    exclusions: f.exclusions.map(redact),
    notable_terms: f.notable_terms.map(redact),
    confidence: Math.round(f.confidence * 100) / 100,
  };
}

/** Whitespace/case-insensitive, and undoes the XML escaping the model saw. */
function normalize(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Paths of evidence quotes that don't appear verbatim in the document (the person checking sees these first). */
function unverifiedEvidence(r: ExtractBidResult, docText: string): { findings: string[]; pricing: string[] } {
  const doc = normalize(docText);
  const bad = (e: BidEvidence | null) => e !== null && !doc.includes(normalize(e.quote));
  const p = r.pricing;
  const pricing = [
    ...(bad(p.base_evidence) ? ['pricing.base_evidence'] : []),
    ...(bad(p.pw_adder_evidence) ? ['pricing.pw_adder_evidence'] : []),
    ...p.alternates.flatMap((a, i) => (bad(a.evidence) ? [`pricing.alternates.${i}.evidence`] : [])),
    ...p.unit_prices.flatMap((u, i) => (bad(u.evidence) ? [`pricing.unit_prices.${i}.evidence`] : [])),
    ...p.adds_deducts.flatMap((a, i) => (bad(a.evidence) ? [`pricing.adds_deducts.${i}.evidence`] : [])),
  ];
  const findings = bad(r.findings.prevailing_wage_evidence) ? ['findings.prevailing_wage_evidence'] : [];
  return { findings, pricing };
}

function evidenceText(e: BidEvidence | null): string | null {
  return e ? `"${e.quote}"${e.page ? ` (p. ${e.page})` : ''}` : null;
}

/**
 * Writes the findings draft. Never overwrites a confirmed extraction, including one confirmed while the model ran:
 * the update skips confirmed rows, and an insert that collides means the row appeared meanwhile. Null = confirmed.
 */
async function saveDraft(service: Db, sub: Submission, f: Findings, model: string): Promise<string | null> {
  const row = {
    status: 'draft', bidder_name: f.bidder_name, bid_date: f.bid_date, document_kind: f.document_kind,
    prevailing_wage: f.prevailing_wage, prevailing_wage_evidence: evidenceText(f.prevailing_wage_evidence),
    validity_days: f.validity_days, scope_summary: f.scope_summary, inclusions: f.inclusions, exclusions: f.exclusions,
    notable_terms: f.notable_terms, project_match: f.project_match, confidence: f.confidence, model,
    confirmed_by: null, confirmed_at: null,
  };
  const updated = must(
    await service.from('bid_extractions').update(row).eq('submission_id', sub.id).neq('status', 'confirmed').select('id'),
    'bid_extractions update',
  ) as { id: string }[];
  if (updated.length) return updated[0].id;
  const { data, error } = await service.from('bid_extractions')
    .insert({ ...row, org_id: sub.org_id, project_id: sub.project_id, submission_id: sub.id }).select('id').single();
  if (error?.code === '23505') return null;
  if (error || !data) throw new HttpError(500, `bid_extractions insert: ${error?.message ?? 'no row'}`);
  return (data as { id: string }).id;
}

type ReadPages = { error: null; pages: Page[] } | { error: 'unreadable'; message: string };

/** Marks what the read found so the list shows "Can't read" and "Read all" does not try the file again. */
async function markText(service: Db, fileId: string, status: 'done' | 'none' | 'failed', pageCount: number | null): Promise<void> {
  must(await service.from('files').update({ text_status: status, page_count: pageCount }).eq('id', fileId), 'files text_status update');
}

/**
 * The worker has not read this file (or found nothing): read it here and keep the pages in file_pages so it is done
 * once. Only text sources are tried; Word, Excel and images are marked 'none' (open the file to read it).
 */
async function readPages(service: Db, file: BidFile): Promise<ReadPages> {
  const kind = docKind(file.original_name, file.mime);
  if (kind === null) {
    await markText(service, file.id, 'none', null);
    return { error: 'unreadable', message: 'This kind of file cannot be read here. Open the file to read it.' };
  }
  if (file.size > MAX_DOC_BYTES) {
    await markText(service, file.id, 'failed', null);
    return { error: 'unreadable', message: 'The file is too big to read here. Open the file to read it.' };
  }
  const { data, error } = await service.storage.from('files').download(file.storage_path);
  if (error || !data) throw new HttpError(500, `storage download: ${error?.message ?? 'no data'}`);
  let text: DocText;
  try {
    text = await extractDocText(new Uint8Array(await data.arrayBuffer()), kind);
  } catch (e) {
    console.warn(`extract-bid: could not read file ${file.id}`, e);
    await markText(service, file.id, 'failed', null);
    return { error: 'unreadable', message: 'The file could not be read. Open the file to read it.' };
  }
  if (text.kind === 'too_long') {
    await markText(service, file.id, 'failed', text.pages);
    return { error: 'unreadable', message: `Over ${MAX_PAGES} pages: too long to read here. Open the file to read it.` };
  }
  const pages = text.pages.map((t, i) => ({ page_no: i + 1, text: t }));
  if (!hasText(pages)) {
    // A scan with no text layer: nothing to read without OCR.
    await markText(service, file.id, 'none', pages.length);
    return { error: 'unreadable', message: 'No text in this file (a scan?). Open the file to read it.' };
  }
  const { error: pagesError } = await service.from('file_pages').upsert(
    pages.map((p) => ({ file_id: file.id, project_id: file.project_id, page_no: p.page_no, text: p.text })),
    { onConflict: 'file_id,page_no' },
  );
  if (pagesError) throw new HttpError(500, `file_pages upsert: ${pagesError.message}`);
  await markText(service, file.id, 'done', pages.length);
  return { error: null, pages };
}

Deno.serve(handle(async (req) => {
  const { user, client } = await requireUser(req);
  const body = await parseJson(req, Body, 1024);

  const sub = must(
    await client.from('bid_submissions').select('id, org_id, project_id, package_id, member_id, file_id')
      .eq('id', body.submission_id).maybeSingle(),
    'submission lookup',
  ) as Submission | null;
  if (!sub) throw new HttpError(404, 'Bid not found');
  await requireCapability(client, sub.project_id, 'bids.view_ai_findings');
  // Subs never see AI output about their own submissions (CLAUDE.md rule 12), whatever else they hold.
  const myBidderId = await rpc<string | null>(client, 'my_bidder_member_id', { p_project_id: sub.project_id });
  if (myBidderId !== null && myBidderId === sub.member_id) throw new HttpError(403, 'Not allowed (own bid)');
  if ((await rpc<boolean>(client, 'bids_open', { p_project_id: sub.project_id })) !== true) {
    return refuse(req, 409, 'sealed', 'Bids are sealed until bid time');
  }

  const existing = must(
    await client.from('bid_extractions').select('id, status').eq('submission_id', sub.id).maybeSingle(),
    'extraction lookup',
  ) as { id: string; status: string } | null;
  if (existing?.status === 'confirmed') return refuse(req, 409, 'already_confirmed', 'This extraction is already confirmed');

  const file = must(
    await client.from('files').select('id, project_id, original_name, mime, size, storage_path, upload_complete, scan_status, text_status')
      .eq('id', sub.file_id).maybeSingle(),
    'file lookup',
  ) as BidFile | null;
  if (!file) throw new HttpError(403, 'Not allowed (bid file)');
  if (file.scan_status === 'infected') return refuse(req, 409, 'unreadable', 'This file failed the virus scan');
  if (!file.upload_complete) return refuse(req, 409, 'text_not_ready', 'The upload has not finished. Try again in a minute.');
  let pages = must(
    await client.from('file_pages').select('page_no, text').eq('file_id', sub.file_id).order('page_no'),
    'file_pages lookup',
  ) as Page[];

  // Every check above ran as the caller. From here the service client reads the file, stores its pages, writes the
  // draft and the ai_calls log.
  const service = serviceClient();
  if (!hasText(pages)) {
    const read = await readPages(service, file);
    if (read.error) return refuse(req, 409, read.error, read.message);
    pages = read.pages;
  }
  const docText = pages.map((p) => `--- page ${p.page_no} ---\n${p.text}`).join('\n\n');
  if (docText.length > MAX_DOC_CHARS) return refuse(req, 400, 'document_too_long', 'This file is too long to be a single bid');

  const project = must(
    await client.from('projects').select('id, name, number, address').eq('id', sub.project_id).single(),
    'project lookup',
  ) as { id: string; name: string; number: string | null; address: string | null };
  const pkg = must(
    await client.from('bid_packages').select('code, name').eq('id', sub.package_id).single(),
    'package lookup',
  ) as { code: string; name: string };

  const { output, model } = await runTask(extractBidTask, { documentText: docText, fileId: sub.file_id, project, package: pkg }, {
    service, projectId: sub.project_id, userId: user.id,
  });
  const findings = cleanFindings(output.findings);
  const pricing: Pricing = output.pricing;
  const warnings = unverifiedEvidence(output, docText);

  const extractionId = await saveDraft(service, sub, findings, model);
  if (!extractionId) return refuse(req, 409, 'already_confirmed', 'This extraction was confirmed while it ran');

  const { error: pricingError } = await service.from('bid_extraction_pricing').upsert({
    extraction_id: extractionId,
    project_id: sub.project_id,
    base_amount: pricing.base_amount,
    base_evidence: pricing.base_evidence?.quote ?? null,
    base_page: pricing.base_evidence?.page ?? null,
    alternates: pricing.alternates,
    unit_prices: pricing.unit_prices,
    adds_deducts: pricing.adds_deducts,
    pw_adder_amount: pricing.pw_adder_amount,
  }, { onConflict: 'extraction_id' });
  if (pricingError) throw new HttpError(500, `bid_extraction_pricing upsert: ${pricingError.message}`);

  await audit(service, {
    action: 'bid.extract', actorKind: 'user', actorUserId: user.id, entityType: 'bid_submission', entityId: sub.id,
    projectId: sub.project_id, orgId: sub.org_id, req,
    details: { extraction_id: extractionId, model, unverified_evidence: warnings.findings.length + warnings.pricing.length },
  });

  const canPrice = await rpc<boolean>(client, 'has_capability', { p_project_id: sub.project_id, p_cap: 'bids.view_pricing' });
  return ok(req, {
    extraction_id: extractionId,
    status: 'draft',
    model,
    findings,
    unverified_evidence: canPrice === true ? [...warnings.findings, ...warnings.pricing] : warnings.findings,
    ...(canPrice === true ? { pricing } : {}),
  });
}));
