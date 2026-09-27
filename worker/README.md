# Worker

One container on Fly.io that does the heavy background work (SPEC §3, §8.9). It polls the job queue through the
service-role wrapper RPCs (`worker_read_jobs`, `worker_ack_job`, `worker_fail_job`), never pgmq directly, and
pings `worker_heartbeat_ping` every 30 seconds so `queue_health()` can tell when it is down.

## Jobs

| Kind | Phase 0 behaviour |
|---|---|
| `scan_file` | Streams the object to disk (SHA-256 on the way), scans it with clamd. Records `clean`, `infected` or `too_large_to_scan` (never `clean` for an oversize file). Infected: a task for each project admin and a board post for `files.manage`. Clean: enqueues `extract_text` and, for PDFs/Office/images, `thumbnails`. |
| `extract_text` | Per-page text into `file_pages` (PDF directly, DOCX/XLSX via LibreOffice). Other types get `text_status = 'none'`. |
| `thumbnails` | PNGs of the first 50 pages at `<file dir>/thumbs/p<N>.png`. Images use the original object. |
| `r2_copy` | Nightly copy of changed objects in the `files` bucket to R2 plus `backups/manifest-YYYY-MM-DD.json`. |
| `render_pdf` | Stub until Phase 3. |
| `build_zip` | Stub until Phase 2. |
| `send_email` | Stub: Phase 0 email goes out through edge functions. |
| `sort_inbound_email` | Stub until Phase 1. |

Up to 3 jobs run at once. When the queue is empty the worker waits 2 s, backing off to 10 s. Retries, backoff between
attempts, dead jobs and the admin notice all happen in the database. Every handler is safe to run twice.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | The worker is a queue consumer, one of the allowed service-key users. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | yes | Nightly storage copy. |
| `SENTRY_DSN` | no | The only optional one: without it errors are logged, not sent. |
| `CLAMAV_MAX_BYTES` | no | Default 4000 MiB (ClamAV's maximum). Larger files are `too_large_to_scan`. |
| `WORKER_TMP_DIR` | no | Scratch directory for downloads; point it at a Fly volume for multi-GB sets. |
| `WORKER_VERSION` | no | Baked in by `--build-arg`; falls back to `FLY_IMAGE_REF`. |

The worker refuses to start and lists every missing variable.

## Deploy

CI deploys staging on merge; production is promoted by Jesse. By hand (from the repo root, never from a laptop for
production):

```sh
fly secrets set --config worker/fly.toml SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... R2_ACCOUNT_ID=... \
  R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... SENTRY_DSN=...
flyctl deploy --config worker/fly.toml --remote-only --build-arg WORKER_VERSION=$(git rev-parse --short HEAD)
fly scale count 1 --config worker/fly.toml
```

The build context is the repo root. The image runs `freshclam` at build time and every 6 hours at runtime.

## Local development

```sh
npm install --prefix worker
npm run dev --prefix worker     # needs clamd, poppler-utils and LibreOffice on the machine
```

Unit tests run from the root with `npm run test:unit` (`worker/src/**/*.test.ts`).

## Phase 0 acceptance: EICAR test file is blocked

1. Download the EICAR test file from eicar.org (the standard harmless antivirus test string). Don't commit it.
2. On staging, upload it into any folder of a test project through the app.
3. Within a minute `files.scan_status` for that row is `infected`.
4. Download is refused (`authorize_download` raises `infected`), each project admin has a
   "Infected file blocked" task, and the board shows the post to people with `files.manage`.
5. Check the worker logs (`fly logs --config worker/fly.toml`) for `scan finished` with `scan_status: infected`.

For the oversize path, a file larger than `CLAMAV_MAX_BYTES` (or one clamd flags with `Heuristics.Limits.Exceeded`)
must end as `too_large_to_scan`, never `clean`.
