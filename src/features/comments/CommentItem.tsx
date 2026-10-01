// One comment: who (name, company), when (the job's zone), the text, and "Edited" with every earlier text right under
// it as plain text, oldest first. Its author may edit it; nobody can remove it.
import { useState } from 'react';
import type { CommentRow, CommentTarget } from '../../data/comments.types';
import { EditBox } from './CommentBox';
import { commentWhen } from './model';

interface CommentItemProps {
  comment: CommentRow;
  target: CommentTarget;
  tz: string;
  canEdit: boolean;
}

export function CommentItem({ comment, target, tz, canEdit }: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const c = comment;
  const meta = [c.author_company, commentWhen(c.created_at, tz), c.edited_at !== null ? 'Edited' : ''].filter((s) => s !== '');

  return (
    <article data-testid="comment" className="flex flex-col gap-1 py-3">
      <header className="flex items-start gap-3 text-[13px] leading-5">
        <p className="min-w-0 flex-1">
          <span className="font-semibold text-ink">{c.author_name}</span>
          <span data-testid="comment-meta" className="text-ink-3">
            {meta.map((m) => ` · ${m}`).join('')}
          </span>
        </p>
        {canEdit && !editing ? (
          <button
            type="button"
            data-testid="comment-edit"
            className="-my-1.5 -mr-2 shrink-0 rounded px-2 py-1.5 font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => {
              setEditing(true);
            }}
          >
            Edit
          </button>
        ) : null}
      </header>
      {editing ? (
        <EditBox
          comment={c}
          target={target}
          onDone={() => {
            setEditing(false);
          }}
        />
      ) : (
        <p data-testid="comment-body" className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">
          {c.body}
        </p>
      )}
      {c.earlier.length > 0 ? (
        <ol aria-label="Earlier text" data-testid="comment-earlier" className="mt-0.5 flex flex-col gap-1 border-l-2 border-line pl-3">
          {c.earlier.map((e) => (
            <li key={`${e.written_at}-${e.body.length}`} className="text-[13px] leading-5">
              <span className="mr-2 tabular-nums text-ink-3">{commentWhen(e.written_at, tz)}</span>
              <span className="whitespace-pre-wrap break-words text-ink-2">{e.body}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}
