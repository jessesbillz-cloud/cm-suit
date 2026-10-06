-- 0086 Corrections: the CN number is the notice's number (Jesse, Oct 5: "the user should never be adjusting numbers.
-- The number is generated when the document is submitted").
--   * An item is numbered by next_number(project, 'cn') when it is saved (create_correction). There are no unsaved,
--     numbered drafts: the form is open until Save, and only Save makes the item and its number.
--   * notice_ref was a second, typed "Notice no.". The app no longer shows or writes it. Here nobody can: Edit loses
--     the column grant, and a new item always starts with none (create_correction still takes p_notice_ref, so an
--     older app keeps working, but the value is dropped). Items that already have one keep it (nothing is changed).
--   * Spec sections are written in the description now. spec_tags stays as it is for older items.

revoke update (notice_ref) on public.corrections from authenticated;

create or replace function public.tg_corrections_no_notice_ref()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.notice_ref := '';
  return new;
end;
$$;
revoke execute on function public.tg_corrections_no_notice_ref() from public, anon, authenticated;

create trigger corrections_no_notice_ref
  before insert on public.corrections
  for each row execute function public.tg_corrections_no_notice_ref();
