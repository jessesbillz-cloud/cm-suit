// Prompt sync gate (CLAUDE.md rule 12, SPEC §8.7). Deno functions can't read repo files at runtime, so each
// prompts/<task>.md is embedded as supabase/functions/_shared/prompts/<task>.ts:
//
//   export const PROMPT = String.raw`<the .md file, byte for byte>`;
//
// Fails when a copy differs from its .md, when either side is missing, when the .md has no version header or can't be
// embedded (backtick or "${"), or when the task has no synthetic fixtures. Called by scripts/hygiene.mjs.
// `node scripts/check-prompts.mjs --write` regenerates the .ts copies from the .md files.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MD_DIR = 'prompts';
const TS_DIR = 'supabase/functions/_shared/prompts';
const OPEN = 'export const PROMPT = String.raw`';
const CLOSE = '`;\n';

function header(task) {
  return `// Embedded copy of prompts/${task}.md. Do not edit here: edit the .md, then run\n` +
    '// `node scripts/check-prompts.mjs --write`. scripts/check-prompts.mjs fails when the two differ.\n';
}

function embedded(src) {
  const start = src.indexOf(OPEN);
  const end = src.lastIndexOf(CLOSE);
  if (start < 0 || end < start) return null;
  return src.slice(start + OPEN.length, end);
}

/** Returns a list of problems (empty = OK). With write=true, rewrites the .ts copies first. */
export function checkPrompts(write = false) {
  const problems = [];
  const tasks = readdirSync(MD_DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
  for (const task of tasks) {
    const md = readFileSync(`${MD_DIR}/${task}.md`, 'utf8');
    const tsPath = `${TS_DIR}/${task}.ts`;
    if (!/^<!--\s*version:\s*\S+\s*-->/.test(md)) problems.push(`${MD_DIR}/${task}.md: first line must be <!-- version: N -->`);
    if (md.includes('`') || md.includes('${')) {
      problems.push(`${MD_DIR}/${task}.md: backticks and "\${" can't be embedded in String.raw; reword`);
      continue;
    }
    if (write) writeFileSync(tsPath, `${header(task)}${OPEN}${md}${CLOSE}`);
    if (!existsSync(tsPath)) {
      problems.push(`${tsPath} missing (run node scripts/check-prompts.mjs --write)`);
    } else if (embedded(readFileSync(tsPath, 'utf8')) !== md) {
      problems.push(`${tsPath} differs from ${MD_DIR}/${task}.md (run node scripts/check-prompts.mjs --write)`);
    }
    const fx = `${MD_DIR}/fixtures/${task}`;
    const docs = existsSync(fx) ? readdirSync(fx).filter((f) => !f.endsWith('.expected.json')) : [];
    if (docs.length === 0) problems.push(`${fx}/ has no synthetic fixtures`);
    for (const d of docs) {
      const expected = `${fx}/${d.replace(/\.[^.]+$/, '')}.expected.json`;
      if (!existsSync(expected)) {
        problems.push(`${fx}/${d} has no matching .expected.json`);
        continue;
      }
      try {
        JSON.parse(readFileSync(expected, 'utf8'));
      } catch (e) {
        problems.push(`${expected} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  if (existsSync(TS_DIR)) {
    for (const f of readdirSync(TS_DIR).filter((n) => n.endsWith('.ts'))) {
      if (!tasks.includes(f.slice(0, -3))) problems.push(`${TS_DIR}/${f} has no ${MD_DIR}/${f.slice(0, -3)}.md`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkPrompts(process.argv.includes('--write'));
  if (problems.length) {
    console.error('Prompt check failed:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log('Prompts OK.');
}
