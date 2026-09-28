-- 0031 A job made by an inspector company doesn't start with the Bids tool (Jesse: what comes up should fit the kind
-- of user). Existing inspector-company jobs without any bid package lose the switch too; nothing is deleted, and
-- Settings > Job turns it back on.
create or replace function public.tg_project_modules_by_kind()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select kind from public.orgs where id = new.org_id) = 'inspector' then
    new.modules := array_remove(new.modules, 'bids');
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_project_modules_by_kind() from public, anon, authenticated;
create trigger modules_by_kind before insert on public.projects
  for each row execute function public.tg_project_modules_by_kind();

update public.projects p
   set modules = array_remove(p.modules, 'bids')
  from public.orgs o
 where o.id = p.org_id and o.kind = 'inspector' and 'bids' = any (p.modules)
   and not exists (select 1 from public.bid_packages b where b.project_id = p.id);
