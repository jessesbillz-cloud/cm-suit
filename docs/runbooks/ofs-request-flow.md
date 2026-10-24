# OFS request flow, step by step

From "request an OFS inspection" to "passed in Revs" and the signed OFS IR, as one action per step. Each step names
who does it, the exact call and its inputs, and what must be true after. A script, or the smallest model, can run it
in order without judgment, except the two steps marked **JUDGMENT**: those need a person (or are given as input).

Every call runs as a signed-in user (a Supabase session JWT). RPCs are `POST /rest/v1/rpc/<name>` with a JSON body.
Edge functions are `POST /functions/v1/<name>` with a JSON body. Every write that takes `p_version` takes the request's
`version` from the row the previous step returned; a stale version answers `40001`: read the row again and repeat.
Never compute a number in the client: IR and OFS IR numbers come from the database.

## Who

| Role in the steps | Holds (role_permissions) |
| --- | --- |
| Requester (sub or GC) | `ir.request`, `revs.read` |
| GC (the contractor step) | `ir.gc_approve`: project_admin, pm, superintendent, pe (0116) |
| Inspector (IOR) | `ir.decide` |
| OFS sender | the job's route says (0116): the inspector by default, or the job's OFS requests duty holder after the inspector's Ready |
| Fire marshal (deputy) | `ir.ofs_decide`, `ir.ofs_view` |
| Takes walls off (Not ready) | its requester (`ir.request`), the job's OFS requests duty holder, or `ir.gc_approve`; never the fire marshal (`ir_may_pull_back`) |

## The job's route (0116)

Set in Settings > Job by whoever has `project.manage`, stored in `projects.settings` (defaults in `src/lib/settings.ts`,
a missing key is off):

| Setting | Off (default) | On |
| --- | --- | --- |
| `ir_ofs_gc_off` | the contractor checks a sub's request (step 4) | no contractor step: a new request goes straight to the inspector |
| `ir_ofs_duty_sends` | the inspector sends (step 6, his Send is his Ready, step 5 is refused) | the inspector marks Ready (step 5), the duty holder sends (step 6), while a duty holder is picked |

Every job starts on Jesse's route: Contractor checks > Inspector sends > Fire marshal. `rpc/ir_ofs_chain` answers
`route` (`{ "gc": true, "sender": "inspector" | "duty" }`, the sender as it is now) and `step` (where the request is:
`gc`, `ready`, `si`, `send`, or null once sent). The request page and the batch show the route on one line.

**Whose turn** (`ir_ofs_turn`): at `gc`, the duty holder while he may do the contractor step, else every GC approver;
at `send` on the duty route, the duty holder; else the inspector who has it, else every inspector. Only that person
gets the board line and the Needs you line.

**What posts a board line** about an OFS request (nothing else does, `ir_board_keeps` in `post_activity`):

| Kind | When | To |
| --- | --- | --- |
| `ir.ofs_filed` | filed, or passed to the next person ("checked", "ready to send") | the one whose turn it is now |
| `ir.ofs_sent` | sent to OFS | the fire marshal (`ir.ofs_decide`) and the requester |
| `ir.returned` | the contractor returns it | the requester |
| `ir.results` | the fire marshal sends the results (step 12) | the people he picked |

A batch posts one line per step ("Batch of 9 sent to OFS · Level 01 · Top of wall"). Nothing in the flow sends email
except step 12, which a person presses.

## Inputs to read first (no writes)

1. The job's lists, revs, items and walls: `GET /rest/v1/<table>?project_id=eq.<job>` on `rev_lists`, `revs`,
   `rev_items`, `rev_areas` and `rev_marks`. A room's walls: `rev_room_walls` rows with that `room_id` (`rev_rooms`
   for the room by number).
2. `rpc/rev_status` `{ "p_project_id": <job> }`: every wall x item, `status` one of `open`, `requested`, `failed`,
   `passed`, `na`. Only `open` and `failed` cells can be asked for (a `requested` one already is).
3. `rpc/ir_ofs_attest_text` `{ "p_project_id": <job> }`: the job's attestation wording (shown to the requester).

