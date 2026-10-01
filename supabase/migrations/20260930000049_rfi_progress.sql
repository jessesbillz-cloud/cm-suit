-- 0049 The RFI log's route strip (Jesse, Sep 30): every RFI row shows each step of its own route, who had it and how
-- long it sat there ("Sub 1d > PE 2d > Architect 5d, now"), so nobody can sit on one unseen.
--   * rfi_progress(p_project_id): one row per step of every RFI the caller may see on the job, in route order:
--     0 the originator, 1..n the RFI's reviewers (its own copy once sent, else the job's route today), n+1 issue,
--     n+2 the architect, n+3 the end ("Answered", or "Closed"). Only RFIs rfi_list returns (the same filter as the rfis
--     policy: rfi_may_see), so it never shows more than the log already lets the caller see.
--   * Times come from the RFI and its events, for the current pass only: a "Send back" starts the route again, and a
--     resend counts from that send. entered_at is when the step got it, left_at when it moved on (null for the current
--     step and for the end).
--   * days: whole days it sat there, on the JOB's clock: 0 when under 24 hours, else the calendar days between the two
--     moments in the job's time zone (at least 1). The current step counts to now. Null for steps ahead and the end.
--   * Labels: the originator's role on the job (else their name), each reviewer's label, "PM / PE" until issued and
--     then the issuer's role, "Architect", and the end. person_name says who did a step (or holds it, when the step is
--     one named person).

create or replace function public.rfi_progress(p_project_id uuid)
returns table (
  rfi_id uuid, "position" int, kind text, label text, person_name text, state text,
  entered_at timestamptz, left_at timestamptz, days int, due_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with seen as (
    select r.id, r.project_id, r.created_by, r.status, r.step, r.created_at, r.sent_at, r.issued_at, r.issued_by,
           r.answered_at, r.answered_by, r.due_at, p.timezone as tz,
           -- The current pass starts at the latest "Send back", else when it was written.
           coalesce((select max(e.at) from public.rfi_events e where e.rfi_id = r.id and e.kind = 'returned'),
                    r.created_at) as began
      from public.rfis r
      join public.projects p on p.id = r.project_id
     where r.project_id = p_project_id and r.deleted_at is null
       and public.rfi_may_see(r.id, r.project_id, r.created_by, r.status, r.step)
  ),
  reviewers as (
    select st.rfi_id, st.position as pos, st.label, st.user_id
      from seen s join public.rfi_steps st on st.rfi_id = s.id
    union all
    select s.id, rs.position, public.rfi_step_label(rs.role, rs.user_id), rs.user_id
      from seen s join public.rfi_route_steps rs on rs.project_id = s.project_id
     where not exists (select 1 from public.rfi_steps x where x.rfi_id = s.id)
  ),
  sized as (
    select s.*, (select count(*)::int from reviewers v where v.rfi_id = s.id) as n
      from seen s
  ),
  steps as (
    select s.id as rfi_id, 0 as pos, 'ask'::text as kind,
           coalesce((select public.rfi_role_label(pm.role) from public.project_members pm
                      where pm.project_id = s.project_id and pm.user_id = s.created_by and pm.status <> 'revoked'
                      order by pm.created_at limit 1),
                    public.rfi_person_name(s.created_by)) as label,
           s.created_by as done_by, null::uuid as named, s.sent_at as left_at
      from sized s
    union all
    select v.rfi_id, v.pos, 'review', v.label, f.actor, v.user_id, f.at
      from reviewers v
      join sized s on s.id = v.rfi_id
      left join lateral (select e.actor, e.at from public.rfi_events e
                          where e.rfi_id = v.rfi_id and e.kind = 'forwarded' and e.step = v.pos and e.at >= s.sent_at
                          order by e.id desc limit 1) f on true
    union all
    select s.id, s.n + 1, 'issue',
           case when s.issued_by is null then 'PM / PE'
                else coalesce((select public.rfi_role_label(pm.role) from public.project_members pm
                                where pm.project_id = s.project_id and pm.user_id = s.issued_by and pm.status <> 'revoked'
                                order by pm.created_at limit 1),
                              public.rfi_person_name(s.issued_by)) end,
           s.issued_by, null, s.issued_at
      from sized s
    union all
    select s.id, s.n + 2, 'answer', 'Architect', s.answered_by, null, s.answered_at
      from sized s
    union all
    select s.id, s.n + 3, 'answered', case when s.status = 'closed' then 'Closed' else 'Answered' end, null, null, null
      from sized s
  ),
  timed as (
    select t.*, s.status, s.tz, s.due_at,
           case when t.pos = 0 then s.began
                else lag(t.left_at) over (partition by t.rfi_id order by t.pos) end as entered,
           case s.status
             when 'void' then case when t.pos < s.step then 'done' else 'next' end
             else case when t.pos < c.cur then 'done' when t.pos = c.cur then 'current' else 'next' end
           end as state
      from steps t
      join sized s on s.id = t.rfi_id
      cross join lateral (select case s.status when 'draft' then 0 when 'review' then s.step when 'issue' then s.n + 1
                                                when 'open' then s.n + 2 else s.n + 4 end as cur) c
  )
  select x.rfi_id, x.pos, x.kind, x.label,
         case when x.state = 'done' and x.done_by is not null then public.rfi_person_name(x.done_by)
              when x.state = 'current' and x.kind = 'ask' then public.rfi_person_name(x.done_by)
              when x.state = 'current' and x.named is not null then public.rfi_person_name(x.named) end,
         x.state,
         case when x.state <> 'next' then x.entered end,
         case when x.state = 'done' and x.kind <> 'answered' then x.left_at end,
         case when x.state = 'next' or x.kind = 'answered' or x.entered is null then null
              when x.state = 'done' and x.left_at is null then null
              when coalesce(x.left_at, now()) - x.entered < interval '1 day' then 0
              else greatest(1, (coalesce(x.left_at, now()) at time zone x.tz)::date - (x.entered at time zone x.tz)::date)
         end,
         x.due_at
    from timed x
   order by x.rfi_id, x.pos;
$$;

revoke execute on function public.rfi_progress(uuid) from public, anon;
grant execute on function public.rfi_progress(uuid) to authenticated, service_role;
