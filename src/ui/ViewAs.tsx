// Testing only (0039): "View as" in the top bar. Picks the role I take on every job; "Me" is my real role.
import { Eye } from 'lucide-react';
import { useSetViewAs, useViewAs } from '../data/viewAs';
import { messageOf } from '../data/errors';
import { Icon } from './Icon';
import { useToast } from './Toast';

const ME = '';

export function ViewAs() {
  const state = useViewAs();
  const set = useSetViewAs();
  const toast = useToast();
  if (!state.data) return null;
  const viewing = state.data.viewing;
  return (
    <label
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-sm ${
        viewing ? 'border-accent text-accent' : 'border-line text-ink-2'
      }`}
    >
      <Icon icon={Eye} size={14} />
      <span className="sr-only">View as</span>
      <select
        data-testid="view-as"
        className="bg-transparent pr-1 text-sm outline-none"
        value={viewing ?? ME}
        disabled={set.isPending}
        onChange={(e) => {
          const role = e.target.value === ME ? null : e.target.value;
          set.mutate(role, {
            onError: (err: unknown) => {
              toast.show({ tone: 'error', message: messageOf(err) });
            },
          });
        }}
      >
        <option value={ME}>Me</option>
        {state.data.roles.map((r) => (
          <option key={r.name} value={r.name}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
