-- 0048 Saving my own profile (found by the request-link probe, Sep 29): the update policy's check read auth.users,
-- which signed-in users may not read, so every profile save failed with "permission denied for table users" (Settings
-- and the request link's name fill alike). The structural fix: a person may update only the columns they own, granted
-- by name, and the policy checks only that the row stays theirs.
--   * Updatable by the person: full_name, phone, title, company, timezone, timezone_set_by_user (src/data/types.ts
--     ProfilePatch).
--   * Not updatable by the person: email (Auth's, copied at sign-up; the old check existed only to pin it),
--     signature_path and cert_numbers (set by the functions that own them), and the row's keys and bookkeeping
--     (user_id, created_at; updated_at and version are set by the touch trigger).

drop policy "profile: own update" on public.profiles;
create policy "profile: own update" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, title, company, timezone, timezone_set_by_user) on public.profiles to authenticated;
