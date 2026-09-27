// Bid read hooks (SPEC §11), manager side. RLS decides what comes back; the UI never reasons about roles.
import { z } from 'zod';
import { skipToken, useQuery } from '@tanstack/react-query';
import { supabase } from './client';
import { throwIfError, throwIfErrorMaybe } from './errors';
import { qk } from './keys';
import * as mockBids from './mock/bids';
import { isMock } from './mock';
import { useMyProjects } from './queries';
import {
  alternatesSchema,
  type AckRow,
  type AddendumRow,
  type CoverageRow,
  type ExtractionRow,
  type ExtractionSummary,
  type InviteRow,
  type PackageRow,
  type PricingAccess,
  type PricingView,
  type QuestionRow,
  type ReceivedFile,
  type SubmissionRow,
  type SubName,
} from './bids.types';

export function useBidCoverage(projectId: string) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'coverage'),
    queryFn: async (): Promise<CoverageRow[]> =>
      isMock() ? mockBids.coverage(projectId) : throwIfError(await supabase.rpc('bid_coverage', { p_project_id: projectId })),
  });
}

export function useBidPackages(projectId: string) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'packages'),
    queryFn: async (): Promise<PackageRow[]> =>
      isMock()
        ? mockBids.packages(projectId)
        : throwIfError(
            await supabase
              .from('bid_packages')
              .select('id, project_id, code, name, scope_text, version')
              .eq('project_id', projectId)
              .is('deleted_at', null)
              .order('code'),
          ),
  });
}

export function useBidInvites(projectId: string) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'invites'),
    queryFn: async (): Promise<InviteRow[]> =>
      isMock()
        ? mockBids.invites()
        : throwIfError(
            await supabase
              .from('bid_invites')
              .select('id, package_id, member_id, status, decline_reason')
              .eq('project_id', projectId)
              .is('deleted_at', null),
          ),
  });
}

export function useBidQuestions(projectId: string) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'questions'),
    queryFn: async (): Promise<QuestionRow[]> =>
      isMock()
        ? mockBids.questions(projectId)
        : throwIfError(
            await supabase
              .from('bid_questions')
              .select('id, project_id, package_id, number, question, status, created_at, version')
              .eq('project_id', projectId)
              .is('deleted_at', null)
              .order('number', { ascending: false }),
          ),
  });
}

export function useAddenda(projectId: string) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'addenda'),
    queryFn: async (): Promise<AddendumRow[]> =>
      isMock()
        ? mockBids.addenda(projectId)
        : throwIfError(
            await supabase
              .from('addenda')
              .select('id, project_id, number, title, body, file_ids, issued_at, version')
              .eq('project_id', projectId)
              .is('deleted_at', null)
              .order('number', { ascending: false }),
          ),
  });
}

export function useAddendumAcks(projectId: string) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'acks'),
    queryFn: async (): Promise<AckRow[]> =>
      isMock()
        ? mockBids.acks()
        : throwIfError(await supabase.from('addendum_acks').select('addendum_id, member_id').eq('project_id', projectId)),
  });
}

/** The sealed-bid gate: false until bid time when the job is sealed. */
export function useBidsOpen(projectId: string) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'open'),
    queryFn: async () => (isMock() ? true : throwIfError(await supabase.rpc('bids_open', { p_project_id: projectId }))),
    staleTime: 60_000,
  });
}

/** Current (not superseded) submissions, newest first. Only asked for once bids are open. */
export function useBidSubmissions(projectId: string, open: boolean) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'submissions'),
    queryFn: open
      ? async (): Promise<SubmissionRow[]> =>
          isMock()
            ? mockBids.submissions(projectId)
            : throwIfError(
                await supabase
                  .from('bid_submissions')
                  .select('id, package_id, member_id, sub_id, file_id, receipt_number, received_at, is_late, version_no')
                  .eq('project_id', projectId)
                  .is('superseded_by', null)
                  .is('deleted_at', null)
                  .order('received_at', { ascending: false }),
              )
      : skipToken,
  });
}

/** Every extraction on the job, for the received list's names and read chips (RLS: findings readers at aal2). */
export function useBidExtractions(projectId: string, open: boolean) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'extractions'),
    queryFn: open
      ? async (): Promise<ExtractionSummary[]> =>
          isMock()
            ? mockBids.extractions(projectId)
            : throwIfError(
                await supabase.from('bid_extractions').select('id, submission_id, status, bidder_name').eq('project_id', projectId),
              )
      : skipToken,
  });
}

