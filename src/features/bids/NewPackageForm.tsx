// A new package (SPEC §11.2): pick its CSI division and the code (next free letter there) and the name (the division's
// title) fill in; both stay editable. Add sections and scope, then Add: the database checks the code is free, and the
// new package opens.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAddPackage } from '../../data/bids.mutations';
import type { PackageRow } from '../../data/bids.types';
import type { CsiLibrary } from '../../data/csi.types';
import { DataError, messageOf } from '../../data/errors';
import { useProject } from '../../data/queries';
import { Button } from '../../ui/Button';
import { SelectField, TextField } from '../../ui/Fields';
import { ErrorState, LoadingState } from '../../ui/States';
import { packageDivisions, packageProblem, startingDivision, suggestCode } from './packageDraft';
import { PackageScopeField, SpecSectionsField } from './PackageParts';
import { useBidsNav } from './useBidsNav';

interface NewPackageFormProps {
  projectId: string;
  packages: readonly PackageRow[];
  library: CsiLibrary;
}

export function NewPackageForm({ projectId, packages, library }: NewPackageFormProps) {
  const project = useProject(projectId);
  const add = useAddPackage();
  const nav = useBidsNav(projectId);
  const codes = packages.map((p) => p.code);
  const divisions = packageDivisions(library.divisions);
  const titleOf = (d: string) => divisions.find((x) => x.number === d)?.title ?? '';

  const [division, setDivision] = useState(() => startingDivision(codes, library.divisions));
  const [code, setCode] = useState(() => suggestCode(division, codes) ?? '');
  const [name, setName] = useState(() => titleOf(division));
  const [sections, setSections] = useState<string[]>([]);
  const [scope, setScope] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  if (project.isPending) return <LoadingState label="Loading" />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => void project.refetch()} />;
  const orgId = project.data.org_id;

  function pickDivision(next: string) {
    // A name the estimator typed stays; the division's own title follows the division.
    if (name.trim() === '' || name === titleOf(division)) setName(titleOf(next));
    setDivision(next);
    setCode(suggestCode(next, codes) ?? '');
    setProblem(null);
  }

  function submit() {
    const c = code.trim().toUpperCase();
    const n = name.replace(/\s+/g, ' ').trim();
    const invalid = packageProblem(c, n);
    setProblem(invalid);
    if (invalid !== null) return;
    add.mutate(
      { projectId, orgId, code: c, name: n, scopeText: scope, specSections: sections },
      {
        onSuccess: (row) => {
          nav.open(row.id, 'packages');
        },
        onError: (e) => {
          setProblem(e instanceof DataError && e.code === '23505' ? `${c} is taken.` : messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-4 p-4"
      data-testid="new-package-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <SelectField
        label="Division"
        value={division}
        options={divisions.map((d) => ({ value: d.number, label: `${d.number} ${d.title}` }))}
        onChange={pickDivision}
        testId="package-division"
      />
      <div className="grid grid-cols-[5.5rem_1fr] gap-3">
        <TextField label="Code" value={code} maxLength={3} onChange={setCode} testId="package-code" />
        <TextField label="Name" value={name} onChange={setName} testId="package-name" />
      </div>
      <SpecSectionsField library={library} division={division} value={sections} onChange={setSections} />
      <PackageScopeField value={scope} onChange={setScope} rows={6} />
      {problem !== null ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="primary" icon={Plus} loading={add.isPending} className="w-fit" data-testid="package-save">
        Add package
      </Button>
    </form>
  );
}
