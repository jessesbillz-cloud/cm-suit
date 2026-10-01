// Writing comments: the one-line box with Send under the list, and the box that replaces a comment's text while its
// author edits it. Sending twice by accident adds one comment (the key); an edit keeps the earlier text (database).
import { useState } from 'react';
import { useAddComment, useEditComment } from '../../data/comments.mutations';
import { COMMENT_MAX, type CommentRow, type CommentTarget } from '../../data/comments.types';
import { messageOf } from '../../data/errors';
import { Button } from '../../ui/Button';
import { FIELD_AREA, FIELD_CONTROL } from '../../ui/Fields';
import { useToast } from '../../ui/Toast';

interface CommentBoxProps {
  target: CommentTarget;
}

export function CommentBox({ target }: CommentBoxProps) {
  const add = useAddComment(target);
  const toast = useToast();
  const [text, setText] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const empty = text.trim() === '';

  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (empty || add.isPending) return;
        add.mutate(
          { body: text, key },
          {
            onSuccess: () => {
              setText('');
              setKey(crypto.randomUUID());
            },
            onError: (err) => {
              toast.show({ tone: 'error', message: `Not sent: ${messageOf(err)}` });
            },
          },
        );
      }}
    >
      <input
        type="text"
        aria-label="Comment"
        placeholder="Add a comment"
        autoComplete="off"
        maxLength={COMMENT_MAX}
        data-testid="comment-input"
        className={`${FIELD_CONTROL} min-w-0 flex-1`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <Button type="submit" variant="primary" loading={add.isPending} disabled={empty} data-testid="comment-send">
        Send
      </Button>
    </form>
  );
}

interface EditBoxProps {
  comment: CommentRow;
  target: CommentTarget;
  onDone: () => void;
}

export function EditBox({ comment, target, onDone }: EditBoxProps) {
  const edit = useEditComment(target);
  const toast = useToast();
  const [text, setText] = useState(comment.body);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() === '' || edit.isPending) return;
        edit.mutate(
          { id: comment.id, version: comment.version, body: text },
          {
            onSuccess: onDone,
            onError: (err) => {
              toast.show({ tone: 'error', message: `Not saved: ${messageOf(err)}` });
            },
          },
        );
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onDone();
      }}
    >
      <textarea
        aria-label="Comment"
        rows={3}
        maxLength={COMMENT_MAX}
        autoFocus
        data-testid="comment-edit-input"
        className={`${FIELD_AREA} w-full`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="quiet" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary" loading={edit.isPending} disabled={text.trim() === ''} data-testid="comment-save">
          Save
        </Button>
      </div>
    </form>
  );
}
