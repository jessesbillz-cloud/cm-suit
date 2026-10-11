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
| GC | `ir.gc_approve` |
| Inspector (IOR) | `ir.decide` |
| OFS sender | the inspector, or the job's OFS requests duty holder (`ir_ofs_sender`) |
| Fire marshal (deputy) | `ir.ofs_decide`, `ir.ofs_view` |

## Inputs to read first (no writes)

1. The job's lists, revs, items and walls: `GET /rest/v1/<table>?project_id=eq.<job>` on `rev_lists`, `revs`,
   `rev_items`, `rev_areas` and `rev_marks`. A room's walls: `rev_room_walls` rows with that `room_id` (`rev_rooms`
   for the room by number).
2. `rpc/rev_status` `{ "p_project_id": <job> }`: every wall x item, `status` one of `open`, `requested`, `failed`,
   `passed`, `na`. Only `open` and `failed` cells can be asked for (a `requested` one already is).
3. `rpc/ir_ofs_attest_text` `{ "p_project_id": <job> }`: the job's attestation wording (shown to the requester).

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
   `{ "p_request_id", "p_version", "p_check": "gc", "p_on": true }`. After: `status = 'pending'` (with the inspector).
   A request filed by the GC skips this step (the filing is the GC's Ready).

5. **Inspector checks it Ready.** `rpc/ir_ofs_check` `{ "p_request_id", "p_version", "p_check": "ready", "p_on": true }`.
   When `special_required` is true, also `{ ..., "p_check": "si", "p_on": true, "p_file_id": "<the special inspector's
   report, a file of this job>" }`. When the inspector sends it himself (step 6), his send is his Ready: skip this step.

6. **OFS sender sends it to OFS.** Optional first, the OFS IR number the fire marshal gave:
   `rpc/ir_ofs_number_set` `{ "p_request_id", "p_version", "p_number": <1..999999> }`.
   Then `rpc/ir_send_ofs` `{ "p_request_id", "p_version" }`. After: `ofs_sent_at` set, `status = 'pending'`, the fire
   marshal is told. Undo until he acts: `rpc/ir_unsend_ofs` `{ "p_request_id", "p_version" }`.

7. **Fire marshal, optional: confirm a time first.** `rpc/ir_confirm` `{ "p_request_id", "p_version", "p_note": "<optional>" }`.
   Not needed before step 8 (Oct 10): recording the result confirms the request in the same call.

8. **JUDGMENT: pass or fail each wall and item.** The fire marshal, on site.
   `rpc/ir_rev_results`
   ```json
   { "p_request_id": "<id>", "p_version": <version>,
     "p_results": [ { "area_id": "<wall>", "item_id": "<item>", "result": "passed", "note": null }, ... ] }
   ```
   Every `ir_rev_items` cell of the request exactly once; `result` is `passed` or `failed`; a `failed` one has a
   `note` saying why (up to 1000 characters). "All passed" is this call with every cell `passed`. `p_results: null`
   clears every result (Undo). After: `status = 'confirmed'` (if it was pending), `result = 'approved'` when every cell
   passed, else `not_approved` with the failed notes; `rev_status` shows each passed cell as `passed` with the OFS
   number: **passed in Revs**.

9. **Fire marshal signs the OFS IR.** `functions/v1/ir-pdf`
   `{ "action": "generate", "request_id": "<id>", "filename": "<from lib/buildFilename IR_FILENAME>" }`. Signing
   re-confirms identity first (SPEC §6.9; the app's SignButton). The function hashes the saved content, calls
   `ir_sign` as the caller and renders the PDF in the worker. After: `ir_file_id` set, `status = 'complete'`.
   When approved, make the map again with the signature: `functions/v1/ir-map` `{ "action": "render", "request_id" }`.

10. **Fire marshal sends the results.** `functions/v1/ir-send`
    `{ "request_id": "<id>", "member_ids": ["<member>", ...], "requester": true, "emails": [] }` (at least one
    recipient). The IR goes as a permanent share link. After: `results_sent_at` set.

## Failed walls

A failed cell stays `failed` in `rev_status`. To ask again, start at step 1 with those walls and items: they are
`open` to a new request. "File another like this" in the app is step 2 again with the same walls, items, time and
answer, the next working day.