## Walk and tap: the request being built (0113)

The way the app files OFS requests from Inspection cards (Jesse, Oct 23): the requester walks the job and taps what is
ready, then sends it all at once. It ends in step 2 below, once per request, so steps 3 to 12 follow as usual. Who: the
requester (`ir.request` and `revs.read`, on a job with `ir_ofs_allowed`). Every answer below is the basket:
`{ "version", "cells": [{area_id, item_id}], "groups": [{item_id, area_ids, ofs_number}], "may_number" }`.

B1. **Read the basket.** `rpc/rev_basket_get` `{ "p_project_id": "<job>" }`. `version` 0 and no cells: none yet.
    Cells asked for, passed or switched off since they were added are left out of every answer.

B2. **JUDGMENT: add a wall's items.** `rpc/rev_basket_add`
    `{ "p_project_id": "<job>", "p_area_ids": ["<wall>"], "p_item_ids": ["<item>", ...] }`. Each wall x item that is
    `open` or `failed` in `rev_status` and not in the basket goes in; the rest is skipped (`added` says how many). The
    same call again adds nothing. Repeat per wall.

B3. **JUDGMENT, optional: add an item for a whole room.** `rpc/rev_basket_add`
    `{ "p_project_id": "<job>", "p_area_ids": [], "p_item_ids": ["<item>"], "p_room_id": "<room>" }`. Every wall of
    the room's card (`rev_room_walls`, live) is used, with the same skips.

B4. **Optional: take out.** `rpc/rev_basket_remove` `{ "p_project_id", "p_area_ids": [...], "p_item_ids": [...] }`
    (the Undo of B2 and B3). `removed` says how many.

B5. **Read what Send will file.** B1 again: `groups` is one OFS request per item and plan sheet page (walls with no
    sheet: per level), in rev and item order, each with the OFS number the database would give it (the next ones in
    turn). Keep `version`.

B6. **Send.** `rpc/rev_basket_send`
    ```json
    { "p_project_id": "<job>", "p_version": <version from B5>, "p_company": "<requester's company>",
      "p_request_date": "yyyy-MM-dd", "p_start_time": "HH:mm", "p_duration_kind": "timed", "p_duration_min": 60,
      "p_notice_ack": true, "p_special_required": false }
    ```
    Leave out `p_start_time` for Flexible. The inspector filing it himself adds `"p_inspector_ack": true`. Whoever
    sends OFS requests (`may_number` true) may add `"p_ofs_numbers": [<n>, ...]`, one per group in B5's order, each
    unused on the job. After: one `inspection_requests` row per group, each made by `ir_submit_ofs` exactly as step 2
    (same rules, statements and first status), each with its own OFS number and map; one board line for the batch
    ("Batch of 9 filed", to the one whose turn it is, 0116); the basket is empty; the answer
    is `{ "batch_id", "requests": [{id, number, ofs_number, items, status, version}] }`. A stale `version` answers
    `40001` (read B5 again). The same call again with the same version answers the same batch and files nothing.

