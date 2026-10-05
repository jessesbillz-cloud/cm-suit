// The meeting's one action at the bottom: Close (the leader, while open: no more signing, the QR stops, the server
// makes the sign-in sheet PDF), then View sheet (its page full screen) and Download sheet (one click, the original
// filename). Undo stays beside it for as
// long as the database allows (15 minutes, the one who closed it), not only in the toast. When the PDF failed after the
// close, Make PDF tries again.
import { useState, type ReactNode } from 'react';
import { Eye, FileDown, FileText, Lock, Undo2 } from 'lucide-react';
import { useUser } from '../../data/auth';
import { downloadErrorMessage } from '../../data/download';
import { messageOf } from '../../data/errors';
import { usePreviewFetch } from '../../data/preview';
import { downloadSheet, useCloseMeeting, useMakeSheet, useReopenMeeting } from '../../data/safety.mutations';
import type { Meeting } from '../../data/safety.types';
import { rememberLink } from '../../lib/requestLink';
import { meetingLabel, meetingLinkKey } from '../../lib/safety';
import { Button } from '../../ui/Button';
import { useFileViewer } from '../../ui/FileViewer';
import { useToast } from '../../ui/Toast';
import { useBefore } from '../../ui/useBefore';

/** How long the one who closed a meeting may reopen it (safety_meeting_reopen). */
const REOPEN_MS = 15 * 60_000;

interface MeetingActionsProps {
  projectId: string;
  meeting: Meeting;
}

function Footer({ children }: { children: ReactNode }) {
  return <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-card px-5 py-3">{children}</footer>;
}

export function MeetingActions({ projectId, meeting }: MeetingActionsProps) {
  const close = useCloseMeeting(projectId, meeting.id);
  const make = useMakeSheet(projectId, meeting.id);
  const reopen = useReopenMeeting(projectId, meeting.id);
  const toast = useToast();
  const viewer = useFileViewer();
  const preview = usePreviewFetch();
  const user = useUser();
  const [saving, setSaving] = useState(false);
  const label = meetingLabel(meeting.kind, meeting.number);
  const closedByMe = meeting.status === 'closed' && meeting.closed_by === user.id ? meeting.closed_at : null;
  const canUndo = useBefore(closedByMe === null ? null : Date.parse(closedByMe) + REOPEN_MS);

  function undo() {
    reopen.mutate(undefined, {
      onSuccess: (r) => {
        rememberLink(meetingLinkKey(meeting.id), { token: r.token, made_at: r.token_made_at });
      },
      onError: (e) => {
        toast.show({ tone: 'error', message: `Not undone: ${messageOf(e)}` });
      },
    });
  }

  const undoButton = canUndo ? (
    <Button variant="quiet" icon={Undo2} loading={reopen.isPending} className="mr-auto" data-testid="safety-undo-close" onClick={undo}>
      Undo
    </Button>
  ) : null;

  function save(fileId: string) {
    setSaving(true);
    downloadSheet(fileId).then(
      () => {
        setSaving(false);
      },
      (e: unknown) => {
        setSaving(false);
        toast.show({ tone: 'error', message: downloadErrorMessage(e) });
      },
    );
  }

  if (meeting.status === 'open') {
    if (!meeting.can_lead) return null;
    return (
      <Footer>
        <Button
          variant="primary"
          size="lg"
          icon={Lock}
          loading={close.isPending}
          data-testid="safety-close"
          onClick={() => {
            close.mutate(meeting.version, {
              onSuccess: () => {
                toast.show({ message: `${label} closed.`, action: { label: 'Undo', onClick: undo } });
              },
              onError: (e) => {
                toast.show({ tone: 'error', message: messageOf(e) });
              },
            });
          }}
        >
          Close
        </Button>
      </Footer>
    );
  }
  if (meeting.pdf_file_id) {
    const fileId = meeting.pdf_file_id;
    return (
      <Footer>
        {undoButton}
        <Button
          icon={Eye}
          data-testid="safety-sheet-view"
          onClick={() => {
            viewer.open([{ id: fileId, name: `${label} sign-in sheet`, kind: 'pdf', url: () => preview(fileId), download: () => downloadSheet(fileId) }]);
          }}
        >
          View sheet
        </Button>
        <Button variant="primary" icon={FileDown} loading={saving} data-testid="safety-sheet-download" onClick={() => { save(fileId); }}>
          Download sheet
        </Button>
      </Footer>
    );
  }
  return (
    <Footer>
      {undoButton}
      <Button
        icon={FileText}
        loading={make.isPending}
        data-testid="safety-make-sheet"
        onClick={() => {
          make.mutate(undefined, { onError: (e) => { toast.show({ tone: 'error', message: messageOf(e) }); } });
        }}
      >
        Make PDF
      </Button>
    </Footer>
  );
}
