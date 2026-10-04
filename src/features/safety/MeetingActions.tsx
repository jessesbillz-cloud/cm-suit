// The meeting's one action at the bottom: Close (the leader, while open: no more signing, the QR stops, the server
// makes the sign-in sheet PDF; Undo for 15 minutes), then Download sheet (one click, the original filename). When the
// PDF failed after the close, Make PDF tries again.
import { useState, type ReactNode } from 'react';
import { FileDown, FileText, Lock } from 'lucide-react';
import { downloadErrorMessage } from '../../data/download';
import { messageOf } from '../../data/errors';
import { downloadSheet, useCloseMeeting, useMakeSheet, useReopenMeeting } from '../../data/safety.mutations';
import type { Meeting } from '../../data/safety.types';
import { rememberLink } from '../../lib/requestLink';
import { meetingLabel, meetingLinkKey } from '../../lib/safety';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';

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
  const [saving, setSaving] = useState(false);
  const label = meetingLabel(meeting.kind, meeting.number);

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
        <Button variant="primary" icon={FileDown} loading={saving} data-testid="safety-sheet-download" onClick={() => { save(fileId); }}>
          Download sheet
        </Button>
      </Footer>
    );
  }
  return (
    <Footer>
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
