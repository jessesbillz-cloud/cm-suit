-- 0081 More and Edit list only the tools my role may read (audit Oct 4, frame #12; SPEC §18.3: people add tools
-- "within what the role may see"). Before, a job's More listed every tool the job has on, so a bidder, a requester or
-- a safety manager got Dailies, Schedule, Hours and others that each opened to "You can't ..." or "No ... for you".
--
--   * my_readable_tools(p_project_id, null = all my jobs): per job, the job tools whose read capability I hold there,
--     through has_capability (so view-as, access end dates and aal2 count as everywhere else). The matrix does not
--     change: this only reads it. The tool -> capability list is the one each tool's screen and RLS already use:
--       board         every member (the job's message board)
--       files         files.read_project, files.write_project or files.manage (folder_can_read)
--       bids          bids.manage or bids.submit (BidsTool)
--       calendar      calendar.read
--       dailies       dailies.read_all or dailies.write (DailiesTool)
--       inspections   any ir.* read or ask (useIrAccess seesInspections)
--       revs          revs.read
--       rfis          rfi.create_draft, rfi.sign_issue, rfi.answer or files.read_project (rfi_may_see)
--       permits       permits.read
--       deliveries    deliveries.view or deliveries.post
--       corrections   corrections.view
--       safety        safety.read
--       schedule      schedule.read
--       requirements  requirements.read or requirements.read_own
--       people        members.view or members.manage
--       hours         dailies.write (my hours come from my own dailies)
--   * Runs as the caller (security invoker), like my_recommended_tools. The app filters a job's rail, More and Edit by
--     it (lib/jobs railModel); modules switched off still hide a tool as before.
--   * roles.invitable (below): the roles People's invite form offers. Bidder and requester join by their own links.
--   * schedule_activity_add (below): "Add row" in a schedule draft's review (frame #20), for a row the reader missed.
create or replace function public.my_readable_tools(p_project_id uuid default null)
returns table (project_id uuid, tools text[])
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.id,
         array(select t.tool
                 from (values
                   (1, 'board', null::text[]),
                   (2, 'files', '{files.read_project,files.write_project,files.manage}'::text[]),
                   (3, 'bids', '{bids.manage,bids.submit}'::text[]),
                   (4, 'calendar', '{calendar.read}'::text[]),
                   (5, 'dailies', '{dailies.read_all,dailies.write}'::text[]),
                   (6, 'inspections', '{ir.request,ir.view_all,ir.decide,ir.ofs_decide,ir.ofs_view}'::text[]),
                   (7, 'revs', '{revs.read}'::text[]),
                   (8, 'rfis', '{rfi.create_draft,rfi.sign_issue,rfi.answer,files.read_project}'::text[]),
                   (9, 'permits', '{permits.read}'::text[]),
                   (10, 'deliveries', '{deliveries.view,deliveries.post}'::text[]),
                   (11, 'corrections', '{corrections.view}'::text[]),
                   (12, 'safety', '{safety.read}'::text[]),
                   (13, 'schedule', '{schedule.read}'::text[]),
                   (14, 'requirements', '{requirements.read,requirements.read_own}'::text[]),
                   (15, 'people', '{members.view,members.manage}'::text[]),
                   (16, 'hours', '{dailies.write}'::text[])
                 ) as t(ord, tool, caps)
                where t.caps is null
                   or exists (select 1 from unnest(t.caps) as c(cap) where public.has_capability(p.id, c.cap))
                order by t.ord)
    from public.projects p
   where p.deleted_at is null
     and public.is_member(p.id)
     and (p_project_id is null or p.id = p_project_id)
   order by p.id;
$$;

revoke execute on function public.my_readable_tools(uuid) from public, anon;
grant execute on function public.my_readable_tools(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- Roles a person is invited to from People (audit Oct 4, frame #24). Two roles join by their own link, never by an
-- invite: the bidder (a package's invite, 0011) and the requester (the job's request link, 0055). As data, so the
-- invite picker never names a role in code (CLAUDE.md rule 2).
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.roles add column invitable boolean not null default true;
update public.roles set invitable = false where name in ('bidder', 'requester');

-- ---------------------------------------------------------------------------------------------------------------------
-- "Add row" in a schedule draft (audit Oct 4, frame #20; rule 12: a person confirms what the reader made, so a row it
-- missed can be added before Publish). schedule.manage, drafts only (schedule_draft_lock, 0062). The row goes last and
-- counts as checked. Safe to repeat: the same row (name, ID, dates) already on the draft is returned, not added twice.
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.schedule_activity_add(
  p_version_id uuid,
  p_code text,
  p_name text,
  p_wbs text,
  p_area text,
  p_trade text,
  p_start date,
  p_finish date,
  p_is_milestone boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v public.schedule_versions; v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  v := public.schedule_draft_lock(p_version_id);
  select a.id into v_id from public.schedule_activities a
   where a.version_id = v.id and a.deleted_at is null and a.name = v_name
     and a.activity_code is not distinct from public.schedule_text(p_code)
     and a.start_date is not distinct from p_start and a.finish_date is not distinct from p_finish
   limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.schedule_activities (org_id, project_id, version_id, sort, activity_code, name, wbs, area, trade,
                                          start_date, finish_date, is_milestone, unsure)
  values (v.org_id, v.project_id, v.id,
          coalesce((select max(a.sort) from public.schedule_activities a where a.version_id = v.id), 0) + 1,
          public.schedule_text(p_code), v_name, public.schedule_text(p_wbs), public.schedule_text(p_area),
          public.schedule_text(p_trade), p_start, p_finish, coalesce(p_is_milestone, false), false)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.schedule_activity_add(uuid, text, text, text, text, text, date, date, boolean) from public, anon;
grant execute on function public.schedule_activity_add(uuid, text, text, text, text, text, date, date, boolean)
  to authenticated, service_role;
