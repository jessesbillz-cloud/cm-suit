# Rotating secrets

| Secret | Where | How |
|---|---|---|
| `CRON_SECRET` | Supabase secrets + pg_cron job headers | set new value in both in one deploy |
| `RESEND_WEBHOOK_SECRET` (Svix signing secret) | Resend webhook settings + Supabase secrets | rotate in Resend, then set the new `whsec_…` in Supabase secrets right away (requests fail with 401 in between; Resend retries them) |
| `RESEND_API_KEY` | Resend API keys + Supabase secrets + Auth SMTP password | create the new key, update secrets and SMTP, then delete the old key |
| Delivery board token | per project, `projects.delivery_token_hash` | project admin: Settings → Deliveries → Rotate (Phase 3) |
| Request-link token | per project | same screen (Phase 3) |
| Calendar feed token | per user | user settings (Phase 2) |
| Service-role key | Supabase dashboard | rotate, then update Fly + GitHub secrets |
