// Walls: every wall by level (and by list when a job has more than one), one tight row each: the whole wall name (it
// wraps, never cut) and the tracker over its list's revs (ui/Stepper, the rev numbers on the dots). On a wide screen
// the name and the tracker share one line; on a phone the tracker sits under the name. A tap opens the wall.
import { Settings2 } from 'lucide-react';
import type { RevArea, RevSetup } from '../../data/revs.types';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/States';
import { Stepper } from '../../ui/Stepper';
import { phoneRowClass } from '../../ui/Table';
import { TOOL_META } from '../../ui/tools';
import { revSteps, wallRevs, wallsByList, type StatusIndex } from './model';

interface WallsViewProps {
  setup: RevSetup;
  index: StatusIndex;
  selectedId: string | null;
  isPhone: boolean;
  onOpen: (id: string) => void;
  /** Managers: the empty screen points to Setup. */
  onSetup?: (() => void) | undefined;
}

interface WallRowProps {
  area: RevArea;
  setup: RevSetup;
  index: StatusIndex;
  selected: boolean;
  isPhone: boolean;
  onOpen: (id: string) => void;
}

function WallRow({ area, setup, index, selected, isPhone, onOpen }: WallRowProps) {
  const revs = wallRevs(setup, index, area);
  return (
    <li>
      <button
        type="button"
        data-testid={`rev-wall-${area.id}`}
        aria-current={selected ? 'true' : undefined}
        className={`${phoneRowClass(selected)} flex ${isPhone ? 'flex-col gap-2' : 'items-center gap-4 py-2.5'} ${selected ? '' : 'hover:bg-page/60'}`}
        onClick={() => {
          onOpen(area.id);
        }}
      >
        <span className={`min-w-0 whitespace-normal break-words text-[15px] leading-6 text-ink ${isPhone ? '' : 'w-[34%] shrink-0'}`}>
          {area.name}
        </span>
        <span className="block w-full min-w-0 flex-1">
          <Stepper size="sm" anyOrder start={revs[0]?.rev.number ?? 0} label={`Revs, ${area.name}`} testId="rev-wall-steps" steps={revSteps(revs)} />
        </span>
      </button>
    </li>
  );
}

function GroupHead({ title, sub }: { title: string; sub?: string | undefined }) {
  return (
    <h2 className="flex items-baseline gap-2 border-b border-line bg-card-head px-4 py-1.5 text-[11.5px] font-semibold uppercase leading-5 tracking-[0.06em] text-ink-2">
      <span className="break-words">{title}</span>
      {sub ? <span className="font-medium normal-case tracking-normal text-ink-3">{sub}</span> : null}
    </h2>
  );
}

export function WallsView({ setup, index, selectedId, isPhone, onOpen, onSetup }: WallsViewProps) {
  const groups = wallsByList(setup);
  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={TOOL_META.revs.icon}
          title="No walls yet."
          action={
            onSetup ? (
              <Button variant="primary" icon={Settings2} data-testid="rev-go-setup" onClick={onSetup}>
                Open Setup
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }
  const manyLists = setup.lists.length > 1;
  return (
    <div className="flex flex-col gap-4" data-testid="rev-walls">
      {groups.map(({ list, levels }) => (
        <Card key={list.id} padded={false} className="overflow-hidden">
          {manyLists ? (
            <p className="break-words px-4 pb-1 pt-3 text-[15px] font-semibold text-ink">
              {list.name}
              {list.phase ? <span className="ml-2 text-[13px] font-medium text-ink-3">{list.phase}</span> : null}
            </p>
          ) : null}
          {levels.map((g) => (
            <section key={g.level} data-testid="rev-level">
              <GroupHead title={g.level} sub={`${String(g.areas.length)} ${g.areas.length === 1 ? 'wall' : 'walls'}`} />
              <ul className="divide-y divide-line">
                {g.areas.map((a) => (
                  <WallRow key={a.id} area={a} setup={setup} index={index} selected={selectedId === a.id} isPhone={isPhone} onOpen={onOpen} />
                ))}
              </ul>
            </section>
          ))}
        </Card>
      ))}
    </div>
  );
}
