// Fails when Supabase's security advisor reports any ERROR-level lint (SPEC §9.1).
const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) { console.error('SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are required'); process.exit(1); }
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/security`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) { console.error(`advisor API ${res.status}`); process.exit(1); }
const body = await res.json();
const lints = body.lints ?? body;
const errors = lints.filter((l) => String(l.level).toUpperCase() === 'ERROR');
for (const e of errors) console.error(`ERROR ${e.name}: ${e.detail ?? e.title}`);
if (errors.length) process.exit(1);
console.log(`Advisor OK: 0 errors, ${lints.length - errors.length} non-error lints.`);
