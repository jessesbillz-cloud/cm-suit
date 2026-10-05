// Settings > Company, "Logo": the company's logo, printed on its official RFIs. PNG or JPEG; a photo over 2 MB is made
// smaller first. Upload / Replace, and Remove with Undo (the removal waits for the toast to close, no "are you sure?").
// Org admins only (the card around it already is).
import { useRef, useState } from 'react';
import { LoaderCircle, Trash2, Upload } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useOrgLogo, useRemoveOrgLogo, useUploadOrgLogo } from '../../data/org.mutations';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { SettingRow } from './SettingRow';

export function CompanyLogo({ orgId }: { orgId: string }) {
  const logo = useOrgLogo(orgId);
  const upload = useUploadOrgLogo(orgId);
  const remove = useRemoveOrgLogo(orgId);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  // Removed but still undoable: hidden here until the toast closes.
  const [removing, setRemoving] = useState(false);
  const url = removing ? null : (logo.data?.url ?? null);
  const problem = logo.error ?? upload.error ?? remove.error;

  function removeLogo() {
    setRemoving(true);
    toast.show({
      message: 'Logo removed.',
      durationMs: 6000,
      action: {
        label: 'Undo',
        onClick: () => {
          setRemoving(false);
        },
      },
      onCommit: () => {
        remove.mutate(undefined, {
          onSettled: () => {
            setRemoving(false);
          },
        });
      },
    });
  }

  return (
    <SettingRow label="Logo" testId="company-logo">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-44 items-center justify-center overflow-hidden rounded-lg border border-dashed border-line-strong bg-card-head">
          {logo.isPending || upload.isPending ? <Icon icon={LoaderCircle} size={18} className="animate-spin text-ink-2" label="Loading" /> : null}
          {!logo.isPending && !upload.isPending && url !== null ? (
            <img src={url} alt="Company logo" data-testid="company-logo-image" className="max-h-full max-w-full object-contain p-2" />
          ) : null}
          {!logo.isPending && !upload.isPending && url === null ? <span className="text-xs text-ink-3">No logo</span> : null}
        </div>
        <Button
          icon={Upload}
          disabled={upload.isPending || logo.isPending}
          data-testid="company-logo-upload"
          onClick={() => {
            input.current?.click();
          }}
        >
          {url === null ? 'Upload' : 'Replace'}
        </Button>
        {url !== null ? (
          <Button
            variant="quiet"
            icon={Trash2}
            loading={remove.isPending}
            data-testid="company-logo-remove"
            onClick={removeLogo}
          >
            Remove
          </Button>
        ) : null}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          data-testid="company-logo-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) upload.mutate(file);
          }}
        />
      </div>
      {problem ? (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {messageOf(problem)}
        </p>
      ) : null}
    </SettingRow>
  );
}
