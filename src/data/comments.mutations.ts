// Comment writes (migration 0050), each an RPC run as me: add (safe to repeat with its key) and edit (my own, version
// checked; the earlier text stays). Nothing deletes a comment. Afterwards the item's comments and the board refresh.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import type { CommentTarget } from './comments.types';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockComments from './mock/comments';

interface AddInput {
  body: string;
  /** Made once per comment being written: a repeat of the same send adds nothing. */
  key: string;
}

interface EditInput {
  id: string;
  version: number;
  body: string;
}

function useRefresh(t: CommentTarget) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.comments(t.entityType, t.entityId) }),
      qc.invalidateQueries({ queryKey: qk.board(t.projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(null) }),
    ]);
}

async function add(t: CommentTarget, v: AddInput): Promise<void> {
  if (isMock()) {
    await mockComments.add(t, v.body, v.key);
    return;
  }
  throwIfError(
    await supabase.rpc('add_comment', {
      p_project_id: t.projectId,
      p_entity_type: t.entityType,
      p_entity_id: t.entityId,
      p_body: v.body.trim(),
      p_key: v.key,
    }),
  );
}

async function edit(v: EditInput): Promise<void> {
  if (isMock()) {
    await mockComments.edit(v.id, v.version, v.body);
    return;
  }
  throwIfError(await supabase.rpc('edit_comment', { p_comment_id: v.id, p_version: v.version, p_body: v.body.trim() }));
}

export function useAddComment(t: CommentTarget) {
  const refresh = useRefresh(t);
  return useMutation({ mutationFn: (v: AddInput) => add(t, v), onSettled: refresh });
}

export function useEditComment(t: CommentTarget) {
  const refresh = useRefresh(t);
  return useMutation({ mutationFn: edit, onSettled: refresh });
}
