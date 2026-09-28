-- 0033 CSI MasterFormat reference library (SPEC §11.2) and the spec sections a bid package covers.
--
-- The estimator's own CSI master list (~7,500 rows mapped to packages) arrives later as org data from his workbook.
-- Until then every job gets the same reference: all 50 MasterFormat divisions (with the reserved ones marked) and a
-- curated set of the Level 2 and Level 3 sections a general contractor bids. MasterFormat is CSI/CSC's copyrighted
-- work: this is the division list plus a common subset (254 sections), never the complete list.
--
-- Divisions and Level 2 titles follow the 2018 and 2020 editions; Level 3 rows are confirmed in CSI's 2016 list
-- (Divisions 01-08) or its 2011 list, and from Division 08 on in ARCAT's CSI 2020 listings. Every row was checked,
-- number and title verbatim, against the sources below; rows that could not be confirmed were left out:
--   [C18] CSI, "MasterFormat 2018 Edition, Master List of Numbers and Titles for the Construction Industry":
--         the division list (reserved divisions included) and the Level 2 list for Divisions 01-07.
--         https://cscheduling.b-cdn.net/free%20downloads/CSI%20Master%20Format%20DIVISIONS%20&%20TITLES%20-%202018%20EDITION.pdf
--   [C20] CSI, "MasterFormat 2020 Edition" (division titles). https://ebooks.csiresources.org/1e7bnm9/
--   [C16] CSI, "MasterFormat Numbers & Titles, April 2016" (Levels 2-3, Divisions 00 to 08 30).
--         https://constructionnotebook.com/wp-content/uploads/2016/06/MasterFormat_2016_NumbersTitles.pdf
--   [C11] CSI, "MasterFormat Numbers & Titles, March 29, 2011" (Levels 2-3, 08 31 through 09 25), each row also
--         matched in [AR] except 08 62 00 and 08 83 00.
--         https://www.nyc.gov/html/oec/downloads/pdf/green_building/MasterFormat%202011%20Numbers%20and%20Titles.pdf
--   [AR]  ARCAT, "Building Product & Material CSI 2020 MasterFormat Divisions" section pages and division spec
--         lists (https://www.arcat.com/content-type/product/..., https://www.arcat.com/content-type/spec/...),
--         used for Divisions 08-33.
--   [SP]  26 24 16 only: two published spec sections under that number and title (Duke Facilities
--         "26 24 16 Panelboards"; VA "Section 26 24 16 Panelboards") plus [AR]'s 26 24 16.16 child.
--   [CS]  33 05 00 also: Construction Specifier, "Exploring the utility of the new Division 33" (2016 revisions).
-- Division 33 was reorganized in 2016; only its sections whose current title every source agrees on are seeded.
-- MasterFormat 2026 has since been announced (major changes in Divisions 32 and 34); specs in circulation use the
-- 2016-2020 numbers, so those are the reference until the estimator's own list is imported.
--
-- Access: reference data, readable by anyone signed in, written only by migrations (never by a user or the API);
-- anon holds nothing.
--
-- bid_packages.spec_sections: the section numbers in the package's scope. Each must LOOK like a MasterFormat number
-- ('NN NN NN', or Level 4 'NN NN NN.NN'), but need not exist in csi_sections: the reference is a subset, project
-- manuals cite sections outside it, and the org's own list (SPEC §11.2) will add numbers this table never holds.
-- The database keeps the list duplicate-free and in number order. Who may change it is exactly who may edit the
-- package: 0011's "bid_packages: managers write/update" policies (bids.manage) on the insert/update grant.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.csi_divisions (
  number text primary key check (number ~ '^[0-9]{2}$'),
  title text not null check (length(title) between 1 and 200),
  reserved boolean not null default false
);
alter table public.csi_divisions enable row level security;

create table public.csi_sections (
  number text primary key check (number ~ '^[0-9]{2} [0-9]{2} [0-9]{2}$' and substr(number, 4, 2) <> '00'),
  division text not null references public.csi_divisions(number),
  level smallint not null check (level in (2, 3)),
  title text not null check (length(title) between 1 and 200),
  -- The first pair is the division; a last pair of 00 is Level 2, anything else Level 3.
  check (division = left(number, 2)),
  check (level = case when right(number, 2) = '00' then 2 else 3 end)
);
alter table public.csi_sections enable row level security;
create index csi_sections_division on public.csi_sections (division);

