-- 0095 Revs polish (Jesse, Oct 10: "I know you missed quite a few of the previous sign-offs, so I need to be able to
-- go in there and make the changes"). A manager now changes a sign-off made before the app from the room page. Until
-- now rev_signoff_set kept a sign-off's OFS IR on file (0083 file_id) when its OFS number changed, so the wall went on
-- opening the old number's IR. Now a changed number (or none) drops the file, and the app links the new number's IR at
-- once (rev_file_link, 0094's rule). The same number keeps its file. Everything else is 0082's, the same signature, so
-- its grants stay (create or replace keeps them).
create or replace function public.rev_signoff_set(p_area_id uuid, p_item_ids uuid[], p_ofs_number int, p_signed_on date, p_note text)
returns setof public.rev_signoffs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare a public.rev_areas; v_note text; v_item uuid; s public.rev_signoffs; v_today date;
begin
  a := public.rev_signoff_wall(p_area_id, p_item_ids);
  if p_ofs_number is not null and p_ofs_number not between 1 and 999999 then
    raise exception 'Give the OFS IR number, 1 or more.' using errcode = '22023';
  end if;
  select (now() at time zone timezone)::date into v_today from public.projects where id = a.project_id;
  if p_signed_on is not null and (p_signed_on > v_today or p_signed_on < date '2000-01-01') then
    raise exception 'Pick the day it was signed off.' using errcode = '22023';
  end if;
  v_note := public.rev_text_or_null(p_note, 300, 'note');
  for v_item in select i.id from public.rev_items i join public.revs v on v.id = i.rev_id
                 where i.id = any (p_item_ids) order by v.number, i.position, i.name, i.id loop
    select * into s from public.rev_signoffs x where x.area_id = a.id and x.item_id = v_item and x.deleted_at is null for update;
    if s.id is null then
      insert into public.rev_signoffs (org_id, project_id, created_by, area_id, item_id, ofs_number, signed_on, note)
      values (a.org_id, a.project_id, auth.uid(), a.id, v_item, p_ofs_number, p_signed_on, v_note)
      returning * into s;
    elsif (s.ofs_number, s.signed_on, s.note) is distinct from (p_ofs_number, p_signed_on, v_note) then
      update public.rev_signoffs
         set ofs_number = p_ofs_number, signed_on = p_signed_on, note = v_note,
             file_id = case when ofs_number is not distinct from p_ofs_number then file_id end
       where id = s.id returning * into s;
    end if;
    return next s;
    s := null;
  end loop;
end;
$$;

revoke execute on function public.rev_signoff_set(uuid, uuid[], integer, date, text) from public, anon;
grant execute on function public.rev_signoff_set(uuid, uuid[], integer, date, text) to authenticated, service_role;
