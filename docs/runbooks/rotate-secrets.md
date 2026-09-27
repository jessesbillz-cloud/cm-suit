# Rotating secrets

| Secret | Where | How |
|---|---|---|
| `CRON_SECRET` | Supabase secrets + pg_cron job headers | set new value in both in one deploy |
| Postmark webhook Basic Auth + header | Postmark webhook URL + Supabase secrets | update Postmark first, then secrets |
| Delivery board token | per project, `projects.delivery_token_hash` | project admin: Settings → Deliveries → Rotate (Phase 3) |
| Request-link token | per project | same screen (Phase 3) |
| Calendar feed token | per user | user settings (Phase 2) |
| Service-role key | Supabase dashboard | rotate, then update Fly + GitHub secrets |
