# OFS review, step by step

A fire / life safety RFI or submittal, from the design team's answer to the fire marshal's Approved or Not approved
(migration 0106). One action per step. Each step says who does it, the tap in the app, and the call behind it, and
what must be true after. A script or the smallest model can run it in order without judgment, except the step marked
**JUDGMENT**.

Every call runs as a signed-in user (a Supabase session JWT). RPCs are `POST /rest/v1/rpc/<name>` with a JSON body.
A write that takes `p_version` takes the item's `version` from the answer of the step before; a stale version answers
`40001`: read the item again (`ofs_item_state`) and repeat. Nothing here sends email.

## Who

| Role in the steps | Holds |
| --- | --- |
| Designated person | the job's OFS requests duty (People > Duties), or the inspector (`ir.decide`): `ir_ofs_sender` |
| Marker | the RFI's originator or `rfi.sign_issue` (an RFI), the file's uploader, a writer of its folder or `files.manage` (a file), or the designated person |
| Fire marshal | `ofs.review` (role `ahj`) |
| Manager | `project.manage` (Settings > Job) |

The job must take OFS requests (Settings > Job > Inspections > OFS requests on). Without it nothing can be marked.

## Once per job (optional)

1. **Manager: the fire list.** Settings > Job > Inspections > Fire / life safety sections. Type divisions or sections,
   comma separated (`21, 28, 078100`), or leave it empty for the standard list (21, 28, 078100, 078123, 078400,
   078413, 078443). Saved on leaving the box as `projects.settings.ofs_fire_sections` (empty = null). A new RFI whose
   Reference (else its title) names a section on the list, and a file uploaded in Files with such a section, are marked
   fire / life safety by themselves.

## Steps: a submittal or an RFI document the design team already answered

1. **Designated person: open the job.** Pick the job: its Board is the start page, with Request inspection, Upload
   submittal and Upload RFI on top.
2. **Designated person: upload.** Tap **Upload submittal** (a returned, stamped submittal) or **Upload RFI** (an RFI
   PDF already answered, e.g. from Procore), pick the PDFs (or drop them on the box). A submittal whose name has no spec
   section and whose first pages name none is asked for one (6 digits) before it goes up.
   Behind it: the one uploader (`data/upload`) into Submittals or RFIs' Uploaded folder, then
   `rpc/file_spec_sections_fill`, `rpc/ofs_suggest` `{ "p_file_ids": ["<file>"] }`, and
   `rpc/ofs_mark` `{ "p_file_id": "<file>", "p_on": true, "p_version": 0 }`.
   After: an `ofs_items` row with `marked = true`; the file is in **Waiting on OFS** and in the fire marshal's
   **For review**.
3. Go to step 6.

## Steps: an RFI of the RFI tool

4. **Marker: mark it.** Open the RFI (RFIs > the RFI). Tap **Fire / life safety** (on). Skip when it already shows on
   (the fire list marked it). Call: `rpc/ofs_mark` `{ "p_rfi_id": "<rfi>", "p_on": true, "p_version": <version or 0> }`.
5. **Architect: answer it** (the RFI's own flow). It reaches the fire marshal when it is answered (or closed), not
   before.

## The decision

6. **Fire marshal: open For review.** On All my jobs the first box is **For review (n)**; a row opens the item. Or the
   job's rail: **For review**. Groups: Waiting (Submittals by spec section, RFIs by number), Done (Approved, Not
   approved). Call: `rpc/ofs_review_list` `{ "p_project_id": "<job>" }` (no job: all my jobs); `decision` null = waiting.
7. **JUDGMENT: read the document.** The row opens the document in the viewer beside the list, with the design team's
   answer or stamp on it.
8. **Fire marshal: decide.** Optional **Comment**, then tap **Approve** or **Not approved** (one tap records it).
   Call: `rpc/ofs_decide`
   `{ "p_item_id": "<item id>", "p_version": <item version>, "p_decision": "approved" | "not_approved", "p_comment": "<optional>", "p_key": "<a new uuid per tap>" }`.
   The same `p_key` again answers the same decision (safe to retry). After: the item shows **OFS: Approved** (green) or
   **OFS: Not approved** (red) with the comment, who and when, everywhere it opens; who marked it and the duty holder
   get a board line (`ofs.approved` / `ofs.not_approved`); the item moves to Done.
9. **Designated person: see it back.** The job's start page: **Back from OFS** > Approved or Not approved (OFS
   inspection requests show there too: Passed, Failed). A row opens the file or RFI with the decision box. Call:
   `rpc/ofs_desk` `{ "p_project_id": "<job>" }` (`null` for anyone who is not the designated person).

## Changing the outcome

- A later decision (step 8 again, a new key) supersedes the earlier one; the earlier one stays under **Earlier**. A
  decision is never edited or removed.
- Before any decision, the mark can be turned off (tap **Fire / life safety** again, Undo in the toast). After a
  decision the mark stays.
