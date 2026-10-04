// `deno test supabase/functions/_shared/schedule/mspdi_test.ts` — the MS Project XML reader on a small synthetic file.
import { looksLikeMspdi, mspdiSchedule, readXml } from './mspdi.ts';

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(`failed: ${what}`);
}

function same(a: unknown, b: unknown, what: string): void {
  check(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

function throws(fn: () => unknown): boolean {
  try {
    fn();
  } catch (e) {
    return e instanceof Error;
  }
  return false;
}

const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>Sample Clinic.xml</Name>
  <Title>Sample Clinic Schedule</Title>
  <StatusDate>2026-09-30T17:00:00</StatusDate>
  <CurrentDate>2026-10-02T08:00:00</CurrentDate>
  <!-- a comment <Task> that is not a task -->
  <Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar></Calendar></Calendars>
  <Tasks>
    <Task><UID>0</UID><ID>0</ID><Name>Sample Clinic</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
    <Task><UID>1</UID><ID>1</ID><Name>Sitework</Name><WBS>1</WBS><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>
    <Task><UID>2</UID><ID>2</ID><Name>Underground &amp; utilities</Name><WBS>1.1</WBS><OutlineLevel>2</OutlineLevel>
      <Summary>0</Summary><Start>2026-09-28T08:00:00</Start><Finish>2026-10-09T17:00:00</Finish>
      <Duration>PT80H0M0S</Duration><ActualStart>2026-09-28T08:00:00</ActualStart><PercentComplete>40</PercentComplete>
      <Milestone>0</Milestone></Task>
    <Task><UID>7</UID><ID>3</ID><Name>Building</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>
    <Task><UID>8</UID><ID>4</ID><Name>Level 1</Name><OutlineLevel>2</OutlineLevel><Summary>1</Summary></Task>
    <Task><UID>9</UID><ID>5</ID><Name><![CDATA[Frame walls <L1>]]></Name><OutlineLevel>3</OutlineLevel>
      <Start>2026-10-12T08:00:00</Start><Finish>2026-10-23T17:00:00</Finish><PercentComplete>0</PercentComplete></Task>
    <Task><UID>10</UID><ID>6</ID><Name>Dry-in</Name><OutlineLevel>2</OutlineLevel><Start>2026-11-06T17:00:00</Start>
      <Finish>2026-11-06T17:00:00</Finish><Milestone>1</Milestone></Task>
    <Task><UID>11</UID><ID>7</ID><IsNull>1</IsNull><OutlineLevel>1</OutlineLevel></Task>
    <Task><UID>12</UID><ID>8</ID><Name>Old option</Name><OutlineLevel>1</OutlineLevel><Active>0</Active>
      <Start>2026-12-01T08:00:00</Start><Finish>2026-12-02T17:00:00</Finish></Task>
    <Task><UID>13</UID><ID>9</ID><Name>Punch &#x26; &#38; closeout</Name><OutlineLevel>1</OutlineLevel>
      <Start>2027-01-04T08:00:00</Start><Finish>2027-01-15T17:00:00</Finish><ExtendedAttribute><FieldID>1</FieldID></ExtendedAttribute></Task>
  </Tasks>
  <Resources>
    <Resource><UID>1</UID><Name>Sample Framing Co</Name></Resource>
    <Resource><UID>2</UID><Name>Sample Carpentry</Name></Resource>
  </Resources>
  <Assignments>
    <Assignment><UID>1</UID><TaskUID>9</TaskUID><ResourceUID>1</ResourceUID></Assignment>
    <Assignment><UID>2</UID><TaskUID>9</TaskUID><ResourceUID>2</ResourceUID></Assignment>
    <Assignment><UID>3</UID><TaskUID>2</TaskUID><ResourceUID>-65535</ResourceUID></Assignment>
  </Assignments>
</Project>`;

Deno.test('readXml: elements and text, entities and CDATA, comments skipped, namespaces dropped', () => {
  const doc = readXml('<?xml version="1.0"?><!DOCTYPE x><a:Root xmlns:a="u"><b>1 &lt; 2</b><c/><d attr="x > y">t</d></a:Root>');
  const root = doc.children[0];
  same(root?.name, 'Root', 'prefix dropped');
  same(root?.children.map((c) => [c.name, c.text]), [['b', '1 < 2'], ['c', ''], ['d', 't']], 'children');
  check(throws(() => readXml('<a><b></a>')), 'a mismatched end tag throws');
  check(throws(() => readXml('<a>')), 'an unclosed element throws');
  check(throws(() => readXml('<a><!-- never closes')), 'an unclosed comment throws');
});

Deno.test('mspdiSchedule: the title and the status date (never the current date)', () => {
  const s = mspdiSchedule(XML);
  same([s.title, s.dataDate], ['Sample Clinic Schedule', '2026-09-30'], 'title and data date');
  const noStatus = mspdiSchedule(XML.replace(/<StatusDate>.*<\/StatusDate>/, ''));
  same(noStatus.dataDate, null, 'no status date: none (CurrentDate is only the day it was saved)');
  check(looksLikeMspdi(XML) && !looksLikeMspdi('<Project><Name>x</Name></Project>'), 'detected by its namespace');
});

Deno.test('mspdiSchedule: tasks, summaries as the WBS path, milestones, resources as the trade', () => {
  const s = mspdiSchedule(XML);
  same(s.rows.map((r) => r.code), ['2', '9', '10', '13'], 'UIDs; the project summary, summaries, a blank row and the inactive task left out');
  const [ug, frame, dry, punch] = s.rows;
  same([ug?.name, ug?.wbs, ug?.start, ug?.finish, ug?.actual_start, ug?.percent, ug?.trade],
    ['Underground & utilities', 'Sitework', '2026-09-28', '2026-10-09', '2026-09-28', 40, null], 'a task under Sitework');
  same([frame?.name, frame?.wbs, frame?.trade], ['Frame walls <L1>', 'Building / Level 1', 'Sample Framing Co, Sample Carpentry'], 'nested');
  same([dry?.wbs, dry?.is_milestone, dry?.start, dry?.finish], ['Building', true, '2026-11-06', '2026-11-06'], 'a milestone one level up');
  same([punch?.name, punch?.wbs], ['Punch & & closeout', null], 'character references; top level has no path');
  same(frame?.source_ref, 'ID 5', 'the row number people see');
  same(s.warnings, ['1 inactive task left out.'], 'told');
});

Deno.test('mspdiSchedule: not a project', () => {
  same(mspdiSchedule('<Other/>').warnings, ['No project in this XML.'], 'says so');
});