create policy "csi_divisions: signed-in read" on public.csi_divisions for select to authenticated
  using (auth.uid() is not null);
create policy "csi_sections: signed-in read" on public.csi_sections for select to authenticated
  using (auth.uid() is not null);

revoke all on public.csi_divisions, public.csi_sections from public, anon, authenticated, service_role;
grant select on public.csi_divisions, public.csi_sections to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Divisions [C18] [C20]
-- ---------------------------------------------------------------------------
insert into public.csi_divisions (number, title, reserved) values
  ('00', 'Procurement and Contracting Requirements', false),
  ('01', 'General Requirements', false),
  ('02', 'Existing Conditions', false),
  ('03', 'Concrete', false),
  ('04', 'Masonry', false),
  ('05', 'Metals', false),
  ('06', 'Wood, Plastics, and Composites', false),
  ('07', 'Thermal and Moisture Protection', false),
  ('08', 'Openings', false),
  ('09', 'Finishes', false),
  ('10', 'Specialties', false),
  ('11', 'Equipment', false),
  ('12', 'Furnishings', false),
  ('13', 'Special Construction', false),
  ('14', 'Conveying Equipment', false),
  ('15', 'Reserved for Future Expansion', true),
  ('16', 'Reserved for Future Expansion', true),
  ('17', 'Reserved for Future Expansion', true),
  ('18', 'Reserved for Future Expansion', true),
  ('19', 'Reserved for Future Expansion', true),
  ('20', 'Reserved for Future Expansion', true),
  ('21', 'Fire Suppression', false),
  ('22', 'Plumbing', false),
  ('23', 'Heating, Ventilating, and Air Conditioning (HVAC)', false),
  ('24', 'Reserved for Future Expansion', true),
  ('25', 'Integrated Automation', false),
  ('26', 'Electrical', false),
  ('27', 'Communications', false),
  ('28', 'Electronic Safety and Security', false),
  ('29', 'Reserved for Future Expansion', true),
  ('30', 'Reserved for Future Expansion', true),
  ('31', 'Earthwork', false),
  ('32', 'Exterior Improvements', false),
  ('33', 'Utilities', false),
  ('34', 'Transportation', false),
  ('35', 'Waterway and Marine Construction', false),
  ('36', 'Reserved for Future Expansion', true),
  ('37', 'Reserved for Future Expansion', true),
  ('38', 'Reserved for Future Expansion', true),
  ('39', 'Reserved for Future Expansion', true),
  ('40', 'Process Interconnections', false),
  ('41', 'Material Processing and Handling Equipment', false),
  ('42', 'Process Heating, Cooling, and Drying Equipment', false),
  ('43', 'Process Gas and Liquid Handling, Purification, and Storage Equipment', false),
  ('44', 'Pollution and Waste Control Equipment', false),
  ('45', 'Industry-Specific Manufacturing Equipment', false),
  ('46', 'Water and Wastewater Equipment', false),
  ('47', 'Reserved for Future Expansion', true),
  ('48', 'Electrical Power Generation', false),
  ('49', 'Reserved for Future Expansion', true);

