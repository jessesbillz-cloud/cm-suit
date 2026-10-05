// A package in the right column. A new one starts from its CSI division (NewPackageForm); an existing one edits code,
// name, spec sections and scope, saving as it goes (blur, or each section picked or taken off) with a version check.
// Saves go one at a time: a change made while one is on its way is sent right after it, from the saved version.
import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useRemovePackage, useSavePackage, type PackagePatch } from '../../data/bids.mutations';
import { useBidPackages } from '../../data/bids.queries';
import type { PackageRow } from '../../data/bids.types';
import { useCsiLibrary } from '../../data/csi.queries';
import type { CsiLibrary } from '../../data/csi.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Fields';
import { SaveState } from '../../ui/SaveState';
import { EmptyState, ErrorState, LoadingState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { NewPackageForm } from './NewPackageForm';
import { NEW_PACKAGE_ITEM, divisionOfCode, packageProblem } from './packageDraft';
import { PackageScopeField, SpecSectionsField } from './PackageParts';
import { useBidsNav } from './useBidsNav';

function samePackage(a: PackagePatch, b: PackagePatch): boolean {
  return (
    a.code === b.code &&
    a.name === b.name &&
    a.scope_text === b.scope_text &&
    a.spec_sections.length === b.spec_sections.length &&
    a.spec_sections.every((n, i) => n === b.spec_sections[i])
  );
}

interface PackageFieldsProps {
  row: PackageRow;
  library: CsiLibrary;
}

/** Remove (a package nothing was sent or received on), with Undo. The pane closes; Undo brings it back. */
function RemovePackage({ row }: { row: PackageRow }) {
  const remove = useRemovePackage();
  const nav = useBidsNav(row.project_id);
  const toast = useToast();
  function run() {
    remove.mutateAsync({ row, version: row.version, removed: true }).then(
      (version) => {
        nav.setView('packages');
        toast.show({
          message: `${row.code} removed.`,
          action: {
            label: 'Undo',
            onClick: () => {
              remove.mutateAsync({ row, version, removed: false }).catch((e: unknown) => {
                toast.show({ tone: 'error', message: `Not brought back: ${messageOf(e)}` });
              });
            },
          },
        });
      },
      (e: unknown) => {
        toast.show({ tone: 'error', message: `Not removed: ${messageOf(e)}` });
      },
    );
  }
  return (
    <Button size="sm" variant="quiet" icon={Trash2} className="w-fit" loading={remove.isPending} data-testid="package-remove" onClick={run}>
      Remove
    </Button>
  );
}

function PackageFields({ row, library }: PackageFieldsProps) {
  const save = useSavePackage();
  const [base, setBase] = useState(row);
  const [code, setCode] = useState(row.code);
  const [name, setName] = useState(row.name);
  const [scope, setScope] = useState(row.scope_text);
  const [sections, setSections] = useState<readonly string[]>(row.spec_sections);
  const [problem, setProblem] = useState<string | null>(null);
  const sending = useRef(false);
  const waiting = useRef<PackagePatch | null>(null);

  async function send(from: PackageRow, first: PackagePatch) {
    sending.current = true;
    let current = from;
    let next: PackagePatch | null = first;
    try {
      while (next !== null) {
        waiting.current = null;
        if (!samePackage(next, current)) {
          current = await save.mutateAsync({ row: current, patch: next });
          setBase(current);
        }
        next = waiting.current;
      }
    } catch (e) {
      waiting.current = null;
      setProblem(messageOf(e));
    } finally {
      sending.current = false;
    }
  }

  function commit(nextSections: readonly string[] = sections) {
    const patch: PackagePatch = { code: code.trim().toUpperCase(), name: name.trim(), scope_text: scope, spec_sections: [...nextSections] };
    const invalid = packageProblem(patch.code, patch.name);
    setProblem(invalid);
    if (invalid !== null) return;
    if (sending.current) {
      waiting.current = patch;
      return;
    }
    void send(base, patch);
  }

  return (
    <form
      className="flex flex-col gap-4 p-4"
      data-testid="package-form"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <div className="grid grid-cols-[5.5rem_1fr] gap-3">
        <TextField label="Code" value={code} maxLength={3} onChange={setCode} onBlur={commit} testId="package-code" />
        <TextField label="Name" value={name} onChange={setName} onBlur={commit} testId="package-name" />
      </div>
      <SpecSectionsField
        library={library}
        division={divisionOfCode(base.code)}
        value={sections}
        busy={save.isPending}
        onChange={(next) => {
          setSections(next);
          commit(next);
        }}
      />
      <PackageScopeField value={scope} onChange={setScope} onBlur={commit} rows={10} />
      <SaveState pending={save.isPending} saved={save.isSuccess} problem={problem} />
      <RemovePackage row={base} />
    </form>
  );
}

interface PackageFormProps {
  projectId: string;
  packageId: string;
}

export function PackageForm({ projectId, packageId }: PackageFormProps) {
  const packages = useBidPackages(projectId);
  const library = useCsiLibrary();
  if (packages.isPending || library.isPending) return <LoadingState label="Loading package" />;
  if (packages.isError) return <ErrorState error={packages.error} onRetry={() => void packages.refetch()} />;
  if (library.isError) return <ErrorState error={library.error} onRetry={() => void library.refetch()} />;
  if (packageId === NEW_PACKAGE_ITEM) return <NewPackageForm projectId={projectId} packages={packages.data} library={library.data} />;
  const row = packages.data.find((p) => p.id === packageId);
  if (!row) return <EmptyState title="That package is gone." />;
  return <PackageFields row={row} library={library.data} />;
}
