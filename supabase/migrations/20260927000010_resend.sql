-- 0010 Email provider is Resend, not Postmark (docs/decisions.md 2026-09-27). Renames only; RLS, grants and the
-- revokes from 0007 stay attached to the renamed objects.

-- Outbound: the provider's message id (Resend email id). Stays unique.
alter table public.email_outbound rename column postmark_message_id to provider_message_id;
alter table public.email_outbound rename constraint email_outbound_postmark_message_id_key to email_outbound_provider_message_id_key;

alter table public.transmittals rename column postmark_message_id to provider_message_id;

-- Delivery / bounce / complaint / open webhook log. De-duplicated on the webhook's event id (Resend's svix-id header).
alter table public.postmark_events rename to email_events;
alter table public.email_events rename constraint postmark_events_pkey to email_events_pkey;
alter sequence public.postmark_events_id_seq rename to email_events_id_seq;
alter table public.email_events drop constraint postmark_events_message_id_record_type_key;
alter table public.email_events rename column message_id to event_id;
alter table public.email_events rename column record_type to event_type;
-- Postmark-era rows were keyed by (message id, record type); fold both into the new single key so they stay unique
-- and can never collide with a Svix id. Nothing is deleted.
update public.email_events set event_id = 'postmark:' || event_id || ':' || event_type;
alter table public.email_events add constraint email_events_event_id_key unique (event_id);
create index email_events_email_id on public.email_events ((payload -> 'data' ->> 'email_id'));
