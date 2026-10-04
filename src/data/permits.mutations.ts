// Permit writes (migrations 0052, 0061). Every write is its own RPC run as me, version-checked where it takes one;
// repeats are safe (a new permit, review, backcheck or comment carries the form's key; the same move again is a
// no-op). After each write the permit queries, the board and the calendar (an issued permit's expiry) refresh; linking
// an inspection refreshes the job's inspections too.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError } from './errors';
import { qk } from './keys';
import { isMock } from './mock';
import * as mockReviews from './mock/permitReviews';
import * as mockPermits from './mock/permits';
import {
  permitCommentSchema,
  permitReviewSchema,
  permitRowSchema,
  type NewPermitInput,
  type PermitComment,
  type PermitEdit,
  type PermitRef,
  type PermitReview,
  type PermitRow,
} from './permits.types';

/** A SQL null for an argument the generated types call required (PostgREST passes JSON null through). */
function sqlNull<T>(v: T | null): T {
  return v as T;
}

function one(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

function useRefresh() {
  const qc = useQueryClient();
  return (projectId: string, inspections = false) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.permits }),
      qc.invalidateQueries({ queryKey: qk.board(projectId) }),
      qc.invalidateQueries({ queryKey: qk.board(null) }),
      qc.invalidateQueries({ queryKey: qk.calendar }),
      ...(inspections ? [qc.invalidateQueries({ queryKey: qk.inspections(projectId) })] : []),
    ]);
}

function cleanNumbers(numbers: readonly string[]): string[] {
  return numbers.map((n) => n.trim()).filter((n) => n !== '');
}

/** A new permit (permits.manage). The form's key makes a repeated save return the same permit. */
export function useCreatePermit() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: NewPermitInput): Promise<PermitRow> => {
      if (isMock()) return mockPermits.create(v);
      const data = throwIfError(
        await supabase.rpc('permit_create', {
          p_project_id: v.projectId,
          p_primary_number: v.primaryNumber.trim(),
          p_title: v.title.trim(),
          p_kind: v.kind,
          p_agency_numbers: cleanNumbers(v.otherNumbers),
          ...(v.assignedTo === null ? {} : { p_assigned_to: v.assignedTo }),
          p_notes: v.notes.trim(),
          p_stage: v.stage,
          p_key: v.key,
        }),
      );
      return permitRowSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** The official edits the typed fields, the issue dates and extensions (the whole set each time). */
export function useUpdatePermit() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { ref: PermitRef; edit: PermitEdit }): Promise<PermitRow> => {
      if (isMock()) return mockPermits.update(v.ref, v.edit);
      const e = v.edit;
      const data = throwIfError(
        await supabase.rpc('permit_update', {
          p_permit_id: v.ref.id,
          p_version: v.ref.version,
          p_primary_number: e.primaryNumber.trim(),
          p_title: e.title.trim(),
          p_kind: e.kind,
          p_agency_numbers: cleanNumbers(e.otherNumbers),
          p_assigned_to: sqlNull(e.assignedTo),
          p_issued_on: sqlNull(e.issuedOn),
          p_expires_on: sqlNull(e.expiresOn),
          p_extensions: e.extensions,
          p_notes: e.notes.trim(),
        }),
      );
      return permitRowSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.ref.project_id),
  });
}

/** Moves it to one of the stages permit_detail.moves offers. */
export function useMovePermit() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { ref: PermitRef; stage: string }): Promise<PermitRow> => {
      if (isMock()) return mockPermits.move(v.ref, v.stage);
      const data = throwIfError(
        await supabase.rpc('permit_move', { p_permit_id: v.ref.id, p_version: v.ref.version, p_stage: v.stage }),
      );
      return permitRowSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.ref.project_id),
  });
}