-- ---------------------------------------------------------------------------
-- Sections (division and level follow from the number)
-- ---------------------------------------------------------------------------
insert into public.csi_sections (number, division, level, title)
select v.number, left(v.number, 2), case when right(v.number, 2) = '00' then 2 else 3 end, v.title
from (values
  -- 01 General Requirements [C16] (Level 2 also [C18])
  ('01 10 00', 'Summary'),
  ('01 11 00', 'Summary of Work'),
  ('01 20 00', 'Price and Payment Procedures'),
  ('01 21 00', 'Allowances'),
  ('01 22 00', 'Unit Prices'),
  ('01 23 00', 'Alternates'),
  ('01 25 00', 'Substitution Procedures'),
  ('01 26 00', 'Contract Modification Procedures'),
  ('01 29 00', 'Payment Procedures'),
  ('01 31 00', 'Project Management and Coordination'),
  ('01 32 00', 'Construction Progress Documentation'),
  ('01 32 16', 'Construction Progress Schedule'),
  ('01 33 00', 'Submittal Procedures'),
  ('01 41 00', 'Regulatory Requirements'),
  ('01 45 00', 'Quality Control'),
  ('01 45 23', 'Testing and Inspecting Services'),
  ('01 50 00', 'Temporary Facilities and Controls'),
  ('01 51 00', 'Temporary Utilities'),
  ('01 52 00', 'Construction Facilities'),
  ('01 54 00', 'Construction Aids'),
  ('01 56 00', 'Temporary Barriers and Enclosures'),
  ('01 57 00', 'Temporary Controls'),
  ('01 57 13', 'Temporary Erosion and Sediment Control'),
  ('01 60 00', 'Product Requirements'),
  ('01 71 23', 'Field Engineering'),
  ('01 73 29', 'Cutting and Patching'),
  ('01 74 00', 'Cleaning and Waste Management'),
  ('01 74 19', 'Construction Waste Management and Disposal'),
  ('01 77 00', 'Closeout Procedures'),
  ('01 78 00', 'Closeout Submittals'),
  ('01 78 23', 'Operation and Maintenance Data'),
  ('01 78 36', 'Warranties'),
  ('01 78 39', 'Project Record Documents'),
  ('01 79 00', 'Demonstration and Training'),
  ('01 91 00', 'Commissioning'),
  -- 02 Existing Conditions [C16] [C18]
  ('02 21 00', 'Surveys'),
  ('02 41 00', 'Demolition'),
  ('02 41 13', 'Selective Site Demolition'),
  ('02 41 16', 'Structure Demolition'),
  ('02 41 19', 'Selective Demolition'),
  ('02 82 00', 'Asbestos Remediation'),
  ('02 83 00', 'Lead Remediation'),
  -- 03 Concrete [C16] [C18]
  ('03 10 00', 'Concrete Forming and Accessories'),
  ('03 11 00', 'Concrete Forming'),
  ('03 20 00', 'Concrete Reinforcing'),
  ('03 21 00', 'Reinforcement Bars'),
  ('03 30 00', 'Cast-in-Place Concrete'),
  ('03 35 00', 'Concrete Finishing'),
  ('03 35 43', 'Polished Concrete Finishing'),
  ('03 40 00', 'Precast Concrete'),
  ('03 45 00', 'Precast Architectural Concrete'),
  ('03 60 00', 'Grouting'),
  ('03 81 00', 'Concrete Cutting'),
  -- 04 Masonry [C16] [C18]
  ('04 20 00', 'Unit Masonry'),
  ('04 21 00', 'Clay Unit Masonry'),
  ('04 22 00', 'Concrete Unit Masonry'),
  ('04 42 00', 'Exterior Stone Cladding'),
  ('04 72 00', 'Cast Stone Masonry'),
  -- 05 Metals [C16] [C18]
  ('05 05 19', 'Post-Installed Concrete Anchors'),
  ('05 12 00', 'Structural Steel Framing'),
  ('05 31 00', 'Steel Decking'),
  ('05 40 00', 'Cold-Formed Metal Framing'),
  ('05 41 00', 'Structural Metal Stud Framing'),
  ('05 50 00', 'Metal Fabrications'),
  ('05 51 00', 'Metal Stairs'),
  ('05 52 00', 'Metal Railings'),
  ('05 73 00', 'Decorative Metal Railings'),
  -- 06 Wood, Plastics, and Composites [C16] [C18]
  ('06 10 00', 'Rough Carpentry'),
  ('06 11 00', 'Wood Framing'),
  ('06 16 00', 'Sheathing'),
  ('06 17 53', 'Shop-Fabricated Wood Trusses'),
  ('06 20 23', 'Interior Finish Carpentry'),
  ('06 22 00', 'Millwork'),
  ('06 41 00', 'Architectural Wood Casework'),
  ('06 41 13', 'Wood-Veneer-Faced Architectural Cabinets'),
  ('06 41 16', 'Plastic-Laminate-Clad Architectural Cabinets'),
  ('06 61 00', 'Cast Polymer Fabrications'),
  ('06 61 16', 'Solid Surfacing Fabrications'),
  -- 07 Thermal and Moisture Protection [C16] (Level 2 to 07 13 also [C18])
  ('07 13 00', 'Sheet Waterproofing'),
  ('07 14 00', 'Fluid-Applied Waterproofing'),
  ('07 21 00', 'Thermal Insulation'),
  ('07 21 16', 'Blanket Insulation'),
  ('07 22 00', 'Roof and Deck Insulation'),
  ('07 24 00', 'Exterior Insulation and Finish Systems'),
  ('07 25 00', 'Weather Barriers'),
  ('07 26 00', 'Vapor Retarders'),
  ('07 27 00', 'Air Barriers'),
  ('07 31 13', 'Asphalt Shingles'),
  ('07 42 13', 'Metal Wall Panels'),
  ('07 46 00', 'Siding'),
  ('07 50 00', 'Membrane Roofing'),
  ('07 52 00', 'Modified Bituminous Membrane Roofing'),
  ('07 54 00', 'Thermoplastic Membrane Roofing'),
  ('07 54 23', 'Thermoplastic-Polyolefin Roofing'),
  ('07 60 00', 'Flashing and Sheet Metal'),
  ('07 62 00', 'Sheet Metal Flashing and Trim'),
  ('07 65 00', 'Flexible Flashing'),
  ('07 71 00', 'Roof Specialties'),
  ('07 72 33', 'Roof Hatches'),
  ('07 81 00', 'Applied Fireproofing'),
  ('07 84 00', 'Firestopping'),
  ('07 84 13', 'Penetration Firestopping'),
  ('07 84 43', 'Joint Firestopping'),
  ('07 92 00', 'Joint Sealants'),
  -- 08 Openings [C16] to 08 30, [C11] from 08 31, [AR]
  ('08 11 00', 'Metal Doors and Frames'),
  ('08 11 13', 'Hollow Metal Doors and Frames'),
  ('08 14 00', 'Wood Doors'),
  ('08 14 16', 'Flush Wood Doors'),
  ('08 31 00', 'Access Doors and Panels'),
  ('08 33 00', 'Coiling Doors and Grilles'),
  ('08 33 23', 'Overhead Coiling Doors'),
  ('08 36 13', 'Sectional Doors'),
  ('08 41 00', 'Entrances and Storefronts'),
  ('08 41 13', 'Aluminum-Framed Entrances and Storefronts'),
  ('08 42 29', 'Automatic Entrances'),
  ('08 44 13', 'Glazed Aluminum Curtain Walls'),
  ('08 51 13', 'Aluminum Windows'),
  ('08 62 00', 'Unit Skylights'),
  ('08 62 23', 'Tubular Skylights'),
  ('08 71 00', 'Door Hardware'),
  ('08 71 13', 'Automatic Door Operators'),
  ('08 81 00', 'Glass Glazing'),
  ('08 83 00', 'Mirrors'),
  ('08 91 00', 'Louvers'),
  -- 09 Finishes [C11] to 09 24, [AR]
  ('09 21 16', 'Gypsum Board Assemblies'),
  ('09 22 16', 'Non-Structural Metal Framing'),
  ('09 22 36', 'Lath'),
  ('09 24 00', 'Cement Plastering'),
  ('09 24 23', 'Cement Stucco'),
  ('09 29 00', 'Gypsum Board'),
  ('09 30 00', 'Tiling'),
  ('09 30 13', 'Ceramic Tiling'),
  ('09 51 00', 'Acoustical Ceilings'),
  ('09 51 13', 'Acoustical Panel Ceilings'),
  ('09 53 00', 'Acoustical Ceiling Suspension Assemblies'),
  ('09 64 00', 'Wood Flooring'),
  ('09 65 00', 'Resilient Flooring'),
  ('09 65 13', 'Resilient Base and Accessories'),
  ('09 65 16', 'Resilient Sheet Flooring'),
  ('09 65 19', 'Resilient Tile Flooring'),
  ('09 67 23', 'Resinous Flooring'),
  ('09 68 00', 'Carpeting'),
  ('09 68 13', 'Tile Carpeting'),
  ('09 68 16', 'Sheet Carpeting'),
  ('09 72 00', 'Wall Coverings'),
  ('09 90 00', 'Painting and Coating'),
  ('09 91 00', 'Painting'),
  ('09 91 13', 'Exterior Painting'),
  ('09 91 23', 'Interior Painting'),
  ('09 96 00', 'High-Performance Coatings'),
  -- 10 Specialties [AR]
  ('10 11 00', 'Visual Display Units'),
  ('10 14 00', 'Signage'),
  ('10 14 23', 'Panel Signage'),
  ('10 21 00', 'Compartments and Cubicles'),
  ('10 21 13', 'Toilet Compartments'),
  ('10 26 00', 'Wall and Door Protection'),
  ('10 28 00', 'Toilet, Bath, and Laundry Accessories'),
  ('10 28 13', 'Toilet Accessories'),
  ('10 44 13', 'Fire Protection Cabinets'),
  ('10 44 16', 'Fire Extinguishers'),
  ('10 51 00', 'Lockers'),
  ('10 51 13', 'Metal Lockers'),
  ('10 73 16', 'Canopies'),
  -- 11 Equipment [AR]
  ('11 31 00', 'Residential Appliances'),
  ('11 40 00', 'Foodservice Equipment'),
  ('11 52 00', 'Audio-Visual Equipment'),
  ('11 68 00', 'Play Field Equipment and Structures'),
  -- 12 Furnishings [AR]
  ('12 20 00', 'Window Treatments'),
  ('12 24 00', 'Window Shades'),
  ('12 24 13', 'Roller Window Shades'),
  ('12 32 00', 'Manufactured Wood Casework'),
  ('12 35 00', 'Specialty Casework'),
  ('12 36 00', 'Countertops'),
  ('12 48 13', 'Entrance Floor Mats and Frames'),
  -- 13 Special Construction [AR]
  ('13 34 19', 'Metal Building Systems'),
  -- 14 Conveying Equipment [AR]
  ('14 20 00', 'Elevators'),
  ('14 24 00', 'Hydraulic Elevators'),
  ('14 42 00', 'Wheelchair Lifts'),
  -- 21 Fire Suppression [AR]
  ('21 05 00', 'Common Work Results for Fire Suppression'),
  ('21 11 00', 'Facility Fire-Suppression Water-Service Piping'),
  ('21 12 00', 'Fire-Suppression Standpipes'),
  ('21 13 00', 'Fire-Suppression Sprinkler Systems'),
  ('21 13 13', 'Wet-Pipe Sprinkler Systems'),
  ('21 30 00', 'Fire Pumps'),
  -- 22 Plumbing [AR]
  ('22 05 00', 'Common Work Results for Plumbing'),
  ('22 07 00', 'Plumbing Insulation'),
  ('22 11 16', 'Domestic Water Piping'),
  ('22 11 19', 'Domestic Water Piping Specialties'),
  ('22 13 16', 'Sanitary Waste and Vent Piping'),
  ('22 13 19', 'Sanitary Waste Piping Specialties'),
  ('22 14 00', 'Facility Storm Drainage'),
  ('22 34 00', 'Fuel-Fired Domestic Water Heaters'),
  ('22 40 00', 'Plumbing Fixtures'),
  ('22 42 00', 'Commercial Plumbing Fixtures'),
  ('22 47 00', 'Drinking Fountains and Water Coolers'),
  -- 23 HVAC [AR]
  ('23 05 00', 'Common Work Results for HVAC'),
  ('23 05 93', 'Testing, Adjusting, and Balancing for HVAC'),
  ('23 07 00', 'HVAC Insulation'),
  ('23 09 00', 'Instrumentation and Control for HVAC'),
  ('23 23 00', 'Refrigerant Piping'),
  ('23 31 00', 'HVAC Ducts and Casings'),
  ('23 31 13', 'Metal Ducts'),
  ('23 33 00', 'Air Duct Accessories'),
  ('23 34 00', 'HVAC Fans'),
  ('23 37 13', 'Diffusers, Registers, and Grilles'),
  ('23 81 00', 'Decentralized Unitary HVAC Equipment'),
  ('23 81 26', 'Split-System Air-Conditioners'),
  ('23 81 29', 'Variable Refrigerant Flow HVAC Systems'),
  -- 26 Electrical [AR] (26 24 16 [SP])
  ('26 05 00', 'Common Work Results for Electrical'),
  ('26 05 19', 'Low-Voltage Electrical Power Conductors and Cables'),
  ('26 05 26', 'Grounding and Bonding for Electrical Systems'),
  ('26 05 33', 'Raceway and Boxes for Electrical Systems'),
  ('26 05 53', 'Identification for Electrical Systems'),
  ('26 09 23', 'Lighting Control Devices'),
  ('26 24 16', 'Panelboards'),
  ('26 27 26', 'Wiring Devices'),
  ('26 28 00', 'Low-Voltage Circuit Protective Devices'),
  ('26 51 00', 'Interior Lighting'),
  ('26 56 00', 'Exterior Lighting'),
  -- 27 Communications [AR]
  ('27 05 00', 'Common Work Results for Communications'),
  ('27 10 00', 'Structured Cabling'),
  ('27 13 00', 'Communications Backbone Cabling'),
  ('27 15 00', 'Communications Horizontal Cabling'),
  -- 28 Electronic Safety and Security [AR]
  ('28 10 00', 'Access Control'),
  ('28 46 00', 'Fire Detection and Alarm'),
  -- 31 Earthwork [AR]
  ('31 10 00', 'Site Clearing'),
  ('31 20 00', 'Earth Moving'),
  ('31 23 00', 'Excavation and Fill'),
  ('31 23 19', 'Dewatering'),
  ('31 23 33', 'Trenching and Backfilling'),
  ('31 25 00', 'Erosion and Sedimentation Controls'),
  ('31 32 00', 'Soil Stabilization'),
  ('31 50 00', 'Excavation Support and Protection'),
  ('31 63 00', 'Bored Piles'),
  -- 32 Exterior Improvements [AR]
  ('32 11 00', 'Base Courses'),
  ('32 12 00', 'Flexible Paving'),
  ('32 12 16', 'Asphalt Paving'),
  ('32 13 13', 'Concrete Paving'),
  ('32 14 00', 'Unit Paving'),
  ('32 16 00', 'Curbs, Gutters, Sidewalks, and Driveways'),
  ('32 17 23', 'Pavement Markings'),
  ('32 18 00', 'Athletic and Recreational Surfacing'),
  ('32 31 13', 'Chain Link Fences and Gates'),
  ('32 31 19', 'Decorative Metal Fences and Gates'),
  ('32 32 00', 'Retaining Walls'),
  ('32 33 00', 'Site Furnishings'),
  ('32 33 13', 'Site Bicycle Racks'),
  ('32 80 00', 'Irrigation'),
  ('32 90 00', 'Planting'),
  ('32 92 00', 'Turf and Grasses'),
  ('32 93 00', 'Plants'),
  -- 33 Utilities [AR] (33 05 00 also [CS])
  ('33 05 00', 'Common Work Results for Utilities'),
  ('33 10 00', 'Water Utilities'),
  ('33 70 00', 'Electrical Utilities')
) as v (number, title);

