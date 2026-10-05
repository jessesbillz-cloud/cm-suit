// e2e mock of "Add row" in a schedule draft (0081 schedule_activity_add): a row the reader missed goes last on the
// draft, checked; the same row (name, ID, dates) added again is the same row. The draft's rules are the schedule mock's.
import { DataError } from '../errors';
import type { ActivityInput } from '../schedule.types';
import { draftOf, live, write } from './schedule';
import type { StoredActivity } from './scheduleSeeds';
import { delay } from './store';

export async function addActivity(versionId: string, input: ActivityInput): Promise<string> {
  await delay();
  let made = '';
  write((s) => {
    const v = draftOf(s, versionId);
    if (input.name.trim() === '') throw new DataError('Add a name.', '23514', null);
    const blank = (x: string) => (x.trim() === '' ? null : x.trim());
    const same = live(s, v.id).find(
      (a) => a.name === input.name.trim() && a.activity_code === blank(input.code) && a.start_date === input.start && a.finish_date === input.finish,
    );
    if (same) {
      made = same.id;
      return s;
    }
    made = `${v.id}-x${String(s.seq)}`;
    const sort = Math.max(0, ...s.activities.filter((a) => a.version_id === v.id).map((a) => a.sort)) + 1;
    const row: StoredActivity = {
      id: made, version_id: v.id, project_id: v.project_id, activity_code: blank(input.code), name: input.name.trim(), wbs: blank(input.wbs),
      area: blank(input.area), trade: blank(input.trade), start_date: input.start, finish_date: input.finish, actual_start: null,
      actual_finish: null, percent: null, is_milestone: input.isMilestone, csi_division: null, sort, unsure: false, source_ref: null, version: 1,
      deleted: false,
    };
    return { ...s, activities: [...s.activities, row], seq: s.seq + 1 };
  });
  return made;
}

