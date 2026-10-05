// Hygiene gate (SPEC §4). Fails on files outside the folder map, junk patterns,
// service-role key use outside the allowlist, and real-looking job data in fixtures.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { checkPrompts } from './check-prompts.mjs';

const ROOT_ALLOW = new Set([
  'README.md', 'CLAUDE.md', 'SPEC.md', 'package.json', 'package-lock.json',
  'tsconfig.json', 'tsconfig.node.json', 'vite.config.ts', 'tailwind.config.ts', 'postcss.config.js',
  'eslint.config.js', 'knip.json', 'playwright.config.ts', 'vitest.config.ts', 'index.html',
  '.env.example', '.gitignore', '.nvmrc', '.github', '.husky',
]);
const DIR_ALLOW = new Set(['src', 'public', 'supabase', 'worker', 'prompts', 'scripts', 'tests', 'docs']);
const JUNK = [/ 2\./, /\.fuse_hidden/, /(^|\/)\.DS_Store$/, /\.tmp/, /\.bak$/, /\.zip$/, /\.orig$/];

const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const problems = [];
for (const f of files) {
  const top = f.split('/')[0];
  const isRoot = !f.includes('/');
  if (isRoot && !ROOT_ALLOW.has(top)) problems.push(`root file not in allowlist: ${f}`);
  if (!isRoot && !ROOT_ALLOW.has(top) && !DIR_ALLOW.has(top)) problems.push(`folder not in map: ${f}`);
  for (const re of JUNK) if (re.test(f)) problems.push(`junk pattern: ${f}`);
}

// Service-role key allowlist (SPEC §6.3).
const allowPath = 'supabase/tests/admin_service_key_allowlist.txt';
const allowed = new Set(
  existsSync(allowPath) ? readFileSync(allowPath, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#')) : [],
);
const ALWAYS_OK = new Set(['_shared/db.ts']);
for (const f of files.filter((p) => p.startsWith('supabase/functions/') && p.endsWith('.ts'))) {
  const rel = f.replace('supabase/functions/', '');
  const src = readFileSync(f, 'utf8');
  if (/SUPABASE_SERVICE_ROLE_KEY|serviceClient\(/.test(src)) {
    const fn = rel.split('/')[0];
    if (!ALWAYS_OK.has(rel) && !allowed.has(fn)) problems.push(`service-role key used outside allowlist: ${f}`);
  }
}

// Fixtures must be synthetic. Cheap tripwire: known real job numbers/names never appear.
const TRIPWIRES = (process.env.FIXTURE_TRIPWIRES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
for (const f of files.filter((p) => p.startsWith('prompts/fixtures/'))) {
  const src = readFileSync(f, 'utf8');
  for (const t of TRIPWIRES) if (src.includes(t)) problems.push(`possible real job data in fixture ${f}: "${t}"`);
}

// The hosted SQL tool splits a migration on every `;`, comments included: a `;` in a comment inside an update cut it
// before its `where`, and the tool refused the file (0072, Oct 5). Migrations applied before that keep their comments.
const SEMICOLON_RULE_FROM = '20261004000072';
for (const f of files.filter((p) => /^supabase\/migrations\/\d{14}_.*\.sql$/.test(p))) {
  if (f.split('/')[2].slice(0, 14) < SEMICOLON_RULE_FROM) continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const at = line.indexOf('--');
    if (at >= 0 && line.slice(at).includes(';')) problems.push(`';' in a comment (the hosted tool splits on it): ${f}:${i + 1}`);
  });
}

// Embedded prompt copies match prompts/<task>.md, and every task has synthetic fixtures.
problems.push(...checkPrompts());

if (problems.length) {
  console.error('Hygiene check failed:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Hygiene OK (${files.length} files).`);
