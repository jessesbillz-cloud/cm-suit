// `deno test supabase/functions/_shared/requirements_test.ts` — the extractRequirements output check (zod) and the
// candidates made into drafts: quotes checked against the text, the page from the text's own lines, money left out, the
// section spaced, repeats dropped; the request body and the page range.
import { ExtractRequirementsOutput, type ExtractRequirementsResult } from './ai.ts';
import { cleanSection, ExtractBody, pageOf, pageRangeProblem, pagesText, prepareDrafts, redactMoney } from './requirements.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

const DOC = pagesText([
  { page_no: 12, text: 'SECTION 10 28 00 - TOILET ACCESSORIES\n1.3 COORDINATION\nA. Notify the Owner in writing 60 days\nbefore restroom finishes start.' },
  { page_no: 13, text: '1.5 WARRANTY\nA. Special Warranty: Manufacturer agrees to repair mirrors within 10 years. Liquidated damages are $500 per day.' },
]);

function candidate(over: Record<string, unknown> = {}) {
  return {
    kind: 'ofci', title: 'Toilet accessories (owner furnished)', details: '', spec_section: '102800', spec_title: 'Toilet Accessories',
    spec_ref: '1.3.A', responsible: 'Contractor', required: 'yes', notice_days: 60, lead_days: null, trigger: 'Restroom finishes start',
    evidence: { quote: 'Notify the Owner in writing 60 days before restroom finishes start.', page: 99 },
    ...over,
  };
}

function parse(list: unknown[]): ExtractRequirementsResult {
  const r = ExtractRequirementsOutput.safeParse({ requirements: list });
  if (!r.success) throw new Error(JSON.stringify(r.error.flatten()));
  return r.data;
}

Deno.test('output check: the shape the prompt asks for passes; a wrong kind, required, days or a missing quote fails', () => {
  check(ExtractRequirementsOutput.safeParse({ requirements: [candidate()] }).success, 'a good candidate');
  check(ExtractRequirementsOutput.safeParse({ requirements: [] }).success, 'nothing found is fine');
  check(!ExtractRequirementsOutput.safeParse({ requirements: [candidate({ kind: 'lunch' })] }).success, 'kind from the list');
  check(!ExtractRequirementsOutput.safeParse({ requirements: [candidate({ required: 'maybe' })] }).success, 'required from the list');
  check(!ExtractRequirementsOutput.safeParse({ requirements: [candidate({ notice_days: 800 })] }).success, 'days up to 730');
  check(!ExtractRequirementsOutput.safeParse({ requirements: [candidate({ notice_days: 1.5 })] }).success, 'whole days');
  check(!ExtractRequirementsOutput.safeParse({ requirements: [candidate({ evidence: { quote: ' ', page: 1 } })] }).success, 'a quote');
  check(!ExtractRequirementsOutput.safeParse({ requirements: [candidate({ title: '' })] }).success, 'a title');
  check(!ExtractRequirementsOutput.safeParse({ items: [] }).success, 'the list is called requirements');
  check(!ExtractRequirementsOutput.safeParse({ requirements: Array.from({ length: 61 }, () => candidate()) }).success, 'at most 60');
});

Deno.test('drafts: a quote that is in the text (across a line break) keeps its candidate, with the page from the text', () => {
  const out = prepareDrafts(parse([candidate()]), DOC);
  check(out.drafts.length === 1 && out.unquoted === 0, 'kept');
  const d = out.drafts[0];
  check(d.page === 12, `page from the page lines, not the model's 99: ${String(d.page)}`);
  check(d.spec_section === '10 28 00', 'section spaced');
  check(d.activity_name === 'Restroom finishes start' && d.notice_days === 60 && d.lead_days === null, 'trigger and days');
});

Deno.test('drafts: a quote that is not in the text is left out', () => {
  const out = prepareDrafts(parse([candidate({ evidence: { quote: 'Notify the Owner 90 days before anything.', page: 12 } })]), DOC);
  check(out.drafts.length === 0 && out.unquoted === 1, 'left out');
});

