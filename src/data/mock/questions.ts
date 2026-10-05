// Pre-bid questions and published answers in the e2e mock, like the database (0011): Sample Job A has question 1
// (open) and answer 2. Answering publishes (or replaces) the answer for that question's number; Dismiss and Reopen
// change the status with a version check. Lives in sessionStorage, never module state.
import type { PublishedAnswerRow, QuestionRow } from '../bids.types';
import { conflictError, DataError } from '../errors';
import { delay } from './store';

const KEY = 'e2e-mock-questions';

const QUESTIONS: QuestionRow[] = [
  {
    id: 'q-1',
    project_id: 'job-a',
    package_id: 'pkg-1',
    member_id: 'member-2',
    number: 1,
    question: 'Sample Design here: is the sample slab thickness 4 or 6 inches?',
    status: 'open',
    created_at: '2026-09-22T17:00:00Z',
    version: 1,
  },
];

const ANSWERS: PublishedAnswerRow[] = [
  {
    id: 'answer-2',
    project_id: 'job-a',
    number: 2,
    question_text: 'Is there a sample walk?',
    answer: 'Yes, see addendum 1.',
    published_at: '2026-09-23T18:00:00Z',
  },
];

interface Stored {
  questions: QuestionRow[];
  answers: PublishedAnswerRow[];
}

function read(): Stored {
  const raw = window.sessionStorage.getItem(KEY);
  return raw === null ? { questions: [], answers: [] } : (JSON.parse(raw) as Stored);
}

function write(update: (s: Stored) => Stored): void {
  window.sessionStorage.setItem(KEY, JSON.stringify(update(read())));
}

function merged<T extends { id: string }>(base: readonly T[], saved: readonly T[]): T[] {
  return [...base.map((b) => saved.find((x) => x.id === b.id) ?? b), ...saved.filter((x) => !base.some((b) => b.id === x.id))];
}

export async function list(projectId: string): Promise<QuestionRow[]> {
  await delay();
  return merged(QUESTIONS, read().questions)
    .filter((q) => q.project_id === projectId)
    .sort((a, b) => b.number - a.number);
}

export async function answers(projectId: string): Promise<PublishedAnswerRow[]> {
  await delay();
  return merged(ANSWERS, read().answers).filter((a) => a.project_id === projectId);
}

export async function answer(id: string): Promise<PublishedAnswerRow | null> {
  await delay();
  return merged(ANSWERS, read().answers).find((a) => a.id === id) ?? null;
}

function current(q: QuestionRow): QuestionRow {
  const row = merged(QUESTIONS, read().questions).find((x) => x.id === q.id);
  if (!row) throw new DataError('That item no longer exists.', 'P0002', 'mock: question not found');
  return row;
}

function putQuestion(row: QuestionRow): void {
  write((s) => ({ ...s, questions: [...s.questions.filter((x) => x.id !== row.id), row] }));
}

export async function setStatus(q: QuestionRow, status: string): Promise<void> {
  await delay();
  const row = current(q);
  if (row.version !== q.version) throw conflictError();
  putQuestion({ ...row, status, version: row.version + 1 });
}

/** answer_bid_question: one answer per question number (a second one replaces it); the question becomes answered. */
export async function publish(q: QuestionRow, questionText: string, text: string): Promise<void> {
  await delay();
  const row = current(q);
  const all = merged(ANSWERS, read().answers);
  const before = all.find((a) => a.project_id === row.project_id && a.number === row.number);
  const next: PublishedAnswerRow = {
    id: before?.id ?? `mock-answer-${row.id}`,
    project_id: row.project_id,
    number: row.number,
    question_text: questionText,
    answer: text,
    published_at: new Date().toISOString(),
  };
  write((s) => ({ ...s, answers: [...s.answers.filter((a) => a.id !== next.id), next] }));
  putQuestion({ ...row, status: 'answered', version: row.version + 1 });
}
