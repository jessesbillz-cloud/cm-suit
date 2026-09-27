// `deno test supabase/functions/_shared/subsImport_test.ts` — the import's pure part on a synthetic list.
import { cellText, mergeContacts, packageCodes, parseCsv, subsFromTable } from './subsImport.ts';

function eq(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}\n  expected ${e}\n  actual   ${a}`);
}

// A synthetic master list: a title row above the header, one row per company per package, quoted commas and a
// line break inside quotes, a blank row, a row without a company, and an unmapped column.
const CSV = [
  'Sample Master Bid List,,,,,,,,,,,,,,,,,,',
  'Bid Package,Bid Package Name,Company,Contact,Phone (Office),Phone (Mobile),Email,City,ZIP,Other Contacts,Other Phones,Other Emails,Scope Detail (from source),Also Listed Under,CA License #,License Class,DIR #,Certifications,Website',
  '09A,Drywall,Sample Drywall Co,Ann Sample,(760) 555-0100,760-555-0101,ANN@example.test,Sample City,92000,"Bob Sample; Cy Sample","760-555-0102; 760-555-0103","bob@example.test; cy@example.test","Framing, board, tape",09B,100001,C-9,1000000001,SBE,sample.example',
  '09B,Acoustical,sample  drywall co ,Ann Sample,(760) 555-0100,760-555-0101,ann@example.test,,,,,,"Ceilings,',
  'grid and tile",,,C-2,,DVBE,',
  ',,,,,,,,,,,,,,,,,,',
  '03A,Concrete,Sample Concrete Inc,,(760) 555-0200,,,Sample Town,,,,,,,200002,A,,,',
  '05A,Steel,,Nobody,,,,,,,,,,,,,,,',
].join('\r\n');

Deno.test('parseCsv: quotes, commas and line breaks inside quotes, CRLF, BOM', () => {
  eq(parseCsv('﻿a,"b,c","d ""q"""\r\n"x\ny",,z\n'), [['a', 'b,c', 'd "q"'], ['x\ny', '', 'z']], 'rows');
  eq(parseCsv('a,b'), [['a', 'b']], 'no trailing newline');
  let threw = false;
  try {
    parseCsv('a,"b');
  } catch {
    threw = true;
  }
  eq(threw, true, 'an unclosed quote is refused');
});

Deno.test('subsFromTable: groups rows by company and merges trades, contacts and fields', () => {
  const plan = subsFromTable(parseCsv(CSV));
  eq(plan.headerFound, true, 'header found below the title row');
  eq(plan.rows, 4, 'data rows with content');
  eq(plan.skipped, 1, 'the row without a company');
  eq(plan.subs.map((s) => s.company), ['Sample Drywall Co', 'Sample Concrete Inc'], 'one sub per company, first spelling');

  const dry = plan.subs[0];
  eq(dry.trades, ['09A', '09B'], 'trades from both rows and Also Listed Under');
  eq(dry.contacts, [
    { name: 'Ann Sample', email: 'ann@example.test', phone: '760-555-0101', title: '' },
    { name: '', email: '', phone: '(760) 555-0100', title: 'Office' },
    { name: 'Bob Sample', email: 'bob@example.test', phone: '760-555-0102', title: '' },
    { name: 'Cy Sample', email: 'cy@example.test', phone: '760-555-0103', title: '' },
  ], 'contacts: main (mobile first), office line, others by position, the second row deduped');
  eq([dry.city, dry.zip, dry.cslb_number, dry.dir_number], ['Sample City', '92000', '100001', '1000000001'], 'first values kept');
  eq([dry.license_classes, dry.certifications], ['C-9, C-2', 'SBE, DVBE'], 'classes and certifications joined');
  eq(dry.extra, {
    Website: 'sample.example',
    'Scope Detail (from source)': { '09A': 'Framing, board, tape', '09B': 'Ceilings, grid and tile' },
  }, 'unmapped columns and scope per package kept in extra');

  const concrete = plan.subs[1];
  eq(concrete.contacts, [{ name: '', email: '', phone: '(760) 555-0200', title: '' }], 'office phone only');
  eq(concrete.extra, {}, 'nothing extra');
});

Deno.test('subsFromTable: no Company column means no header', () => {
  eq(subsFromTable([['Name', 'Phone'], ['Sample', '1']]).headerFound, false, 'headerFound');
});

Deno.test('mergeContacts: same email, or same phone / name without a conflict; fills only empty fields', () => {
  const existing = [{ name: 'Ann Sample', email: 'ann@example.test', phone: '', title: '' }];
  eq(mergeContacts(existing, [{ name: '', email: 'ANN@example.test', phone: '1 (760) 555-0101', title: 'PM' }]),
    [{ name: 'Ann Sample', email: 'ann@example.test', phone: '1 (760) 555-0101', title: 'PM' }], 'matched by email');
  eq(mergeContacts(existing, [{ name: 'Ann Sample', email: 'other@example.test', phone: '', title: '' }]).length, 2,
    'same name with a different email is another contact');
  const once = mergeContacts([], [{ name: 'Bob', email: '', phone: '760-555-0102', title: '' }]);
  eq(mergeContacts(once, [{ name: 'Bob', email: '', phone: '760-555-0102', title: '' }]), once, 'repeat changes nothing');
});

Deno.test('packageCodes and cellText', () => {
  eq(packageCodes('09a Drywall; 09B, 123, 1A'), ['09A', '09B'], 'two digits and a letter only');
  eq(cellText({ richText: [{ text: 'Sample ' }, { text: 'Co' }] }), 'Sample Co', 'rich text');
  eq(cellText({ text: 'ann@example.test', hyperlink: 'mailto:ann@example.test' }), 'ann@example.test', 'hyperlink');
  eq(cellText({ formula: 'A1', result: 92000 }), '92000', 'formula result');
  eq(cellText(new Date(Date.UTC(2026, 8, 27))), '2026-09-27', 'date');
  eq(cellText({ error: '#N/A' }), '', 'error');
});
