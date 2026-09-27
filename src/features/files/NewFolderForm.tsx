// New top-level folder, for people with files.manage (the database checks it again). One question besides the name:
// should search and the AI read what goes in it.
import { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { useCreateFolder } from '../../data/folders.mutations';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { CheckField, TextField } from '../../ui/Fields';

interface NewFolderFormProps {
  projectId: string;
  onCreated: (folderId: string) => void;
}

export function NewFolderForm({ projectId, onCreated }: NewFolderFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [aiReads, setAiReads] = useState(true);
  const create = useCreateFolder();

  const close = () => {
    setOpen(false);
    setName('');
    setAiReads(true);
  };

  if (!open) {
    return (
      <Button
        size="sm"
        variant="quiet"
        icon={FolderPlus}
        onClick={() => {
          setOpen(true);
        }}
      >
        New folder
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 px-2 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed === '') return;
        create.mutate(
          { projectId, parentId: null, name: trimmed, aiReads },
          {
            onSuccess: (folder) => {
              close();
              onCreated(folder.id);
            },
          },
        );
      }}
    >
      <TextField label="Folder name" value={name} onChange={setName} autoFocus maxLength={200} testId="new-folder-name" />
      <CheckField label="Search and AI read this" checked={aiReads} onChange={setAiReads} testId="new-folder-ai-reads" />
      {create.isError ? <p className="text-xs text-danger">{messageOf(create.error)}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" type="submit" variant="primary" loading={create.isPending}>
          Create
        </Button>
        <Button size="sm" variant="quiet" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
