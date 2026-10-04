// Weather on dailies (SPEC §18.1 principle 5): the words (a form's own condition buttons, the work log's one line) and
// the address a lookup is remembered by live with the edge functions (supabase/functions/_shared/weather.ts), so the
// browser, the e2e mock and the server read them the one way.
export { addressKey, weatherLine, weatherPicks } from '../../supabase/functions/_shared/weather';
