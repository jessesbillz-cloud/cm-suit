# OFS job setup: from a permitted plan set to a working "OFS required"

The repeatable setup of a fire marshal (OFS) job's rated walls, rooms, revs and history, as done for Hunter Hall
(Oct 3–8, 2026). This is the per-job setup service: every step is either in the app, an RPC, or a script in
`scripts/ofs-setup/`. Claude runs it with the `ofs-job-setup` skill; a person can follow it by hand.

**Never put a job's files or data in the repo** (CLAUDE.md rule 8). Work on copies in `scratch/` or outside the repo.

## What the customer gives us
| Input | Example (Hunter Hall) | Used in step |
|---|---|---|
| The OFS-stamped permit plan set (one big PDF) | `25-5343_DWGS_V1_AP.pdf`, 462 pages | 2 |
| The OSFM rev legend (the revs and their items) | TOW, HOW Cavity, CJ, Drywall, In-Wall, In-Wall Final, HOW Surface, Final | 3 |
| The fire marshal's checklist | Brock's OFS Fire and Life Safety Inspection Checklist (14 sections, 122 items) | 3 |
| The rated walls (plan review, or the highlighted sheets) | 48 walls: tag, rating, UL design, fire area, sheet, check note | 4 |
| Past OFS IRs, if the job is under way | IR0244–IR0377 folders (VIS form, IR map, request) | 6, 8 |
| Job facts and people | name, number, address, the GC, subs, the fire marshal | 1 |

## Steps

### 1. The job and its people (app)
New job (address geocoded once, weather from it). People > Invite: each person with their company and role
(inspector, GC, subs, fire marshal as `ahj`). People > Duties: who sends OFS requests (`ofs_requests`).
Settings > Job: the OFS attestation wording (Hunter Hall uses the VIS line), the next IR number and the next OFS
number (prefilled from the highest on file).

### 2. The floor plan sheets (shell, then app)
Pull each level's floor plan sheets out of the permit set as one-page PDFs, small enough to open fast on a phone:
1. Find the pages: `pdftotext -f N -l N set.pdf -` and look for `FLOOR PLAN - LEVEL 0x AREA y` and the sheet number
   (`A201A` …). Hunter Hall: pages 65, 66 (L1), 68, 69 (L2), 71, 72 (L3) of the V1 set.
2. Extract: `qpdf set.pdf --pages . 65 -- "A201A Floor Plan Level 01 Area A.pdf"`.
3. Shrink: `gs -q -sDEVICE=pdfwrite -dPDFSETTINGS=/printer -dNOPAUSE -dBATCH -sOutputFile=out.pdf in.pdf`
   (13 MB → under 1 MB). **Check nothing was lost:** `pdftotext in.pdf - | wc -w` equals the same for `out.pdf`, and
   look at a render of the page.
4. Name each file `<sheet number> <title>.pdf` (the sheet number first: walls find their sheet by it).
5. Upload to the job's Plans folder. Each wall whose sheet number matches gets the sheet by itself (0094 trigger), or
   Revs > Setup > Link files (`rev_walls_link_sheets`).

### 3. The rev lists (app)
Revs > Setup > New list:
- **Rated walls:** paste the OSFM legend; each rev and its items, with the company that does each item.
- **Fire & life safety:** the fire marshal's checklist; one rev per section, its items; areas Site, Level 1–3; the
  sections he marks as not this job's marked N/A.

### 4. The walls (app or one load)
Each rated wall: level, a plain name that says where it is ("Main Electrical 0134 north wall"), tag (D6a), rating,
UL design, fire area, sheet number, and a check note. Small jobs: Add walls (paste names) then each wall's details.
Big jobs: one load from a table, run as the job's manager (`rev_areas_add`, then `rev_area_details_save` per wall).
Name walls by plan orientation (plan-up = north) and say so in the job's notes: the contractor may use true north.

### 5. The rooms (one load)
Each room that holds rated walls: level, number, name, kind (room, shaft, exterior), its picture's file name, and its
walls each with its line on the picture (`rev_rooms_load`, idempotent: run it again to fix). A room picture is a crop
of the floor plan sheet around the room, its walls traced on it as fractions of the picture.