B7. **Read a batch.** `rpc/ir_batches` `{ "p_request_ids": ["<request>", ...] }` answers `{request_id, batch_id,
    size}` for the requests the caller reads (size: the batch's requests not withdrawn). The schedule and the start page
    show a batch together ("Batch of 9"). Each request goes on from step 3 on its own.

Each request cell keeps the wall's tag, rating, UL design and sheet number as they were when it was asked for
(`ir_rev_items.wall_facts`, e.g. "F6a · 1 HR · UL U419 · A201", "UL —" when not known), and the request's `items` line
names them after each wall that has any, so the OFS IR prints them.

A wall not on the card yet: `rpc/rev_field_wall_add` `{ "p_list_id", "p_level", "p_room_id" (or null with
"p_room_number" and "p_room_name"), "p_side": "north"|"south"|"east"|"west"|"other", "p_name" (other only),
"p_wall_tag", "p_rating" }` answers `{ area_id, room_id, added }` (the same wall again: `added` false). A tag another
wall of the job has brings its rating, UL design and sheet number. Usable in B2 at once. Added by someone without
`revs.manage`, each manager gets a Needs you task `revs.wall_check` until one calls `rpc/rev_field_confirm`
`{ "p_area_id" }`, saves its details (`rpc/rev_area_details_save`) or removes it (`rpc/rev_remove`).

## Steps

1. **JUDGMENT: what to inspect.** Pick 1 to 3 item ids of one list (OSFM: three colors at most on one map) and 1 to
   200 wall ids of the same list. From a room: every wall of the room. Leave out a wall or item whose cell is
   `passed` or `na` (the database leaves those out anyway). Pick the day: the next working day (Monday to Friday) in
   the job's time zone, at least 24 hours out (48 when a special inspection is required).

2. **Requester submits.** `rpc/ir_submit_ofs`
   ```json
   { "p_project_id": "<job>", "p_company": "<requester's company>", "p_request_date": "yyyy-MM-dd",
     "p_notice_ack": true, "p_area_ids": ["<wall>", ...], "p_item_ids": ["<item>", ...],
     "p_duration_kind": "timed", "p_duration_min": 60, "p_attachment_ids": [],
     "p_special_required": false }
   ```
   Optional: `p_start_time` `"HH:mm"` (left out = Flexible), `p_sheet_file_id` (left out = the first wall's sheet).
   `p_special_required` is the one question, Yes or No, required. A requester who is not the inspector is stating the
   job's attestation wording and the notice by this call (`p_notice_ack: true`): the app shows both in one dialog with
   one I confirm before it calls. The inspector filing it himself adds `"p_inspector_ack": true` (his statement that
   the earlier inspections are complete) and it goes straight to step 6.
   After: one `inspection_requests` row, `kind = 'ofs'`, its `number` and `ofs_number`, `status = 'gc_review'`; one
   `ir_rev_items` row per wall x item still open, colored 1 to 3 in list order; an `ir_maps` row on the sheet. Keep
   `id` and `version`.

3. **Requester (or anyone who may draw it) makes the map.** The walls drawn on the plan are already on the map (0059).
   Optional strokes: `rpc/ir_map_save` `{ "p_request_id", "p_version": <map version>, "p_strokes": [...] }`.
   Then `functions/v1/ir-map` `{ "action": "render", "request_id": "<id>" }`. After: `ir_maps.map_file_id` set.

4. **GC checks it Ready.** `rpc/ir_ofs_check`
   `{ "p_request_id", "p_version", "p_check": "gc", "p_on": true }`. After: `status = 'pending'` (with the inspector),
   and the inspector's board line ("OFS #0097 checked"). A request filed by a GC approver (a PE too, 0116) skips this
   step (the filing is the GC's Ready), and so does every request on a job whose route has no contractor step.

5. **Inspector checks it Ready (the duty route only).** `rpc/ir_ofs_check`
   `{ "p_request_id", "p_version", "p_check": "ready", "p_on": true }`. On the default route the inspector sends it
   himself (step 6) and his send is his Ready: this call answers 22023 "On this job the inspector sends it to OFS."
   When `special_required` is true, also `{ ..., "p_check": "si", "p_on": true, "p_file_id": "<the special inspector's
   report, a file of this job>" }` (on the default route, before he sends, no Ready first).

6. **OFS sender sends it to OFS.** Optional first, the OFS IR number the fire marshal gave:
   `rpc/ir_ofs_number_set` `{ "p_request_id", "p_version", "p_number": <1..999999> }`.
   Then `rpc/ir_send_ofs` `{ "p_request_id", "p_version" }`, by the sender the route names (anyone else: 22023 "On this
   job the inspector sends it to OFS." or "On this job the contractor's OFS person sends it to OFS."). After:
   `ofs_sent_at` set, `status = 'pending'`, one board line to the fire marshal and the requester. Undo until he acts:
   `rpc/ir_unsend_ofs` `{ "p_request_id", "p_version" }`.

7. **Fire marshal answers the time (0108).** Read his schedule first: `rpc/ofs_schedule`
   `{ "p_from": "yyyy-MM-dd", "p_to": "yyyy-MM-dd" }` (at most 62 days; add `"p_project_id"` for one job). Each row has
   `state` (`asked`, `confirmed`, `proposed`, `postponed`, `done`) and `needs_time` (Asked with no time: Flexible).
   Then one of 7a, 7b or 7c. None of them is needed before step 10 (Oct 10): recording the result confirms the request
   in the same call.

   7a. **Confirm the asked time.** `rpc/ir_confirm` `{ "p_request_id", "p_version", "p_note": "<optional>" }`.
       After: `status = 'confirmed'`, `ofs_sched = 'confirmed'`, `ofs_sched_by` = him, `ofs_sched_at` set. No board line
       (0116): the schedule and the calendar show it. Go to step 10.

   7b. **JUDGMENT: pick another time.** `rpc/ir_ofs_propose`
       `{ "p_request_id", "p_version", "p_date": "yyyy-MM-dd", "p_time": "HH:mm", "p_note": "<optional, up to 500>" }`.
       The day is today or later in the job's time zone; the time is on the hour or half hour; not the asked time
       (that is 7a). After: the request is at that day and time (`duration_kind = 'timed'`), `status = 'pending'`,
       `ofs_sched = 'proposed'`. One Needs you task `ir.ofs_time`, for one person: the job's OFS duty holder, else the
       requester, else whoever sent it. No board line (0116). Go to 7d.

   7c. **Postpone** (as before). `rpc/ir_postpone` `{ "p_request_id", "p_version", "p_reason", "p_note", "p_until" }`.
       Clears any answer. A later 7a or 7b brings it back.

   7d. **Requester (or the duty holder, or the inspector) accepts the new time.** `rpc/ir_ofs_accept`
       `{ "p_request_id", "p_version" }`. Refused with 22023 when nothing waits to be accepted, 42501 for the fire
       marshal himself. After: `status = 'confirmed'`, `ofs_sched = 'accepted'`, the task done (his schedule shows it,
       no board line). **Or ask again:** the requester's `rpc/ir_move` `{ "p_request_id", "p_version",
       "p_request_date", "p_start_time", "p_duration_kind", "p_duration_min" }`: back to `asked`, the proposal and its
       task cleared, back on the fire marshal's schedule as asked. Back to step 7.

   Every answer is in the request's history (`ir_events.action` `confirm`, `ofs_propose`, `ofs_accept`, `move`, with
   the actor) and the audit log. The fire marshal's subscribed calendar (Calendar > Subscribe) carries one line per
   OFS request sent to OFS (`calendar_entries.source_type = 'ofs_request'`, read by `ir.ofs_view`), with its time,
   state and the job's address, on every job of his, even one with the calendar tool off. Nothing sends email or text.

8. **JUDGMENT, optional: take off what isn't ready (Not ready, 0109).** The requester (or the duty holder, or the GC),
   any time from step 2 until step 10 records a result, also after step 6. One wall (every item on it) or one item:
   `rpc/ir_rev_pull_back`
   ```json
   { "p_request_id": "<id>", "p_version": <version>, "p_cells": [ { "area_id": "<wall>", "item_id": "<item>" }, ... ] }
   ```
   Each cell must be on the request now. After: those `ir_rev_items` rows have `pulled_at` set (kept, never deleted)
   and every reader leaves them out: `rev_status` shows them `open` again (as if never asked for), the request's
   `items` line, map legend and title no longer name them, and the map loses their strokes. No board line (0116): the
   request and its map show it. Audited (`ir.rev_pull_back`, with the cells and the strokes taken off). Every cell off: `status = 'withdrawn'`, and `ir_restore` refuses it. No board line for either (0116).
   Refused once a result is recorded on the request or any of its cells: "The results are in."

9. **Undo of step 8.** `rpc/ir_rev_put_back` with the same body and the version step 8 returned. After: the same
   cells back (refused if one of them is on another request since: "That wall is on IR N now."), their strokes back on
   the map, a request step 8 withdrew back in the status it had, its line written again. Audited (`ir.rev_put_back`).

10. **JUDGMENT: pass or fail each wall and item.** The fire marshal, on site.
    `rpc/ir_rev_results`
    ```json
    { "p_request_id": "<id>", "p_version": <version>,
      "p_results": [ { "area_id": "<wall>", "item_id": "<item>", "result": "passed", "note": null }, ... ] }
    ```
    Every cell still on the request (not taken off in step 8) exactly once; `result` is `passed` or `failed`; a `failed`
    one has a `note` saying why (up to 1000 characters). In the app every box starts as Pass: "Pass all" is this call
    with every cell `passed`, one tap; a box flipped to Fail needs its one line first, and the same button saves the
    whole set ("Save · 1 failed"). `p_results: null`
    clears every result (Undo). After: `status = 'confirmed'` (if it was pending), `result = 'approved'` when every cell
    passed, else `not_approved` with the failed notes; `rev_status` shows each passed cell as `passed` with the OFS
    number: **passed in Revs**.

11. **Fire marshal signs the OFS IR.** `functions/v1/ir-pdf`
    `{ "action": "generate", "request_id": "<id>", "filename": "<from lib/buildFilename IR_FILENAME>" }`. Signing
    re-confirms identity first (SPEC §6.9; the app's SignButton). The function hashes the saved content, calls
    `ir_sign` as the caller and renders the PDF in the worker. After: `ir_file_id` set, `status = 'complete'`.
    When approved, make the map again with the signature: `functions/v1/ir-map` `{ "action": "render", "request_id" }`.

12. **Fire marshal sends the results.** `functions/v1/ir-send`
    `{ "request_id": "<id>", "member_ids": ["<member>", ...], "requester": true, "emails": [] }` (at least one
    recipient). The IR goes as a permanent share link. After: `results_sent_at` set.

## A batch, one tap per step (0114)

The steps 4 to 6 for every request of a batch (B6) at once. Each request still walks them as above, so a request of
the batch can also be done on its own.

S1. **Read the batches waiting on me.** `rpc/ir_batches_waiting` `{ "p_project_id": "<job>" }` (leave it out: all my
    jobs): the batches of two or more where it is my turn (0116) on a request that waits on me, one Needs you line
    each. Each: `{ "batch_id", "project_id", "size", "items", "step", "route", "requests": [{id, number, ofs_number,
    items, status, result, helper_id, ofs_sent_at, version, waits}] }`. `step` is the one I take on it now: `gc`
    (step 4), `send` (step 6, by the sender the route names), or `ready` (step 5, the duty route only), the earliest
    with a request waiting on me. `waits` marks those requests. `route` is the job's (see The job's route). One batch: `rpc/ir_batch_get` `{ "p_batch_id" }`
    (the batch of a request: B7).

S2. **The step for the batch.** `rpc/ir_batch_step`
    `{ "p_batch_id": "<batch>", "p_step": "gc"|"ready"|"send", "p_versions": { "<request id>": <version>, ... } }`
    with the version of every request that `waits` in S1. After: each of them as after its single step (4, 5 or 6,
    the same function), one board line for the batch ("Batch of 9 checked", "Batch of 9 ready to send", "Batch of 9
    sent to OFS") instead of one per request, the answer `{ "batch_id", "step", "done": [{id, number, ofs_number,
    status, version}], "skipped": ["<request id>", ...] }`. All or nothing: a stale version, or a request waiting on
    me that is not in `p_versions`, answers `40001` and changes nothing (read S1 again). A request past the step is
    skipped, so the same call again changes nothing. A copy from My Daily Reports (0112, view only) never waits on anyone: it is skipped too. Without the step's right: `42501`. The fire marshal's steps (7 to
    12) stay one request at a time.

## Failed walls

A failed cell stays `failed` in `rev_status` ("Failed — needs re-inspection" on the wall) until it is asked for again
or passes. It is listed on its own under Back from OFS · Failed on the start page (`rpc/ofs_desk`: the designated
person's, and the requester's for his own requests), with its room, wall, item and why. To ask again, start at step 1
with those walls and items: the request form offers them first, under "Failed last time", and marks their rooms. "File another like this" in the app is step 2 again with the same walls, items, time and
answer, the next working day.
