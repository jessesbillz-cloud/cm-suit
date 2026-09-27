// Edit one package: code, name, scope. Saves on blur with a version check; a small "Saved" shows it landed.
import { useState } from 'react';
import { useSavePackage, type PackagePatch } from '../../data/bids.mutations';
import { useBidPackages } from '../../data/bids.queries';
import type { PackageRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { SaveState } from './SaveState';

const INPUT = 'rounded-md border border-line px-2.5 text-sm font-normal text-ink outline-none focus:border-accent';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-ink-2';

function problemWith(p: PackagePatch): string | null {
  if (!/^\d{2}[A-Z]$/.test(p.code)) return 'Code looks like 09A.';
  if (p.name === '') return 'Name is empty.';
  return null;
}

function PackageFields({ row }: { row: PackageRow }) {
  const save = useSavePackage();
  const [base, setBase] = useState(row);
  const [code, setCode] = useState(row.code);
  const [name, setName] = useState(row.name);
  const [scope, setScope] = useState(row.scope_text);
  const [problem, setProblem] = useState<string | null>(null);

  function commit() {
    const patch: PackagePatch = { code: code.trim().toUpperCase(), name: name.trim(), scope_text: scope };
    if (patch.code === base.code && patch.name === base.name && patch.scope_text === base.scope_text) return;
    const invalid = problemWith(patch);
    setProblem(invalid);
    if (invalid !== null) return;
    save.mutate(
      { row: base, patch },
      {
        onSuccess: (saved) => {
          setBase(saved);
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <label className={LABEL}>
          Code
          <input className={`h-9 ${INPUT}`} value={code} maxLength={3} onBlur={commit} onChange={(e) => {
              setCode(e.target.value);
            }}
          />
        </label>
        <label className={LABEL}>
          Name
          <input className={`h-9 ${INPUT}`} value={name} onBlur={commit} onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
      </div>
      <label className={LABEL}>
        Scope
        <textarea rows={14} className={`py-2 ${INPUT}`} value={scope} onBlur={commit} onChange={(e) => {
            setScope(e.target.value);
          }}
        />
      </label>
      <SaveState pending={save.isPending} saved={save.isSuccess} problem={problem} />
    </form>
  );
}

interface PackageFormProps {
  projectId: string;
  packageId: string;
}

export function PackageForm({ projectId, packageId }: PackageFormProps) {
  const packages = useBidPackages(projectId);
  if (packages.isPending) return <LoadingState label="Loading package" />;
  if (packages.isError) return <ErrorState error={packages.error} onRetry={() => void packages.refetch()} />;
  const row = packages.data.find((p) => p.id === packageId);
  if (!row) return <EmptyState title="That package is gone." />;
  return <PackageFields row={row} />;
}
