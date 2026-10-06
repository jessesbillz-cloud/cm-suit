// Comments under an item in its full view (expanded, its own window, or the phone; never the right-column preview).
// A permanent record (migration 0050): oldest first, edits keep the earlier text, nothing deletes. Whoever may write
// comments and read the item reads them (0054); for anyone else (a bidder, a viewer) there is no section at all.
import type { UseQueryResult } from '@tanstack/react-query';
import { useComments } from '../../data/comments.queries';
import type { CommentList, CommentTarget } from '../../data/comments.types';
import { ErrorState, LoadingState } from '../../ui/States';
import { useProjectZones } from '../board/zones';
import { CommentBox } from './CommentBox';
import { CommentItem } from './CommentItem';

interface CommentsPanelProps {
  target: CommentTarget;
}

interface BodyProps {
  q: UseQueryResult<CommentList>;
  target: CommentTarget;
  tz: string;
}

function CommentsBody({ q, target, tz }: BodyProps) {
  if (q.isPending) return <LoadingState label="Loading comments" />;
  if (q.isError) return <ErrorState error={q.error} title="Comments did not load." className="m-0" onRetry={() => void q.refetch()} />;
  const { comments, can_write: canWrite } = q.data;
  return (
    <>
      {comments.length === 0 ? (
        <p data-testid="comments-empty" className="py-1 text-sm text-ink-3">
          No comments yet.
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentItem comment={c} target={target} tz={tz} canEdit={canWrite && c.mine} />
            </li>
          ))}
        </ol>
      )}
      {canWrite ? <CommentBox target={target} /> : null}
    </>
  );
}

export function CommentsPanel({ target }: CommentsPanelProps) {
  const q = useComments(target);
  const zoneOf = useProjectZones();
  const count = q.data?.comments.length ?? 0;
  if (q.data?.can_read === false) return null;

  return (
    <section aria-label="Comments" data-testid="comments" className="border-t border-line bg-card px-5 pb-5 pt-4">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase leading-4 tracking-[0.06em] text-ink">
        Comments
        {count > 0 ? (
          <span data-testid="comments-count" className="tabular-nums text-ink-2">
            {count}
          </span>
        ) : null}
      </h2>
      <div className="mt-1">
        <CommentsBody q={q} target={target} tz={zoneOf(target.projectId)} />
      </div>
    </section>
  );
}
