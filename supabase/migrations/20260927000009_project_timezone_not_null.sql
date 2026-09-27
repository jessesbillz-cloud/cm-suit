-- 0009 projects.timezone stays NOT NULL. Inserts may omit it (default ''), and the before-insert trigger from 0008
-- fills it from the creator's profile before the check constraint runs.
alter table public.projects alter column timezone set default '';
update public.projects set timezone = 'America/Los_Angeles' where timezone is null;
alter table public.projects alter column timezone set not null;
