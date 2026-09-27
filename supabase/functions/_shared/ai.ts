// AI module skeleton (SPEC §8.7, §6.7). [provisional until SPEC §16 Q1]
//
// Rules this file enforces:
//   - The system prompt is the task's prompt file, verbatim. No document, email, bid or request text ever goes there.
//   - Untrusted text goes ONLY into the user turn, as escaped <document source="…" untrusted="true"> blocks.
//   - The model returns JSON that is validated with the task's zod schema. No tools, no side effects: callers save the
//     result as a draft that a person confirms.
//   - Every call is logged to ai_calls (task, model, tokens, latency, project, user) with the caller's service client.
//
// Deno functions can't read repo files at runtime, so prompt text is bundled: each task module exports its prompt
// (a string copied from prompts/<task>.md, kept in sync by the prompt tests) and is listed in `promptRegistry` below.
// The registry is a frozen literal, not something modules mutate at import time.
import { HttpError } from './http.ts';
import { env } from './env.ts';
import { type Db, dbError } from './db.ts';
import type { z } from './validate.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Task name → prompt markdown (must start with a version header, e.g. `<!-- version: 3 -->`). No tasks yet. */
export const promptRegistry: Readonly<Record<string, string>> = Object.freeze({});

export interface UntrustedDocument {
  /** Where the text came from, e.g. "email:<message-id>" or "file:<file-id>#p3". */
  source: string;
  text: string;
}

export interface TaskDef<TIn, TOut> {
  /** Matches prompts/<name>.md and the promptRegistry key. */
  name: string;
  model: 'heavy' | 'fast';
  maxTokens: number;
  output: z.ZodType<TOut>;
  /** Trusted, code-authored framing for the user turn plus the untrusted documents. */
  buildUserTurn(input: TIn): { instructions: string; documents: UntrustedDocument[] };
}

export interface TaskContext {
  /** Service-role client, used only to write ai_calls. */
  service: Db;
  projectId: string | null;
  userId: string | null;
  prompts?: Readonly<Record<string, string>>;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

/** Wraps untrusted text so it can't close its own block or pose as instructions. */
export function untrustedBlock(doc: UntrustedDocument): string {
  return `<document source="${escapeAttr(doc.source)}" untrusted="true">\n${escapeText(doc.text)}\n</document>`;
}

function promptFor(name: string, prompts: Readonly<Record<string, string>>): string {
  const text = prompts[name];
  if (!text) throw new HttpError(500, `AI prompt not registered: ${name}`);
  if (!/^\s*(<!--\s*)?version:\s*\S+/i.test(text)) throw new HttpError(500, `AI prompt ${name} has no version header`);
  return text;
}

/** Pulls the JSON object out of the model's reply (tolerates a ```json fence). */
function extractJson(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply);
  const body = (fenced ? fenced[1] : reply).trim();
  const start = body.search(/[{[]/);
  if (start < 0) throw new Error('reply contains no JSON');
  return JSON.parse(body.slice(start));
}

async function logCall(ctx: TaskContext, row: Record<string, unknown>): Promise<void> {
  const { error } = await ctx.service.from('ai_calls').insert({ project_id: ctx.projectId, user_id: ctx.userId, ...row });
  if (error) throw dbError(error, 'ai_calls insert');
}

interface AnthropicReply {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export async function runTask<TIn, TOut>(task: TaskDef<TIn, TOut>, input: TIn, ctx: TaskContext): Promise<TOut> {
  const system = promptFor(task.name, ctx.prompts ?? promptRegistry);
  const model = env(task.model === 'heavy' ? 'AI_MODEL_HEAVY' : 'AI_MODEL_FAST');
  const apiKey = env('ANTHROPIC_API_KEY');
  const turn = task.buildUserTurn(input);
  const userText = [turn.instructions, ...turn.documents.map(untrustedBlock)].join('\n\n');

  const started = Date.now();
  let reply: AnthropicReply = {};
  let failure: string | null = null;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({ model, max_tokens: task.maxTokens, system, messages: [{ role: 'user', content: userText }] }),
      signal: AbortSignal.timeout(120_000),
    });
    reply = (await res.json()) as AnthropicReply;
    if (!res.ok) failure = `anthropic ${res.status}: ${reply.error?.message ?? 'error'}`;
  } catch (e) {
    failure = `anthropic call failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  const latency = Date.now() - started;
  const tokens = { input_tokens: reply.usage?.input_tokens ?? 0, output_tokens: reply.usage?.output_tokens ?? 0 };

  let result: TOut | null = null;
  if (!failure) {
    const text = (reply.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    try {
      const parsed = task.output.safeParse(extractJson(text));
      if (parsed.success) result = parsed.data;
      else failure = `output failed validation: ${JSON.stringify(parsed.error.flatten()).slice(0, 500)}`;
    } catch (e) {
      failure = `output is not JSON: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  await logCall(ctx, { task: task.name, model, latency_ms: latency, ok: failure === null, error: failure, ...tokens });
  if (failure !== null || result === null) throw new HttpError(500, `AI task ${task.name}: ${failure ?? 'no result'}`);
  return result;
}
