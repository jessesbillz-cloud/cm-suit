// The designated person's three big boxes (Jesse, Oct 22: "a very user-friendly page to upload RFIs, upload submittals,
// do the inspection request - very simple"): Request inspection (the OFS request form, room first), Upload submittal and
// Upload RFI (tap to pick, or drop files on the box). Side by side on a desktop, stacked on a phone.
import { useRef, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ClipboardCheck, FileQuestion, FileUp, type LucideIcon } from 'lucide-react';
import { NEW_ITEM } from '../../lib/itemIds';
import { CLICK_BOX } from '../../ui/box';
import { Icon } from '../../ui/Icon';
import { ErrorState } from '../../ui/States';
import { UploadList } from '../files/UploadList';
import { useFileDrop } from '../files/useFileDrop';
import { useDeskUpload, type DeskKind } from './useDeskUpload';

// The boldest things on the page (Jesse, Oct 23): tall boxes, the words in the display face, a thick accent base.
const BOX = `heading flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-card border-b-[6px] border-b-accent px-5 py-6 text-center text-[24px] font-semibold leading-7 tracking-[0.06em] text-ink max-sm:min-h-28 ${CLICK_BOX}`;

function BoxFace({ icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <span className="flex h-14 w-14 items-center justify-center rounded-md bg-rail text-white shadow-tile">
        <Icon icon={icon} size={30} />
      </span>
      {label}
    </>
  );
}

interface UploadBoxProps {
  projectId: string;
  kind: DeskKind;
  label: string;
  icon: LucideIcon;
  testId: string;
}

function UploadBox({ projectId, kind, label, icon, testId }: UploadBoxProps) {
  const up = useDeskUpload(projectId, kind);
  const input = useRef<HTMLInputElement>(null);
  const drop = useFileDrop(up.folder !== null, (dropped) => {
    up.start(dropped.map((d) => d.file));
  });
  let below: ReactNode = null;
  if (up.error) below = <ErrorState error={up.error} title="Upload is not available." onRetry={up.retry} className="m-0" />;
  else if (up.folder !== null) below = <UploadList folderId={up.folder} />;
  return (
    <div className="flex flex-col gap-2" {...drop.handlers}>
      <button
        type="button"
        data-testid={testId}
        disabled={up.loading || up.folder === null}
        className={`${BOX} ${drop.over ? 'ring-4 ring-accent' : ''}`}
        onClick={() => {
          input.current?.click();
        }}
      >
        <BoxFace icon={icon} label={label} />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid={`${testId}-input`}
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = '';
          if (picked.length > 0) up.start(picked);
        }}
      />
      {below}
      {up.prompt}
    </div>
  );
}

export function DeskBoxes({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  return (
    <div className="grid gap-4 sm:grid-cols-3" data-testid="ofs-desk-boxes">
      <button
        type="button"
        data-testid="ofs-desk-request"
        className={BOX}
        onClick={() => {
          void navigate({ to: '/p/$projectId/$tool/$itemId', params: { projectId, tool: 'inspections', itemId: NEW_ITEM }, search: { kind: 'ofs' } });
        }}
      >
        <BoxFace icon={ClipboardCheck} label="Request inspection" />
      </button>
      <UploadBox projectId={projectId} kind="submittals" label="Upload submittal" icon={FileUp} testId="ofs-desk-submittal" />
      <UploadBox projectId={projectId} kind="rfis" label="Upload RFI" icon={FileQuestion} testId="ofs-desk-rfi" />
    </div>
  );
}
