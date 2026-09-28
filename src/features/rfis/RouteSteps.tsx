// The job's RFI route in Settings: the reviewers in order (a role on the job, or one person), each can move up or down
// or come off; then the two fixed steps every RFI takes, PM / PE (issue) and Architect (answer). No dragging.
import { ChevronDown, ChevronUp, X, type LucideIcon } from 'lucide-react';
import type { Person } from '../../data/types';
import { humanize } from '../../lib/format';
import { Icon } from '../../ui/Icon';

export interface Step {
  role: string | null;
  user_id: string | null;
  label: string;
}

const MAX_STEPS = 10;
const FIXED = ['PM / PE', 'Architect'];

interface MoveProps {
  icon: LucideIcon;
  label: string;
  testId: string;
  disabled?: boolean | undefined;
  onClick: () => void;
}

function MoveButton({ icon, label, testId, disabled = false, onClick }: MoveProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-page hover:text-ink disabled:text-line-strong disabled:hover:bg-transparent"
      onClick={onClick}
    >
      <Icon icon={icon} size={16} />
    </button>
  );
}

function Num({ n, muted }: { n: number; muted: boolean }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums ${muted ? 'bg-page text-ink-3' : 'bg-accent-soft text-accent'}`}>
      {n}
    </span>
  );
}

interface RouteStepsProps {
  steps: readonly Step[];
  people: readonly Person[];
  onMove: (index: number, step: -1 | 1) => void;
  onRemove: (index: number) => void;
  onAdd: (step: Step) => void;
}

/** The job's roles (from its active people) and its people, minus what is already a step. */
function options(steps: readonly Step[], people: readonly Person[]) {
  const active = people.filter((p) => p.status === 'active');
  const roles = [...new Set(active.map((p) => p.role))].filter((r) => !steps.some((s) => s.role === r)).sort();
  const persons = active.filter((p): p is Person & { user_id: string } => p.user_id !== null && !steps.some((s) => s.user_id === p.user_id));
  return { roles, persons };
}

export function RouteSteps({ steps, people, onMove, onRemove, onAdd }: RouteStepsProps) {
  const { roles, persons } = options(steps, people);
  const full = steps.length >= MAX_STEPS;
  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-line overflow-hidden rounded-md border border-line" data-testid="rfi-route">
        {steps.map((s, i) => (
          <li key={s.role ?? s.user_id ?? String(i)} className="flex min-h-11 items-center gap-3 py-1.5 pl-3 pr-1.5" data-testid={`rfi-route-step-${String(i + 1)}`}>
            <Num n={i + 1} muted={false} />
            <span className="min-w-0 flex-1 break-words text-sm text-ink">
              {s.label}
            </span>
            <span className="hidden text-xs text-ink-3 sm:inline">{s.role !== null ? 'Role' : 'Person'}</span>
            <MoveButton icon={ChevronUp} label={`Move ${s.label} up`} testId={`rfi-route-up-${String(i + 1)}`} disabled={i === 0} onClick={() => { onMove(i, -1); }} />
            <MoveButton icon={ChevronDown} label={`Move ${s.label} down`} testId={`rfi-route-down-${String(i + 1)}`} disabled={i === steps.length - 1} onClick={() => { onMove(i, 1); }} />
            <MoveButton icon={X} label={`Remove ${s.label}`} testId={`rfi-route-remove-${String(i + 1)}`} onClick={() => { onRemove(i); }} />
          </li>
        ))}
        {FIXED.map((label, i) => (
          <li key={label} className="flex h-11 items-center gap-3 bg-card-head pl-3 pr-3">
            <Num n={steps.length + i + 1} muted />
            <span className="flex-1 text-sm text-ink-2">{label}</span>
          </li>
        ))}
      </ol>
      <select
        aria-label="Add a step"
        data-testid="rfi-route-add"
        disabled={full || (roles.length === 0 && persons.length === 0)}
        className="h-9 w-full rounded-md border border-line-strong bg-card px-2.5 text-sm text-ink shadow-control outline-none focus:border-accent sm:w-72"
        value=""
        onChange={(e) => {
          const [kind, value = ''] = e.target.value.split(':');
          if (kind === 'role') onAdd({ role: value, user_id: null, label: humanize(value) });
          const person = persons.find((p) => p.user_id === value);
          if (kind === 'user' && person) onAdd({ role: null, user_id: person.user_id, label: person.full_name });
        }}
      >
        <option value="">{full ? 'Up to 10 steps' : 'Add a step'}</option>
        {roles.length > 0 ? (
          <optgroup label="Role">
            {roles.map((r) => (
              <option key={r} value={`role:${r}`}>
                {humanize(r)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {persons.length > 0 ? (
          <optgroup label="Person">
            {persons.map((p) => (
              <option key={p.user_id} value={`user:${p.user_id}`}>
                {p.full_name} · {p.company}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </div>
  );
}
