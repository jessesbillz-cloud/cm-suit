// Small rules of the comments panel. Pure, so they are unit-tested.
import { formatInZone, todayInZone } from '../../lib/dates';

/** When a comment (or an earlier text) was written, in the job's zone: "Sep 30, 2:14 PM", with the year if not this one. */
export function commentWhen(at: string, tz: string, now: Date = new Date()): string {
  const thisYear = formatInZone(at, tz, 'yyyy') === todayInZone(tz, now).slice(0, 4);
  return formatInZone(at, tz, thisYear ? 'MMM d, h:mm a' : 'MMM d, yyyy, h:mm a');
}
