-- 0040 The rail by position (Jesse, Sep 28): "I don't want to clutter the job … we have our recommendations based on
-- the type of position you have." The rail is lean and actionable.
--   * roles.recommended_tools: each role's rail (a few tools, Board first), as data. Nobody but the service role writes
--     it; Jesse changes it as data, never in code.
--   * my_recommended_tools(p_project_id, null = all my jobs): per job, my role's list in its order, minus the tools the
--     job has switched off. Two roles on one job: the lists merge, a tool's earliest place wins.
--   * user_layout.rail_items: null = "use my recommendation" (the default); a list = my pins from Settings, which win on
--     every job (the app applies it: lib/jobs jobRail). Every existing row goes back to null (staging has test users).
--   * my_tool_counts(p_project_id, null = all my jobs): what needs me, per record type: my open tasks by entity_type
--     (null = a task about no record) plus the RFIs I'm waiting on (rfi_waiting) as 'rfi'; each record once. The app
--     maps a type to its tool with lib/entityTarget, the one mapping.
--   * Both functions run as the caller (SECURITY INVOKER): RLS on project_members, projects, roles and tasks answers.

-- ---------------------------------------------------------------------------
-- Recommendations, as data
-- ---------------------------------------------------------------------------
alter table public.roles add column recommended_tools text[] not null default '{}';

update public.roles r
   set recommended_tools = v.tools
  from (values
    -- A job's creator is its project admin (0002), and runs its bids (bids.manage): Bids shows while the job has it on.
    ('project_admin',     '{board,calendar,bids,rfis,inspections,files}'::text[]),
    ('pm',                '{board,calendar,rfis,inspections,files}'),
    ('pe',                '{board,calendar,rfis,inspections,files}'),
    ('estimator',         '{board,bids,files}'),
    ('superintendent',    '{board,calendar,dailies,inspections,deliveries}'),
    ('foreman',           '{board,calendar,dailies,inspections,deliveries}'),
    ('inspector',         '{board,calendar,dailies,inspections,corrections,files}'),
    ('special_inspector', '{board,calendar,inspections,dailies}'),
    ('sub',               '{board,calendar,inspections,rfis,files}'),
    ('architect',         '{board,rfis,files}'),
    ('owner_rep',         '{board,calendar,rfis,files}'),
    ('bidder',            '{bids}'),
    ('viewer',            '{board,files}')) v(name, tools)
 where r.name = v.name;

-- ---------------------------------------------------------------------------
-- Pins: null = the recommendation
-- ---------------------------------------------------------------------------
alter table public.user_layout alter column rail_items drop not null;
alter table public.user_layout alter column rail_items set default null;
update public.user_layout set rail_items = null where rail_items is not null;

-- ---------------------------------------------------------------------------
-- My recommended tools, per job
-- ---------------------------------------------------------------------------
-- Board and People are always on a job; every other tool is on when it is in projects.modules (lib/jobs MODULES).
create or replace function public.my_recommended_tools(p_project_id uuid default null)
returns table (project_id uuid, tools text[])
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.id,
         array(select u.tool
                 from public.project_members pm
                 join public.roles r on r.name = pm.role
                 cross join lateral unnest(r.recommended_tools) with ordinality as u(tool, ord)
                where pm.project_id = p.id and pm.user_id = auth.uid() and pm.status = 'active'
                  and (pm.access_ends_at is null or pm.access_ends_at > now())
                  and (u.tool in ('board', 'people') or u.tool = any (p.modules))
                group by u.tool
                order by min(u.ord), u.tool)
    from public.projects p
   where p.deleted_at is null
     and public.is_member(p.id)
     and (p_project_id is null or p.id = p_project_id)
   order by p.id;
$$;

-- ---------------------------------------------------------------------------
-- What needs me, per record type
-- ---------------------------------------------------------------------------
create or replace function public.my_tool_counts(p_project_id uuid default null)
returns table (entity_type text, n int)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select x.entity_type, count(distinct x.record)::int
    from (
      select t.entity_type, coalesce(t.entity_id, t.id) as record
        from public.tasks t
       where t.assignee_user_id = auth.uid() and t.done_at is null and t.deleted_at is null
         and (p_project_id is null or t.project_id = p_project_id)
      union
      select 'rfi', w.id
        from public.rfi_waiting() w
       where p_project_id is null or w.project_id = p_project_id
    ) x
   group by x.entity_type
   order by x.entity_type nulls first;
$$;

revoke execute on function public.my_recommended_tools(uuid), public.my_tool_counts(uuid) from public, anon;
grant execute on function public.my_recommended_tools(uuid), public.my_tool_counts(uuid) to authenticated, service_role;