### 6. Pictures and past IRs (app)
Revs > Setup > **Add pictures and IRs**: drop the room pictures and the past OFS IR PDFs together. Pictures go to the
app's "Room pictures" folder and link to rooms by name; IRs go to Reports / OFS history and link to sign-offs by the
OFS number in the file name. **Name each IR file with its OFS numbers**, e.g. `OFS_IR_0028 IR0269.pdf`; an IR that
covers several OFS numbers carries each, e.g. `OFS_IR_0041_OFS_0042_OFS_0043_IR0344.pdf` (the rule: `OFS_IR_nnnn`
then a non-digit, or `_OFS_nnnn_`). Nothing is dropped loose into Files.

**One record per OFS number** (Hunter Hall, Oct 8): the VIS result form first, then that number's IR map, joined
without changing either (`qpdf --empty --pages vis.pdf map.pdf -- "OFS_IR_0041 IR0344.pdf"`). The map is the folder's
`OFS_IR_nnnn.pdf` when there is one per number, else the request's `…_Attachment_1.pdf`. When an IR folder has several
VIS forms, pick the one whose text names the number (`pdftotext vis.pdf - | grep "OFS #0041"`). Build them in a
subfolder of the customer's folder (the browser upload only takes files from shared folders). Upload under 10 MB per
batch. Hunter Hall: 25 records, all 92 sign-offs linked.

### 7. Walls on the plan sheets (script, then review)
`scripts/ofs-setup/place_walls.py` finds each room picture on its sheet and turns the traced lines into sheet lines:
```
python3 -I scripts/ofs-setup/place_walls.py --input in.json --debug-dir scratch/place > placed.json
```
`in.json`: the sheets by number (local PDF paths) and the rooms (picture path, sheet number, walls with area id and
line), read from `rev_rooms` / `rev_room_walls`. Look at every image in `--debug-dir` (the red box is where the room
was found, green the walls). Rooms in `weak` (score under 0.45) are drawn by hand in the app (Plan > Draw). Save the
rest with `rev_area_place(id, null, sheet_file_id, 1, geom)` as the manager. Tested: a known crop came back within
0.0001 of the sheet.

What Hunter Hall taught (Oct 8; 46 of 48 walls placed, all checked by eye):
- **A high score is not proof.** A picture shrunk to a speck matches noise at 0.6–1.0. `--min-px 150` (the default)
  stops that. Look at a whole-sheet render with every line drawn before saving.
- **The pictures of one job are cut at one resolution,** so good matches share a scale (Hunter Hall: 0.12–0.24 for
  rooms). Use it: `"scale": [lo, hi]` on a room re-matches a miss at the known scale.
- **A picture that spans two area sheets** (an exterior: Area A above, Area B below, a blank band between) is matched
  in parts: `"crop": [x0, y0, x1, y1]` (split at the blank band). When a part shows more than one area sheet covers,
  match a window around each wall instead.
- A placed sheet that differs from the wall's sheet number goes on the review list (the wall's name may be wrong).
- Walls with no line on their room picture stay for drawing by hand.

### 8. Sign-offs from before the app (skill)
The `ofs-ir-backfill` skill reads each past IR (VIS form for the result and date, the IR map for which walls) and
records each wall × item passed (`rev_signoff_set`), with a short review list: low-confidence matches, failures,
walls highlighted that are not in the list. The person who knows the job decides the doubtful ones.

### 9. Walk it (app)
As each role (View as): the inspector, the GC, a sub (and the no-login QR request), the fire marshal. Check:
Rooms → a room → its walls with their revs; a passed rev opens its IR; Plan shows the level's sheets with the walls
colored; Open lists what is left; Checklist prints. Remove any test data before showing it.

## Before it is done
- Every wall has a sheet and a line on it, or is on the review list.
- Every room has its picture.
- Every past OFS number is on a sign-off with its IR file, or on the review list.
- The review list went to the job's inspector.
