// A file in Submittals whose name carries no spec section: Add spec section on its row puts one in front of its name
// ("092900_<its name>"), through Rename and its version check (Jesse, Oct 12: the spec number in every title).
import { useState } from 'react';
import { messageOf } from '../../data/errors';
import { useRenameFile } from '../../data/files';
import type { FileRow } from '../../data/types';
import { Button } from '../../ui/Button';
import { SectionInput } from './SectionInput';
import { sectionedName, typedSection } from './submittalNames';

export function AddSection({ file, version }: { file: FileRow; version: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const rename = useRenameFile();
  const key = typedSection(value);
  if (!open) {
    return (
      <button
        type="button"
        data-testid="file-row-add-section"
        className="text-xs font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        onClick={() => {
          setOpen(true);
        }}
      >
        Add spec section
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (key === null) return;
        rename.mutate({ file, version, name: sectionedName(key, file.original_name) }, { onSuccess: () => { setOpen(false); } });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <SectionInput projectId={file.project_id} value={value} label={`Spec section for ${file.original_name}`} testId="file-row-section-input" autoFocus onChange={setValue} />
      <Button size="sm" type="submit" variant="primary" className="mt-1" loading={rename.isPending} disabled={key === null} data-testid="file-row-section-save">
        Save
      </Button>
      <Button
        size="sm"
        variant="quiet"
        className="mt-1"
        onClick={() => {
          rename.reset();
          setOpen(false);
        }}
      >
        Cancel
      </Button>
      {rename.isError ? (
        <p role="alert" className="basis-full text-xs text-danger">
          {messageOf(rename.error)}
        </p>
      ) : null}
    </form>
  );
}