-- ---------------------------------------------------------------------------
-- The sections a package covers
-- ---------------------------------------------------------------------------
alter table public.bid_packages add column spec_sections text[] not null default '{}'
  constraint bid_packages_spec_sections_format check (
    coalesce(array_ndims(spec_sections), 1) = 1
    and cardinality(spec_sections) <= 200
    and array_position(spec_sections, null) is null
    -- Joined with commas it reads as a list of numbers, and splitting it back gives as many entries as the array
    -- holds, so every entry is exactly one number.
    and array_to_string(spec_sections, ',')
        ~ '^([0-9]{2} [0-9]{2} [0-9]{2}(\.[0-9]{2})?(,[0-9]{2} [0-9]{2} [0-9]{2}(\.[0-9]{2})?)*)?$'
    and cardinality(string_to_array(array_to_string(spec_sections, ','), ',')) = cardinality(spec_sections)
  );

-- One list in number order, each number once, whatever the client sent.
create or replace function public.tg_bid_package_sections()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.spec_sections := array(select distinct s from unnest(new.spec_sections) as u (s) order by 1);
  return new;
end;
$$;
revoke execute on function public.tg_bid_package_sections() from public, anon, authenticated;
create trigger spec_sections_tidy before insert or update of spec_sections on public.bid_packages
  for each row execute function public.tg_bid_package_sections();

-- 0011 grants insert/update on the whole table to authenticated, and its policies limit both to bids.manage. Named
-- here so the column stays editable if those grants ever narrow to columns.
grant insert (spec_sections), update (spec_sections) on public.bid_packages to authenticated;
