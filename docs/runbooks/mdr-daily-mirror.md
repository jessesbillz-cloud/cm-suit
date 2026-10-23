# MDR daily mirror, step by step

Once a day, at the end of the day, the inspection requests of each linked My Daily Reports (MDR) job are copied into
the suite, one way (migration 0112). MDR is only read: the one statement ever run on MDR is the `SELECT` the suite
hands you in step 1. Copies are view only in the suite and marked From MDR. Running a step twice is safe.

A scheduled task runs steps 1 to 5 every evening. It needs the Supabase SQL tool (`execute_sql`) and, in its prompt,
two project refs: **MDR_REF** (MDR, read only) and **SUITE_REF** (the suite). One SQL call per step. Copy every SQL
text exactly as given: never edit it, never add a `;`, never split it.

## Every evening (the scheduled task)

1. **Start the run (SUITE_REF).** Run:

   ```sql
   select public.mdr_sync_begin()
   ```

   The answer is one JSON value with `mdr_sql`. If the call fails with `No MDR job is linked`, stop and report that.

2. **Read MDR (MDR_REF).** Run the text of `mdr_sql` exactly as it is. It is a `SELECT` of the rows changed since the
   last run. Each row it answers has `batch`, `rows`, `last_updated_at` and `suite_sql`.
   - No rows: nothing changed. Go to step 4.
   - Never run any other statement on MDR_REF.

3. **Copy each batch (SUITE_REF).** For each row of step 2, in `batch` order, run its `suite_sql` text exactly as it
   is (it begins `select public.mdr_import_requests(`). One call per batch, at most 50 requests each. Each answer is
   JSON:
   - `counts`: how many were `inserted`, `updated`, `adopted` (typed in by hand earlier, now linked), `unchanged`,
     `hidden` (deleted in MDR) and `skipped`.
   - `errors`: requests the suite refused, each with `ir_number` and `error`. The others in the batch are copied.
     Keep the list for the report. A refused request is read again on the next run.
   - `skipped`: requests not copied on purpose (`no IR number`: MDR's oldest requests; `deleted in MDR`).
   - `numbers_also_on_suite_requests`: IR numbers that one of the suite's own requests also carries. Report them.
   - If the call fails as a whole (an SQL error, not an `errors` entry): stop. Do not run step 4. Report the error.
     The next run starts from the same place.

4. **End the run (SUITE_REF).** Run:

   ```sql
   select public.mdr_sync_end()
   ```

   The answer has, per job, `counts`, the new `cursor` and `stopped_at_error` (true when a request was refused: the
   next run reads again from it), plus `files_waiting` and `files_kick` (`asked`: the file copy was started).

5. **Report** in one short message: the counts, each refused request (`IR <number>: <error>`), any shared IR numbers,
   and the files waiting. Nothing else.

## Every morning (the file copy check)

The `mdr-files` function copies the queued files overnight (pg_cron, every half hour from 03:15 to 05:45 UTC, and
once at the end of step 4). Run on SUITE_REF:

```sql
select public.mdr_files_status()
```

`counts` should show only `done`. `problems` lists each `failed` (three tries used) or `refused` (not a link to MDR's
storage, or over 250 MB, or an IR PDF that is not a PDF) file with its IR number and error. Report the problems.
Something still `queued` or `working` after 06:00 UTC means the function is not running: report it.

## Once, before the first run (the lead)

1. Apply migration 0112 and deploy `mdr-files` (verify_jwt on, like `queue-health`).
2. Set the function secret `MDR_PUBLIC_HOST` to MDR's storage host (the host of its public file links, nothing else).
   Unset, the function refuses every request.
3. Vault, for pg_cron's call (Supabase dashboard > Vault, or `vault.create_secret`): `project_url` (the suite's API
   URL), `anon_key` (the platform key the call passes verify_jwt with) and `cron_secret` (the same value as the
   functions' `CRON_SECRET`). pg_net must be on. Until then `files_kick` says `not asked` and nothing is copied.
4. Link the job (data, not code). Adopt range: the IR numbers typed into the suite by hand before the mirror.

   ```sql
   insert into public.mdr_job_links (mdr_job_id, project_id, adopt_from, adopt_to)
   values ('<MDR job id>', '<suite job id>', <first hand-typed IR>, <last hand-typed IR>)
   on conflict (mdr_job_id) do nothing
   ```

5. Run steps 1 to 5 once by hand and read the answers. Then create the scheduled task for 6 pm Pacific.

A request typed in by hand inside the adopt range is linked to the MDR request with its number (the same day first)
instead of being copied again. MDR reuses IR numbers, so a mirrored number can appear on more than one request. The
suite's own counter moves past every mirrored number on each import.

## Turning it off

`update public.mdr_job_links set active = false where mdr_job_id = '<MDR job id>'` stops the copy. Copies already made
stay, view only.
