-- 0084 The special inspection kinds are My Daily Reports' own (Jesse, Oct 5: "you made up some terms. Go find what I
-- did and make sure it matches"). 0024 seeded an invented list (Reinforcing steel, Post-tensioning ...). MDR's request
-- form (public/request.html) offers, in this order: Welding, Bolting, Concrete, Masonry, Grout, Epoxy, Soils,
-- Material ID, Material ID CWI, UT/MP, Pull Test, Post Inst. Anchor, Fireproofing, Shotcrete, Rebar ID.
--
--   * Those fifteen are the active kinds, sorted in that order (names already there keep their id).
--   * Every other kind goes inactive, never deleted: a request already filed keeps its kind and its name. The forms
--     (ir_form_context, the no-login link) list active kinds only, and a new request must pick an active one.
insert into public.ir_special_kinds (name, sort, active) values
  ('Welding', 10, true), ('Bolting', 20, true), ('Concrete', 30, true), ('Masonry', 40, true), ('Grout', 50, true),
  ('Epoxy', 60, true), ('Soils', 70, true), ('Material ID', 80, true), ('Material ID CWI', 90, true),
  ('UT/MP', 100, true), ('Pull Test', 110, true), ('Post Inst. Anchor', 120, true), ('Fireproofing', 130, true),
  ('Shotcrete', 140, true), ('Rebar ID', 150, true)
on conflict (name) do update set sort = excluded.sort, active = true;

update public.ir_special_kinds
   set active = false
 where active
   and name not in ('Welding', 'Bolting', 'Concrete', 'Masonry', 'Grout', 'Epoxy', 'Soils', 'Material ID',
                    'Material ID CWI', 'UT/MP', 'Pull Test', 'Post Inst. Anchor', 'Fireproofing', 'Shotcrete',
                    'Rebar ID');
