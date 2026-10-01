// Comment reads (migration 0050): an item's comments, through the item's own read gate.
import { useQuery } from '@tanstack/react-query';
import { supabase } from './client';
import { commentListSchema, type CommentList, type CommentTarget } from './comments.types';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockComments from './mock/comments';

async function fetchComments(t: CommentTarget): Promise<CommentList> {
  if (isMock()) return mockComments.list(t);
  const data: unknown = throwIfError(
    await supabase.rpc('comment_list', { p_project_id: t.projectId, p_entity_type: t.entityType, p_entity_id: t.entityId }),
  );
  return commentListSchema.parse(data);
}

/** The item's comments, oldest first, and whether I may add one. */
export function useComments(t: CommentTarget) {
  return useQuery({ queryKey: qk.comments(t.entityType, t.entityId), queryFn: () => fetchComments(t) });
}
