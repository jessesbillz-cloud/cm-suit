// Rename the open folder (files.manage). The database refuses the system's own names and the server's folders, and
// says so under the field. This is where "Rename it in Files" (a folder in the way of RFIs, Safety, Schedule) leads.
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useRenameFolder } from '../../data/files';
import type { FolderRow } from '../../data/types';
import { Button } from '../../ui/Button';
import { RenameForm } from './RenameForm';

export function RenameFolder({ folder }: { folder: FolderRow }) {
  const [open, setOpen] = useState(false);
  const rename = useRenameFolder();

  if (!open) {
    return (
      <Button
        size="sm"
        variant="quiet"
        icon={Pencil}
        data-testid="folder-rename"
        onClick={() => {
          setOpen(true);
        }}
      >
        Rename folder
      </Button>
    );
  }
  return (
    <div className="px-2 py-2">
      <RenameForm
        name={folder.name}
        label="Folder name"
        testId="folder-rename-name"
        saving={rename.isPending}
        error={rename.error}
        onCancel={() => {
          rename.reset();
          setOpen(false);
        }}
        onSave={(name) => {
          rename.mutate(
            { folder, name },
            {
              onSuccess: () => {
                setOpen(false);
              },
            },
          );
        }}
      />
    </div>
  );
}
