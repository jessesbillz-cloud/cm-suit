// New top-level folder, for people with files.manage (the database checks it again).
import { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { useCreateFolder } from '../../data/mutations';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';

interface NewFolderFormProps {
  projectId: string;
  onCreated: (folderId: string) => void;
}

export function NewFolderForm({ projectId, onCreated }: NewFolderFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const create = useCreateFolder();

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
          { projectId, parentId: null, name: trimmed },
          {
            onSuccess: (folder) => {
              setName('');
              setOpen(false);
              onCreated(folder.id);
            },
          },
        );
      }}
    >
      <label className="text-xs font-medium text-ink-2" htmlFor="new-folder-name">
        Folder name
      </label>
      <input
        id="new-folder-name"
        autoFocus
        maxLength={200}
        className="h-8 rounded-md border border-line px-2 text-sm outline-none focus:border-accent"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      {create.isError ? <p className="text-xs text-danger">{messageOf(create.error)}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" type="submit" variant="primary" loading={create.isPending}>
          Create
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => {
            setOpen(false);
            setName('');
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
