// What I may do with this RFI now, and nothing else (rfi_detail.can; the database checks again): send it on, sign and
// issue it, answer it, close it, edit it, send it back or void it. A move that needs a note opens its small form here.
import { useState } from 'react';
import { Ban, CircleCheck, MessageSquareReply, Pencil, SendHorizontal, Stamp, Undo2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useCloseRfi, useForwardRfi, useSendBackRfi, useSignIssue, useVoidRfi } from '../../data/rfis.mutations';
import type { RfiDetail } from '../../data/rfis.types';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { SignButton } from '../auth/SignButton';
import { AnswerForm } from './AnswerForm';
import { NoteForm } from './NoteForm';
import { rfiLabel } from './model';

type Mode = 'none' | 'answer' | 'send_back' | 'void';

interface RfiActionsProps {
  detail: RfiDetail;
  isPhone: boolean;
  onEdit: () => void;
}

export function RfiActions({ detail, isPhone, onEdit }: RfiActionsProps) {
  const { can, rfi } = detail;
  const forward = useForwardRfi();
  const sendBack = useSendBackRfi();
  const close = useCloseRfi();
  const voidRfi = useVoidRfi();
  const issue = useSignIssue();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('none');
  const none = () => {
    setMode('none');
  };
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };
  const nextLabel = detail.route.find((s) => s.state === 'next')?.label ?? '';

  if (mode === 'answer') return <AnswerForm row={rfi} isPhone={isPhone} onDone={none} />;
  if (mode === 'send_back') {
    return (
      <NoteForm
        label="Why it goes back"
        confirm="Send back"
        testId="rfi-send-back"
        icon={Undo2}
        pending={sendBack.isPending}
        error={sendBack.error}
        onConfirm={(note) => {
          sendBack.mutate({ ref: rfi, note }, { onSuccess: () => { toast.show({ message: `Sent back to ${detail.originator_name}` }); none(); } });
        }}
        onCancel={none}
      />
    );
  }
  if (mode === 'void') {
    return (
      <NoteForm
        label="Why"
        confirm="Void"
        testId="rfi-void"
        icon={Ban}
        danger
        pending={voidRfi.isPending}
        error={voidRfi.error}
        onConfirm={(note) => {
          voidRfi.mutate({ ref: rfi, note }, { onSuccess: () => { toast.show({ message: `${rfiLabel(rfi.number)} voided` }); none(); } });
        }}
        onCancel={none}
      />
    );
  }

  const editable = can.edit && rfi.status !== 'draft';
  if (!(can.forward || can.issue || can.answer || can.close || can.send_back || can.void || editable)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4" data-testid="rfi-actions">
      {can.forward ? (
        <Button
          variant="primary"
          icon={SendHorizontal}
          loading={forward.isPending}
          data-testid="rfi-forward"
          onClick={() => {
            forward.mutate({ ref: rfi, note: '' }, { onSuccess: () => { toast.show({ message: nextLabel === '' ? 'Sent on' : `Sent to ${nextLabel}` }); }, onError: failed });
          }}
        >
          Send on
        </Button>
      ) : null}
      {can.issue ? (
        <SignButton
          label="Sign & issue"
          testId="rfi-issue"
          icon={Stamp}
          pending={issue.isPending}
          sign={() => issue.mutateAsync({ ref: rfi })}
          onSigned={() => {
            toast.show({ message: 'Signed and issued' });
          }}
        />
      ) : null}
      {can.answer ? (
        <Button variant="primary" icon={MessageSquareReply} data-testid="rfi-answer-open" onClick={() => { setMode('answer'); }}>
          Answer
        </Button>
      ) : null}
      {can.close ? (
        <Button
          icon={CircleCheck}
          loading={close.isPending}
          data-testid="rfi-close"
          onClick={() => {
            close.mutate({ ref: rfi }, { onSuccess: () => { toast.show({ message: `${rfiLabel(rfi.number)} closed` }); }, onError: failed });
          }}
        >
          Close
        </Button>
      ) : null}
      {editable ? (
        <Button variant="quiet" icon={Pencil} data-testid="rfi-edit" onClick={onEdit}>
          Edit
        </Button>
      ) : null}
      {can.send_back ? (
        <Button variant="quiet" icon={Undo2} data-testid="rfi-send-back" onClick={() => { setMode('send_back'); }}>
          Send back
        </Button>
      ) : null}
      {can.void ? (
        <Button variant="quiet" icon={Ban} data-testid="rfi-void" onClick={() => { setMode('void'); }}>
          Void
        </Button>
      ) : null}
    </div>
  );
}
