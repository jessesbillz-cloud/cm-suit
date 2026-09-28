-- 0037 Testing: uploads are usable at once (Jesse, Sep 28: an uploaded submittal sat on "Scanning"). No virus
-- scanner runs yet (no worker host; decisions.md), so every upload stayed pending: only the uploader could open it,
-- and it couldn't be sent or attached. Scanning comes back later, in the background.
--   * Switch security_switches 'testing_skip_virus_scan', OFF by default (and in every test database). While ON, a
--     finished upload is marked usable ('clean') and scan_skipped_at records that it was never scanned.
--   * To restore: switch it off, then set scan_status back to 'pending' where scan_skipped_at is set; the queued
--     scan_file jobs scan them once a worker runs.

insert into public.security_switches (key, enabled, note) values
  ('testing_skip_virus_scan', false,
   'ON only while Jesse and Matt test (no scanner running yet): finished uploads are usable at once; scan_skipped_at marks them for a scan later.');

alter table public.files add column scan_skipped_at timestamptz;

-- SECURITY DEFINER to read the switch (people can't read security_switches); it only ever changes the row being
-- completed, and only from pending.
create or replace function public.tg_files_skip_scan()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.upload_complete and not old.upload_complete and new.scan_status = 'pending'
     and coalesce((select s.enabled from public.security_switches s where s.key = 'testing_skip_virus_scan'), false) then
    new.scan_status := 'clean';
    new.scan_skipped_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_files_skip_scan() from public, anon, authenticated;
create trigger skip_scan before update of upload_complete on public.files
  for each row execute function public.tg_files_skip_scan();
