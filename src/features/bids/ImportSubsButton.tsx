// "Import list": pick a master sub list (.xlsx or .csv); the server merges it into the directory (safe to repeat).
import { LoaderCircle, Upload } from 'lucide-react';
import { useImportSubs } from '../../data/subs.mutations';
import { messageOf } from '../../data/errors';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';

const MAX_BYTES = 10 * 1024 * 1024;
const count = new Intl.NumberFormat('en-US');

interface ImportSubsButtonProps {
  projectId: string;
  orgId: string;
}

export function ImportSubsButton({ projectId, orgId }: ImportSubsButtonProps) {
  const run = useImportSubs();
  const toast = useToast();

  function pick(file: File) {
    if (file.size > MAX_BYTES) {
      toast.show({ tone: 'error', message: 'File too large (10 MB max).' });
      return;
    }
    run.mutate(
      { projectId, orgId, file },
      {
        onSuccess: (r) => {
          toast.show({ message: `Added ${count.format(r.added)}, updated ${count.format(r.updated)}.` });
        },
        onError: (e) => {
          toast.show({ tone: 'error', message: `Not imported: ${messageOf(e)}` });
        },
      },
    );
  }

  return (
    <label
      aria-busy={run.isPending || undefined}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-card px-2.5 text-sm font-medium ${run.isPending ? 'cursor-wait text-ink-3' : 'cursor-pointer text-ink hover:bg-page'}`}
    >
      {run.isPending ? <Icon icon={LoaderCircle} size={16} className="animate-spin" /> : <Icon icon={Upload} size={16} />}
      {run.isPending ? 'Importing' : 'Import list'}
      <input
        type="file"
        accept=".xlsx,.csv"
        className="sr-only"
        data-testid="subs-import"
        disabled={run.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) pick(file);
        }}
      />
    </label>
  );
}
