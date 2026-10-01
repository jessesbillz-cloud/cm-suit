// The permit page's last two pieces: the approved set (a link to the job's folder for approved plans or permits, when
// there is one; no viewer of our own) and, in the full view only, the stage history (who moved it and when; an undone
// move shows struck through).
import { useNavigate } from '@tanstack/react-router';
import { FolderCheck } from 'lucide-react';
import type { PermitEvent } from '../../data/permits.types';
import { useFolders } from '../../data/queries';
import { formatInZone } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { approvedFolder, stageLabel } from './model';

export function ApprovedSet({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const folders = useFolders(projectId);
  if (folders.isError) return <p className="text-sm text-danger">The approved set did not load.</p>;
  const folder = approvedFolder(folders.data ?? []);
  if (!folder) return null;
  return (
    <button
      type="button"
      data-testid="permit-approved-set"
      className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-page"
      onClick={() => {
        void navigate({ to: '/p/$projectId/$tool', params: { projectId, tool: 'files' }, search: { folder: folder.id } });
      }}
    >
      <Icon icon={FolderCheck} size={16} className="text-accent" />
      {folder.name}
    </button>
  );
}

export function PermitHistory({ events, timeZone }: { events: readonly PermitEvent[]; timeZone: string }) {
  return (
    <section className="flex flex-col gap-1.5" data-testid="permit-history">
      <h2 className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-ink-3">History</h2>
      <ol className="flex flex-col gap-1 text-[13px] leading-5">
        {[...events].reverse().map((e, i) => (
          <li key={`${e.at}-${String(i)}`} className={`flex gap-2 ${e.undone ? 'text-ink-3 line-through' : 'text-ink-2'}`}>
            <span className="w-28 shrink-0 tabular-nums">{formatInZone(e.at, timeZone, 'MMM d, yyyy')}</span>
            <span className="min-w-0 flex-1 break-words">
              <span className={e.undone ? '' : 'font-medium text-ink'}>{stageLabel(e.stage)}</span>
              {e.by_name ? ` · ${e.by_name}` : ''}
              {e.note ? ` · ${e.note}` : ''}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
