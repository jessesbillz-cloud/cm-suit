// One review comment as a tight block: its number, sheet · detail · code reference and open / closed on one line, the
// comment, then the design team's answer right under it, and any answer it replaced under that (kept, 0054). The design
// team answers an open comment in place; the official closes it (or opens it again), with Undo.
import { useState } from 'react';
import { Check, MessageSquareReply, RotateCcw, Send } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useCloseComment, useRespondComment } from '../../data/permits.mutations';
import type { PermitComment } from '../../data/permits.types';
import { Button } from '../../ui/Button';
import { FIELD_AREA } from '../../ui/Fields';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';

interface CommentRowProps {
  projectId: string;
  comment: PermitComment;
  canRespond: boolean;
  canManage: boolean;
}

function where(c: PermitComment): string {
  return [c.sheet, c.detail === '' ? '' : `Detail ${c.detail}`, c.code_ref].filter((x) => x !== '').join(' · ');
}

export function CommentRow({ projectId, comment: c, canRespond, canManage }: CommentRowProps) {
  const respond = useRespondComment();
  const close = useCloseComment();
  const toast = useToast();
  const [answering, setAnswering] = useState(false);
  const [text, setText] = useState(c.response ?? '');
  const open = c.status === 'open';
  const earlier = c.earlier_answers ?? [];
  const failed = (e: unknown) => {
    toast.show({ tone: 'error', message: messageOf(e) });
  };

  function setClosed(closed: boolean) {
    close.mutate(
      { projectId, comment: c, closed },
      {
        onSuccess: (row) => {
          toast.show({
            message: closed ? `Comment ${String(c.number)} closed.` : `Comment ${String(c.number)} open again.`,
            action: { label: 'Undo', onClick: () => { close.mutate({ projectId, comment: row, closed: !closed }, { onError: failed }); } },
          });
        },
        onError: failed,
      },
    );
  }

  return (
    <li className="flex flex-col gap-1 py-2" data-testid={`permit-comment-${String(c.number)}`} data-status={c.status}>
      <div className="flex items-center gap-2 text-[13px] leading-5">
        <span className="font-semibold tabular-nums text-ink">{c.number}</span>
        <span className="min-w-0 flex-1 break-words text-ink-2">{where(c)}</span>
        {!answering && canRespond && open ? (
          <Button size="sm" variant="quiet" icon={MessageSquareReply} data-testid="permit-comment-answer" onClick={() => { setAnswering(true); }}>
            {c.response === null ? 'Answer' : 'Edit'}
          </Button>
        ) : null}
        {canManage ? (
          <Button
            size="sm"
            variant="quiet"
            icon={open ? Check : RotateCcw}
            loading={close.isPending}
            data-testid="permit-comment-close"
            onClick={() => {
              setClosed(open);
            }}
          >
            {open ? 'Close' : 'Reopen'}
          </Button>
        ) : null}
        <StatusChip status={open ? 'pending' : 'approved'} label={open ? 'Open' : 'Closed'} />
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">{c.body}</p>
      {c.response !== null && !answering ? (
        <p className="whitespace-pre-wrap break-words rounded-md bg-card-head px-3 py-2 text-sm leading-6 text-ink" data-testid="permit-comment-response-text">
          <span className="font-medium text-ink-2">{c.responded_by_name ?? 'Design team'}: </span>
          {c.response}
        </p>
      ) : null}
      {earlier.length > 0 && !answering ? (
        <ol aria-label="Earlier answers" data-testid="permit-comment-earlier" className="flex flex-col gap-1 border-l-2 border-line pl-3">
          {earlier.map((e, i) => (
            <li key={`${e.at ?? 'answer'}-${String(i)}`} className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ink-2">
              <span className="font-medium">{e.by_name ?? 'Design team'}: </span>
              {e.response}
            </li>
          ))}
        </ol>
      ) : null}
      {answering ? (
        <div className="flex flex-col gap-2">
          <textarea
            rows={3}
            maxLength={4000}
            autoFocus
            aria-label="Answer"
            className={FIELD_AREA}
            value={text}
            data-testid="permit-comment-response"
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="quiet" onClick={() => { setAnswering(false); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={Send}
              loading={respond.isPending}
              disabled={text.trim() === ''}
              data-testid="permit-comment-send"
              onClick={() => {
                respond.mutate({ projectId, comment: c, response: text }, { onSuccess: () => { setAnswering(false); }, onError: failed });
              }}
            >
              Send
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
