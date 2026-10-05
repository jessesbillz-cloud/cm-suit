// Bid write hooks, manager side (SPEC §11.2–11.6). Saves carry a version check; every write refreshes the job's
// bid queries and the pipeline (bidsCache). Addendum writes are in ./addenda.
import { useMutation } from '@tanstack/react-query';
import { useUser } from './auth';
import { readBid } from './bidIntake';
import { useDropFromList, usePutInList, useRefreshBids } from './bidsCache';
import { fetchSubNames } from './bids.queries';
import { supabase } from './client';
import { conflictError, throwIfError } from './errors';
import { callFunction } from './functions';
import * as mockBids from './mock/bids';
import { isMock } from './mock';
import * as mockPackages from './mock/packages';
import * as mockQuestions from './mock/questions';
import {
  inviteBiddersResultSchema,
  type ExtractionRow,
  type FindingsEdits,
  type InviteBiddersInput,
  type InviteBiddersResult,
  type LevelingPatch,
  type LevelingSaved,
  type PackageRow,
  type QuestionRow,
  type SubmissionRow,
} from './bids.types';

export function useInviteBidders() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: (input: InviteBiddersInput): Promise<InviteBiddersResult> =>
      isMock() ? mockBids.inviteBidders(input) : callFunction('invite-bidders', input, inviteBiddersResultSchema),
    onSettled: (_r, _e, input) => refresh(input.project_id),
  });
}

const PACKAGE_COLS = 'id, project_id, code, name, scope_text, spec_sections, version';

interface NewPackage {
  projectId: string;
  orgId: string;
  code: string;
  name: string;
  scopeText: string;
  specSections: readonly string[];
}

export function useAddPackage() {
  const refresh = useRefreshBids();
  const put = usePutInList();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: NewPackage): Promise<PackageRow> => {
      if (isMock()) return mockPackages.add(v);
      return throwIfError(
        await supabase
          .from('bid_packages')
          .insert({
            org_id: v.orgId,
            project_id: v.projectId,
            code: v.code,
            name: v.name,
            scope_text: v.scopeText,
            spec_sections: [...v.specSections],
            created_by: user.id,
          })
          .select(PACKAGE_COLS)
          .single(),
      );
    },
    onSuccess: (row) => {
      put('packages', row);
      return refresh(row.project_id);
    },
  });
}

export type PackagePatch = Pick<PackageRow, 'code' | 'name' | 'scope_text' | 'spec_sections'>;

export function useSavePackage() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: async (v: { row: PackageRow; patch: PackagePatch }): Promise<PackageRow> => {
      if (isMock()) return mockPackages.save(v.row, v.patch);
      const rows = throwIfError(
        await supabase.from('bid_packages').update(v.patch).eq('id', v.row.id).eq('version', v.row.version).select(PACKAGE_COLS),
      );
      const row = rows[0];
      if (!row) throw conflictError();
      return row;
    },
    onSettled: (_r, _e, v) => refresh(v.row.project_id),
  });
}

/** Remove a package nothing was sent or received on (or bring it back). Returns the new version, which Undo sends. */
export function useRemovePackage() {
  const refresh = useRefreshBids();
  const drop = useDropFromList();
  return useMutation({
    mutationFn: async (v: { row: PackageRow; version: number; removed: boolean }): Promise<number> =>
      isMock()
        ? mockPackages.setRemoved(v.row, v.version, v.removed)
        : throwIfError(await supabase.rpc('set_bid_package_removed', { p_package_id: v.row.id, p_version: v.version, p_removed: v.removed })),
    onSuccess: (_n, v) => {
      if (v.removed) drop(v.row.project_id, 'packages', v.row.id);
    },
    onSettled: (_r, _e, v) => refresh(v.row.project_id),
  });
}

/** Publishes (or replaces, when answering again) the anonymized answer to a question. */
export function useAnswerQuestion() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: async (v: { question: QuestionRow; questionText: string; answer: string; packageOnly: boolean }) => {
      if (isMock()) return mockQuestions.publish(v.question, v.questionText, v.answer);
      throwIfError(
        await supabase.rpc('answer_bid_question', {
          p_question_id: v.question.id,
          p_question_text: v.questionText,
          p_answer: v.answer,
          p_package_only: v.packageOnly,
        }),
      );
    },
    onSettled: (_r, _e, v) => refresh(v.question.project_id),
  });
}

/** Dismiss a question, or open it again (a dismissed one, or an answered one to answer again). */
export function useSetQuestionStatus() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: async (v: { question: QuestionRow; status: 'dismissed' | 'open' }) => {
      if (isMock()) return mockQuestions.setStatus(v.question, v.status);
      const rows = throwIfError(
        await supabase.from('bid_questions').update({ status: v.status }).eq('id', v.question.id).eq('version', v.question.version).select('id'),
      );
      if (rows.length === 0) throw conflictError();
    },
    onSettled: (_r, _e, v) => refresh(v.question.project_id),
  });
}

/** Reads one bid (extract-bid) and links an office-recorded one to its directory sub when the name matches. */
export function useExtractBid() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: async (v: { projectId: string; orgId: string; submission: SubmissionRow }) => readBid(v.submission, await fetchSubNames(v.orgId)),
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

interface LevelingWrite {
  projectId: string;
  submissionId: string;
  /** The leveling row's version as the board showed it; null (no row yet) is sent as 0. */
  version: number | null;
  patch: LevelingPatch;
}

/**
 * One leveling decision (SPEC §11.6): not comparable, duplicate, backup, move to a package, note. The database
 * makes or updates the bid_leveling row with a version check and returns it; the caller's Undo sends the inverse
 * with the returned version.
 */
export function useSetLeveling() {
  const refresh = useRefreshBids();
  return useMutation({
    mutationFn: async (v: LevelingWrite): Promise<LevelingSaved> => {
      if (isMock()) mockBids.notInMock();
      return throwIfError(
        await supabase.rpc('set_bid_leveling', { p_submission_id: v.submissionId, p_version: v.version ?? 0, p_patch: v.patch }),
      );
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}

/**
 * Confirm the findings (SPEC §11.6, rule 12: the AI drafts, a person confirms), with the person's corrections. The
 * money goes to the pricing row first (pricing roles only, when edited); then the findings and the confirmation in one
 * versioned write, so a stale screen confirms nothing.
 */
export function useConfirmExtraction() {
  const refresh = useRefreshBids();
  const user = useUser();
  return useMutation({
    mutationFn: async (v: { projectId: string; x: ExtractionRow; edits: FindingsEdits }) => {
      if (isMock()) mockBids.notInMock();
      const { base_amount: base, ...findings } = v.edits;
      if (base !== undefined) {
        const priced = throwIfError(
          await supabase.from('bid_extraction_pricing').update({ base_amount: base }).eq('extraction_id', v.x.id).select('extraction_id'),
        );
        if (priced.length === 0) throw conflictError();
      }
      const rows = throwIfError(
        await supabase
          .from('bid_extractions')
          .update({ ...findings, status: 'confirmed', confirmed_by: user.id, confirmed_at: new Date().toISOString() })
          .eq('id', v.x.id)
          .eq('version', v.x.version)
          .select('id'),
      );
      if (rows.length === 0) throw conflictError();
    },
    onSettled: (_r, _e, v) => refresh(v.projectId),
  });
}
