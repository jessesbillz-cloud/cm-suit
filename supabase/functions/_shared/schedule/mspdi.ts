// Microsoft Project XML (MSPDI, File > Save As > XML; research §2), read with a small tag reader: no DOM and no npm
// dependency. Read: the project's Title (or Name) and StatusDate (the data date; CurrentDate is only the day it was saved,
// so it is never used), Tasks (UID = the stable Activity ID, Name, Start, Finish, ActualStart, ActualFinish, Milestone,
// PercentComplete, OutlineLevel, WBS, Summary, IsNull, Active) and the resource names assigned to each task (the trade).
// Summary tasks are not activities: their names make the WBS path of the tasks under them. Pure: no I/O.
import { emptyRow, looseDay, percentOf, type ParsedSchedule, type ScheduleRow } from './rows.ts';

export interface XmlNode {
  name: string;
  children: XmlNode[];
  text: string;
}

const MAX_DEPTH = 64;

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** The end of a start tag (its ">"), skipping quoted attribute values. -1 when the tag never closes. */
function tagEnd(text: string, from: number): number {
  let quote = '';
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

/** A tag's local name: "msp:Task" and "Task" are both "Task". */
function localName(tag: string): string {
  const name = /^[^\s/>]+/.exec(tag)?.[0] ?? '';
  const colon = name.indexOf(':');
  return colon >= 0 ? name.slice(colon + 1) : name;
}

/** Reads an XML document into elements with their text (attributes are not kept: MSPDI uses elements). */
export function readXml(text: string): XmlNode {
  const root: XmlNode = { name: '#document', children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    const top = stack[stack.length - 1] ?? root;
    if (lt < 0) {
      top.text += decodeEntities(text.slice(i));
      break;
    }
    if (lt > i) top.text += decodeEntities(text.slice(i, lt));
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end < 0) throw new Error('XML comment never closes');
      i = end + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end < 0) throw new Error('XML CDATA never closes');
      top.text += text.slice(lt + 9, end);
      i = end + 3;
    } else if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      if (end < 0) throw new Error('XML declaration never closes');
      i = end + 2;
    } else if (text.startsWith('<!', lt)) {
      // A DOCTYPE, with or without an internal subset.
      const bracket = text.indexOf('[', lt);
      const close = text.indexOf('>', lt);
      const end = bracket >= 0 && bracket < close ? text.indexOf(']>', bracket) + 1 : close;
      if (end <= 0) throw new Error('XML DOCTYPE never closes');
      i = end + 1;
    } else if (text[lt + 1] === '/') {
      const end = text.indexOf('>', lt);
      if (end < 0) throw new Error('XML end tag never closes');
      const name = localName(text.slice(lt + 2, end).trim());
      if (stack.length <= 1 || top.name !== name) throw new Error(`XML end tag </${name}> doesn't match <${top.name}>`);
      stack.pop();
      i = end + 1;
    } else {
      const end = tagEnd(text, lt + 1);
      if (end < 0) throw new Error('XML tag never closes');
      const inner = text.slice(lt + 1, end);
      const node: XmlNode = { name: localName(inner), children: [], text: '' };
      if (!node.name) throw new Error('XML tag without a name');
      top.children.push(node);
      if (!inner.trimEnd().endsWith('/')) {
        if (stack.length > MAX_DEPTH) throw new Error('XML nested too deep');
        stack.push(node);
      }
      i = end + 1;
    }
  }
  if (stack.length > 1) throw new Error(`XML element <${stack[stack.length - 1]?.name ?? ''}> never closes`);
  return root;
}

function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name);
}

function childText(node: XmlNode | undefined, name: string): string {
  return (child(node, name)?.text ?? '').trim();
}

function children(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((c) => c.name === name) : [];
}

/** True when the text is an MS Project XML file (a <Project> root in Microsoft's namespace). */
export function looksLikeMspdi(text: string): boolean {
  const head = text.slice(0, 4000);
  return /<(\w+:)?Project[\s>]/.test(head) && /schemas\.microsoft\.com\/project/.test(head);
}

/** UID -> the names of the resources assigned to it ("Sample Drywall Co, Sample Taping Co"). */
function assignedNames(project: XmlNode | undefined): Map<string, string> {
  const resources = new Map(children(child(project, 'Resources'), 'Resource').map((r) => [childText(r, 'UID'), childText(r, 'Name')]));
  const byTask = new Map<string, string[]>();
  for (const a of children(child(project, 'Assignments'), 'Assignment')) {
    const name = resources.get(childText(a, 'ResourceUID'));
    if (!name) continue;
    const task = childText(a, 'TaskUID');
    byTask.set(task, [...(byTask.get(task) ?? []), name]);
  }
  return new Map([...byTask].map(([k, v]) => [k, [...new Set(v)].join(', ')]));
}

function day(v: string): string | null {
  return v ? looseDay(v).day : null;
}

/** The project's tasks as a schedule. */
export function mspdiSchedule(text: string): ParsedSchedule {
  const doc = readXml(text.replace(/^﻿/, ''));
  const project = child(doc, 'Project');
  if (!project) return { title: null, dataDate: null, rows: [], warnings: ['No project in this XML.'] };
  const trades = assignedNames(project);
  const outline: string[] = [];
  const rows: ScheduleRow[] = [];
  let skipped = 0;
  for (const t of children(child(project, 'Tasks'), 'Task')) {
    const uid = childText(t, 'UID');
    const name = childText(t, 'Name');
    const level = Math.max(0, Math.trunc(Number(childText(t, 'OutlineLevel')) || 0));
    if (uid === '0' || level === 0 || childText(t, 'IsNull') === '1') continue;
    outline.length = Math.min(outline.length, level - 1);
    if (childText(t, 'Summary') === '1') {
      outline[level - 1] = name;
      continue;
    }
    if (childText(t, 'Active') === '0') {
      skipped += 1;
      continue;
    }
    const milestone = childText(t, 'Milestone') === '1';
    const start = day(childText(t, 'Start'));
    const actualStart = day(childText(t, 'ActualStart'));
    const pct = childText(t, 'PercentComplete');
    rows.push({
      ...emptyRow(name),
      code: uid || null,
      wbs: outline.filter(Boolean).join(' / ') || null,
      trade: trades.get(uid) ?? null,
      start,
      finish: milestone ? start : day(childText(t, 'Finish')),
      actual_start: actualStart,
      actual_finish: day(childText(t, 'ActualFinish')),
      percent: pct === '' ? null : percentOf(pct),
      is_milestone: milestone,
      source_ref: childText(t, 'ID') ? `ID ${childText(t, 'ID')}` : null,
    });
  }
  return {
    title: childText(project, 'Title') || childText(project, 'Name') || null,
    dataDate: day(childText(project, 'StatusDate')),
    rows,
    warnings: skipped > 0 ? [`${String(skipped)} inactive ${skipped === 1 ? 'task' : 'tasks'} left out.`] : [],
  };
}