/** The files in the job's "Bids received" folder (pricing roles at aal2; a bidder's own file through created_by). */
export function useReceivedFiles(projectId: string, folderId: string | null) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'received_files', folderId ?? ''),
    queryFn:
      folderId !== null
        ? async (): Promise<ReceivedFile[]> =>
            isMock()
              ? mockBids.receivedFiles(folderId)
              : throwIfError(
                  await supabase
                    .from('files')
                    .select('id, original_name, size, text_status, upload_complete')
                    .eq('folder_id', folderId)
                    .is('deleted_at', null)
                    .is('superseded_by', null),
                )
        : skipToken,
  });
}

/** The org's sub directory, names only: what a read bid is matched against. */
export async function fetchSubNames(orgId: string): Promise<SubName[]> {
  if (isMock()) return mockBids.subNames();
  return throwIfError(await supabase.from('subs').select('id, company').eq('org_id', orgId).is('deleted_at', null).order('company'));
}

export function useSubNames(orgId: string | null) {
  return useQuery({
    queryKey: ['subs', orgId ?? '', 'names'] as const,
    queryFn: orgId !== null ? () => fetchSubNames(orgId) : skipToken,
    staleTime: 60_000,
  });
}

const EXTRACTION_COLS =
  'id, submission_id, status, bidder_name, bid_date, document_kind, prevailing_wage, prevailing_wage_evidence, validity_days, scope_summary, inclusions, exclusions, notable_terms, project_match, confidence, version';

export function useBidExtraction(projectId: string, submissionId: string) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'extraction', submissionId),
    queryFn: async (): Promise<ExtractionRow | null> =>
      isMock()
        ? mockBids.extraction(submissionId)
        : throwIfErrorMaybe(await supabase.from('bid_extractions').select(EXTRACTION_COLS).eq('submission_id', submissionId).maybeSingle()),
  });
}

/** yes / two_factor / no for one aal2-gated capability (bids.view_pricing, bids.view_ai_findings). */
async function fetchAccess(projectId: string, role: string, cap: string): Promise<PricingAccess> {
  if (isMock()) return mockBids.access(cap);
  const can = throwIfError(await supabase.rpc('has_capability', { p_project_id: projectId, p_cap: cap }));
  if (can) return 'yes';
  // Not granted: is it the role, or only the missing second factor? role_permissions is data, not code.
  const row: unknown = throwIfErrorMaybe(
    await supabase.from('role_permissions').select('requires_aal2').eq('role', role).eq('capability', cap).maybeSingle(),
  );
  const parsed = z.object({ requires_aal2: z.boolean() }).nullable().parse(row);
  return parsed?.requires_aal2 === true ? 'two_factor' : 'no';
}

function useAccess(projectId: string, cap: string) {
  const projects = useMyProjects();
  const role = projects.data?.find((p) => p.project_id === projectId)?.role;
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'access', cap),
    queryFn: role !== undefined ? () => fetchAccess(projectId, role, cap) : skipToken,
    staleTime: 60_000,
  });
}

export function usePricingAccess(projectId: string) {
  return useAccess(projectId, 'bids.view_pricing');
}

/** Reading bids (AI findings) is aal2-gated like pricing: same three answers, same one-liner when two_factor. */
export function useFindingsAccess(projectId: string) {
  return useAccess(projectId, 'bids.view_ai_findings');
}

async function fetchPricing(extractionId: string): Promise<PricingView | null> {
  if (isMock()) return null;
  const raw: unknown = throwIfErrorMaybe(
    await supabase
      .from('bid_extraction_pricing')
      .select('base_amount, base_evidence, base_page, alternates')
      .eq('extraction_id', extractionId)
      .maybeSingle(),
  );
  if (raw === null) return null;
  const row = z
    .object({ base_amount: z.number().nullable(), base_evidence: z.string().nullable(), base_page: z.number().nullable(), alternates: z.unknown() })
    .parse(raw);
  return { ...row, alternates: alternatesSchema.parse(row.alternates) };
}

/** Money: RLS returns nothing without bids.view_pricing at aal2, so this is asked only when access is 'yes'. */
export function useBidPricing(projectId: string, extractionId: string | null, allowed: boolean) {
  return useQuery({
    queryKey: qk.bidsPart(projectId, 'pricing', extractionId ?? ''),
    queryFn: allowed && extractionId !== null ? () => fetchPricing(extractionId) : skipToken,
  });
}
