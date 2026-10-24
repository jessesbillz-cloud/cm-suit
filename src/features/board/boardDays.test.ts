import { describe, expect, it } from 'vitest';
import type { BoardLine } from '../../data/types';
import { groupByDay } from './boardDays';

const LA = 'America/Los_Angeles';

function line(id: string, at: string): BoardLine {
  return { id, created_at: at, project_id: 'job', project_name: 'Sample Job', kind: 'note', entity_type: '', entity_id: '',
    summary: id, actor_user_id: '', unread: false };
}

describe('board days', () => {
  it("groups lines by their job's day, newest first, under Today, Yesterday, then the date", () => {
    const now = new Date('2026-10-23T18:00:00Z');
    const days = groupByDay(
      [
        line('a', '2026-10-23T17:00:00Z'),
        // 9:30 PM Pacific on the 22nd (already the 23rd in UTC): yesterday on the job.
        line('b', '2026-10-23T04:30:00Z'),
        line('c', '2026-10-22T15:00:00Z'),
        line('d', '2026-10-20T15:00:00Z'),
      ],
      () => LA,
      now,
    );
    expect(days.map((d) => d.heading)).toEqual(['Today', 'Yesterday', 'Tuesday, Oct 20']);
    expect(days[1]?.lines.map((l) => l.id)).toEqual(['b', 'c']);
  });
});
