// The fire marshal's home (All my jobs) leads with his OFS schedule (0108): every job where he decides OFS requests,
// Needs a time on top, then the week. A box opens the request on its job.
import { useState } from 'react';
import { useOpenTarget } from '../../../app/frame/useOpenTarget';
import { useIsPhone } from '../../../app/frame/useIsPhone';
import { detectZone, todayInZone } from '../../../lib/dates';
import { entityTarget } from '../../../lib/entityTarget';
import { OfsSchedule } from '../../inspections/OfsSchedule';
import { SECTION_HEAD } from '../../../ui/PageHeader';

export function HomeSchedule() {
  // On All my jobs, today is this device's (the calendar's rule).
  const today = todayInZone(detectZone());
  const [day, setDay] = useState(today);
  const isPhone = useIsPhone();
  const openTarget = useOpenTarget();
  return (
    <section className="flex flex-col gap-2" aria-label="OFS schedule" data-testid="home-ofs-schedule">
      <h2 className={SECTION_HEAD}>OFS schedule</h2>
      <OfsSchedule
        projectId={null}
        day={day}
        today={today}
        isPhone={isPhone}
        selectedId={null}
        onDay={setDay}
        onOpen={(r) => {
          const target = entityTarget('inspection_request', r.id);
          if (target) openTarget(r.project_id, target);
        }}
      />
    </section>
  );
}