Deno.test('drafts: the same item twice (title or quote) is one draft', () => {
  const out = prepareDrafts(parse([candidate(), candidate({ title: 'TOILET ACCESSORIES (OWNER FURNISHED)' }),
    candidate({ title: 'Other words', spec_ref: '1.3' })]), DOC);
  check(out.drafts.length === 1 && out.repeated === 2, `one draft: ${out.drafts.length} ${out.repeated}`);
});

Deno.test('drafts: no dollar figures, even when the quote has one', () => {
  const quote = 'Liquidated damages are $500 per day.';
  const out = prepareDrafts(parse([candidate({ kind: 'other', title: 'Damages of $500 per day', details: 'USD 500 a day', evidence: { quote, page: 13 } })]), DOC);
  const d = out.drafts[0];
  check(d !== undefined && !/\$|500/.test(`${d.title} ${d.details} ${d.quote}`), 'redacted');
  check(d.quote === 'Liquidated damages are [amount] per day.' && d.page === 13, 'quote kept but for the amount');
  check(redactMoney('$1,250.00 and 3 dollars') === '[amount] and [amount]', 'redactMoney');
});

Deno.test('drafts: the XML escaping the model saw and typographic marks still match', () => {
  const doc = pagesText([{ page_no: 1, text: 'Notify the Owner’s representative <in writing> – before work.' }]);
  const out = prepareDrafts(parse([candidate({ evidence: { quote: "Notify the Owner's representative &lt;in writing&gt; - before work.", page: null } })]), doc);
  check(out.drafts.length === 1 && out.drafts[0].page === 1, 'matched');
});

Deno.test('drafts: pasted text has no page lines, so no page', () => {
  const text = 'A. Notify the Owner in writing 60 days before restroom finishes start.';
  check(pageOf('Notify the Owner in writing 60 days', text) === null, 'no page');
  const out = prepareDrafts(parse([candidate()]), text);
  check(out.drafts.length === 1 && out.drafts[0].page === null, 'kept, no page');
});

Deno.test('drafts: long text is cut to the columns', () => {
  const out = prepareDrafts(parse([candidate({ title: 'T'.repeat(300), details: 'D'.repeat(2000), responsible: 'R'.repeat(200) })]), DOC);
  const d = out.drafts[0];
  check(d.title.length === 200 && d.details.length === 2000 && d.responsible.length === 120, 'cut');
});

Deno.test('section: spaced, or empty when the database would refuse it', () => {
  check(cleanSection('102800') === '10 28 00', 'six digits');
  check(cleanSection(' 28 46 21.11 ') === '28 46 21.11', 'kept');
  check(cleanSection('284621.11') === '28 46 21.11', 'with a suffix');
  check(cleanSection('10 28 00 <script>') === '', 'refused');
});

Deno.test('request: a page range of one section, or pasted text; nothing else', () => {
  const pid = '00000000-0000-4000-8000-000000000001';
  check(ExtractBody.safeParse({ source: 'file', project_id: pid, file_id: pid, first_page: 3, last_page: 9 }).success, 'file');
  check(ExtractBody.safeParse({ source: 'text', project_id: pid, text: 'A. Notify the Owner 60 days before restroom finishes start.' }).success, 'text');
  check(!ExtractBody.safeParse({ source: 'text', project_id: pid, text: 'too short' }).success, 'text at least 40 characters');
  check(!ExtractBody.safeParse({ source: 'url', project_id: pid }).success, 'no other source');
  check(!ExtractBody.safeParse({ source: 'file', project_id: pid, file_id: pid, first_page: 1, last_page: 2, extra: 1 }).success, 'strict');
  check(pageRangeProblem(3, 9) === null, 'a section');
  check(pageRangeProblem(9, 3) !== null, 'backwards');
  check(pageRangeProblem(1, 41) !== null, 'too many pages');
});
