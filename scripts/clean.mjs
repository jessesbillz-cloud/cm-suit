import { rmSync, mkdirSync } from 'node:fs';
for (const d of ['scratch', 'dist', 'dev-dist', 'worker/dist', 'playwright-report', 'test-results']) rmSync(d, { recursive: true, force: true });
mkdirSync('scratch', { recursive: true });
console.log('clean.');