/** Undo: my own last move, within 15 minutes. */
export function useUndoMove() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (ref: PermitRef): Promise<PermitRow> => {
      if (isMock()) return mockPermits.undoMove(ref);
      const data = throwIfError(await supabase.rpc('permit_undo_move', { p_permit_id: ref.id, p_version: ref.version }));
      return permitRowSchema.parse(one(data));
    },
    onSettled: (_r, _e, ref) => refresh(ref.project_id),
  });
}

/** A new review of the permit, numbered by the database: its kind (initial, a deferred item, an addendum, a change order). */
export function useOpenReview() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; permitId: string; kind: string; key: string }): Promise<PermitReview> => {
      if (isMock()) return mockReviews.reviewOpen(v.permitId, v.kind, v.key);
      const data = throwIfError(
        await supabase.rpc('permit_review_open', { p_permit_id: v.permitId, p_kind: v.kind, p_key: v.key }),
      );
      return permitReviewSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** The next backcheck of the review a cycle belongs to (once none of its cycles is open). */
export function useBackcheckReview() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; reviewId: string; key: string }): Promise<PermitReview> => {
      if (isMock()) return mockReviews.reviewBackcheck(v.reviewId, v.key);
      const data = throwIfError(await supabase.rpc('permit_review_backcheck', { p_review_id: v.reviewId, p_key: v.key }));
      return permitReviewSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** Closes a review with its outcome; null opens it again (the Undo). */
export function useCloseReview() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; review: Pick<PermitReview, 'id' | 'version'>; outcome: string | null }) => {
      if (isMock()) return mockReviews.reviewClose(v.review.id, v.review.version, v.outcome);
      const data = throwIfError(
        await supabase.rpc('permit_review_close', {
          p_review_id: v.review.id,
          p_version: v.review.version,
          p_outcome: sqlNull(v.outcome),
        }),
      );
      return permitReviewSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

interface NewComment {
  projectId: string;
  reviewId: string;
  body: string;
  sheet: string;
  detail: string;
  codeRef: string;
  key: string;
}

/** The official's comment on the open review; the database numbers it. */
export function useAddComment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: NewComment): Promise<PermitComment> => {
      if (isMock()) return mockReviews.commentAdd(v);
      const data = throwIfError(
        await supabase.rpc('permit_comment_add', {
          p_review_id: v.reviewId,
          p_body: v.body.trim(),
          p_sheet: v.sheet.trim(),
          p_detail: v.detail.trim(),
          p_code_ref: v.codeRef.trim(),
          p_key: v.key,
        }),
      );
      return permitCommentSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

type CommentRef = Pick<PermitComment, 'id' | 'version'>;

/** The design team's answer to an open comment. */
export function useRespondComment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; comment: CommentRef; response: string }): Promise<PermitComment> => {
      if (isMock()) return mockReviews.commentRespond(v.comment.id, v.comment.version, v.response);
      const data = throwIfError(
        await supabase.rpc('permit_comment_respond', {
          p_comment_id: v.comment.id,
          p_version: v.comment.version,
          p_response: v.response.trim(),
        }),
      );
      return permitCommentSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** The official closes a comment, or opens it again. */
export function useCloseComment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; comment: CommentRef; closed: boolean }): Promise<PermitComment> => {
      if (isMock()) return mockReviews.commentClose(v.comment.id, v.comment.version, v.closed);
      const data = throwIfError(
        await supabase.rpc('permit_comment_close', {
          p_comment_id: v.comment.id,
          p_version: v.comment.version,
          p_closed: v.closed,
        }),
      );
      return permitCommentSchema.parse(one(data));
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/** Names the permit an inspection request is for (or none). */
export function useLinkInspection() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (v: { projectId: string; requestId: string; version: number; permitId: string | null }): Promise<void> => {
      if (isMock()) {
        await mockReviews.setRequestPermit(v.requestId, v.version, v.permitId);
        return;
      }
      throwIfError(
        await supabase.rpc('set_request_permit', {
          p_request_id: v.requestId,
          p_version: v.version,
          p_permit_id: sqlNull(v.permitId),
        }),
      );
    },
    onSettled: (_r, _e, v) => refresh(v.projectId, true),
  });
}
