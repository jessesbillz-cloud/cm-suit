# Hard delete (admin only)

Users soft-delete (`deleted_at`). A hard delete is a manual, audited step:

1. Confirm with Jesse in writing which rows/objects go.
2. Run `select public.admin_hard_delete('<entity_type>', '<id>')` as the service role from a migration-free session; it writes an `audit_events` row first, then deletes.
3. Remove storage objects with the worker's `purge` job (also audited).
4. Record the date and reason in `docs/decisions.md`.
