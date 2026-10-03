// A map's plan sheet: the one picked (its name, and Change), or a PDF picked from the job's files: a folder (Plans
// first), then one of its PDFs. Only what I may read is listed; the database checks the pick again.
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useFile, useFiles, useFolders } from '../../data/queries';
import type { FolderRow } from '../../data/types';
import { Button } from '../../ui/Button';
import { FIELD_LABEL, SelectField } from '../../ui/Fields';
import { Icon } from '../../ui/Icon';
import { ErrorState, LoadingState } from '../../ui/States';

interface SheetFieldProps {
  projectId: string;
  value: string | null;
  onChange: (fileId: string) => void;
  disabled?: boolean | undefined;
}

const PICK = '';

/** Plans first, then approved sets, then the rest in their place. */
function firstFolder(folders: readonly FolderRow[]): string {
  const plans = folders.find((f) => f.kind === 'plans') ?? folders.find((f) => f.kind === 'approved_plans') ?? folders[0];
  return plans?.id ?? '';
}

function SheetPicker({ projectId, onPick }: { projectId: string; onPick: (fileId: string) => void }) {
  const folders = useFolders(projectId);
  const [folderId, setFolderId] = useState<string | null>(null);
  const folder = folderId ?? (folders.data ? firstFolder(folders.data) : null);
  const files = useFiles(folder === '' ? null : folder);
  if (folders.isError) return <ErrorState error={folders.error} onRetry={() => void folders.refetch()} className="m-0" />;
  if (folders.isPending) return <LoadingState label="Loading files" />;
  if (folders.data.length === 0) return <p className="text-sm text-ink-2">No files on this job.</p>;
  const pdfs = (files.data ?? []).filter((f) => f.mime === 'application/pdf' && f.upload_complete);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label="Folder"
        value={folder ?? ''}
        options={folders.data.map((f) => ({ value: f.id, label: f.name }))}
        onChange={setFolderId}
        testId="sheet-folder"
      />
      {files.isError ? (
        <ErrorState error={files.error} onRetry={() => void files.refetch()} className="m-0" />
      ) : files.isPending ? (
        <LoadingState label="Loading sheets" />
      ) : pdfs.length === 0 ? (
        <p className="self-end pb-2.5 text-sm text-ink-2">No PDFs here.</p>
      ) : (
        <SelectField
          label="Sheet"
          value={PICK}
          options={[{ value: PICK, label: 'Pick a PDF' }, ...pdfs.map((f) => ({ value: f.id, label: f.original_name }))]}
          onChange={(id) => {
            if (id !== PICK) onPick(id);
          }}
          testId="sheet-file"
        />
      )}
    </div>
  );
}

export function SheetField({ projectId, value, onChange, disabled = false }: SheetFieldProps) {
  const [changing, setChanging] = useState(false);
  const file = useFile(value);
  const picking = value === null || changing;
  return (
    <div className="flex flex-col gap-1.5" data-testid="sheet-field">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <span className={FIELD_LABEL}>Sheet</span>
        {value !== null ? (
          <Button
            size="sm"
            variant="quiet"
            disabled={disabled}
            data-testid="sheet-change"
            onClick={() => {
              setChanging(!changing);
            }}
          >
            {changing ? 'Keep' : 'Change'}
          </Button>
        ) : null}
      </div>
      {value !== null && !changing ? (
        <p className="flex items-start gap-2 text-sm text-ink">
          <Icon icon={FileText} size={16} className="mt-0.5 shrink-0 text-ink-3" />
          <span className="wrap-anywhere" data-testid="sheet-name">
            {file.data?.original_name ?? (file.isPending ? '' : 'Plan sheet')}
          </span>
        </p>
      ) : null}
      {picking && !disabled ? (
        <SheetPicker
          projectId={projectId}
          onPick={(id) => {
            setChanging(false);
            onChange(id);
          }}
        />
      ) : null}
    </div>
  );
}
