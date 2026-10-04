-- 0068 "OFS inspection reports" is the server's folder name, like "Inspection reports".
--
-- 0061 gave the fire marshal's IRs and maps their own folder under Reports, made on first use (ir_folder_make). The name
-- was never reserved, so someone who may add folders under Reports could have made a folder of that name first, with
-- his own access rows, and ir_folder_make would have filed the fire marshal's documents into it. The name is now the
-- server's alone. (Same list as 0062 otherwise; create or replace keeps the grants.)
create or replace function public.folder_name_reserved(p_project_id uuid, p_parent_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_parent_id is null then btrim(p_name) in ('Bids received', 'Inspection requests', 'Delivery tickets', 'Emailed in',
                                                     'Bid forms', 'RFIs', 'Approved plans', 'Safety', 'Schedule')
    else btrim(p_name) = any (case (select kind from public.folders where id = p_parent_id and project_id = p_project_id)
                                when 'reports' then array['Inspection reports', 'OFS inspection reports']
                                when 'photos' then array['Corrections'] end)
  end;
$$;
