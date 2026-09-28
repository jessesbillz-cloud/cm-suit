// The overlap heads-up shown before posting (SPEC §13.3). The database makes the same call when the post lands
// (delivery_overlaps) and marks the delivery Standby; this only tells the person first.
import { fromZonedInput } from '../../lib/dates';
import { findOverlap } from '../../lib/deliveries';
import type { DeliveryInput } from '../../data/deliveries.types';
import { timeRange, type CardDelivery } from './DeliveryCard';

/** The form's start as a UTC instant, or null while the time is TBD or not filled in. */
function candidateStart(value: DeliveryInput, tz: string): string | null {
  if (value.time === null || !/^\d{2}:\d{2}$/.test(value.time) || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
  return fromZonedInput(`${value.date}T${value.time}`, tz);
}

/** "Heads up — {company} already has a delivery 7:00–8:00 AM." or null. `exceptId`: the delivery being edited. */
export function headsUpFor(rows: readonly CardDelivery[], value: DeliveryInput, tz: string, exceptId?: string): string | null {
  const sameDay = rows.filter((r) => r.delivery_date === value.date);
  const hit = findOverlap(sameDay, { starts_at: candidateStart(value, tz), duration_min: value.duration_min }, exceptId);
  return hit ? `Heads up — ${hit.company} already has a delivery ${timeRange(hit, tz)}.` : null;
}
