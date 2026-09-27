// Worker environment, validated once at startup. A missing required value stops the worker (never skip a check).
import { z } from 'zod';

const required = z.string().min(1);

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: required,
  R2_ACCOUNT_ID: required,
  R2_ACCESS_KEY_ID: required,
  R2_SECRET_ACCESS_KEY: required,
  R2_BUCKET: required,
  // ClamAV's own ceiling is 4000M (MiB). Anything larger is `too_large_to_scan`, never `clean`.
  CLAMAV_MAX_BYTES: z.coerce.number().int().positive().default(4000 * 1024 * 1024),
  // Where large downloads land. Point it at a Fly volume if the root filesystem is too small for plan sets.
  WORKER_TMP_DIR: z.string().min(1).optional(),
  WORKER_VERSION: required,
});

export type WorkerEnv = z.infer<typeof envSchema>;

type EnvResult = { ok: true; env: WorkerEnv } | { ok: false; problems: string[] };

/** Build version: set at image build time (Dockerfile ARG), else Fly's image ref, else "dev". */
export function workerVersion(source: NodeJS.ProcessEnv): string {
  return nonEmpty(source.WORKER_VERSION) ?? nonEmpty(source.FLY_IMAGE_REF) ?? 'dev';
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

export function parseEnv(source: NodeJS.ProcessEnv): EnvResult {
  // Treat empty strings as missing so `FOO=` in a secrets file fails loudly.
  const cleaned: Record<string, string | undefined> = {};
  for (const key of Object.keys(envSchema.shape)) cleaned[key] = nonEmpty(source[key]);
  cleaned.WORKER_VERSION = workerVersion(source);

  const parsed = envSchema.safeParse(cleaned);
  if (parsed.success) return { ok: true, env: parsed.data };
  const problems = parsed.error.issues.map((issue) => {
    const name = issue.path.join('.');
    return cleaned[name] === undefined ? `${name} (missing)` : `${name} (${issue.message})`;
  });
  return { ok: false, problems };
}
