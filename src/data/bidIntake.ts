// Office intake of received bids (SPEC §11.6): recording an uploaded file as a receipt, reading one bid (extract-bid,
// then linking the bidder to the sub directory by name), and reading every unread bid a few at a time.
// The database owns receipts and duplicates: record_received_bid returns the same submission for the same file.
import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { matchSub } from '../lib/matchSub';
import { runPool } from '../lib/pool';
import { fetchSubNames } from './bids.queries';
import { readBidResultSchema, type ReadBidResult, type SubmissionRow, type SubName } from './bids.types';
import { supabase } from './client';
import { messageOf, throwIfError } from './errors';
import { callFunction } from './functions';
import { qk } from './keys';
import * as mockBids from './mock/bids';
import { isMock } from './mock';

const READ_PARALLEL = 3;

/** Turns a file in "Bids received" into a receipt for the package. Safe to repeat. */
export async function recordReceivedBid(fileId: string, packageId: string): Promise<{ submissionId: string; receipt: number }> {
  if (isMock()) return mockBids.recordReceived(fileId, packageId);
  const rows = throwIfError(await supabase.rpc('record_received_bid', { p_file_id: fileId, p_package_id: packageId }));
  const row = rows[0];
  if (!row) throw new Error('The bid was not recorded.');
  return { submissionId: row.submission_id, receipt: row.receipt_number };
}

async function setSubmissionSub(submissionId: string, subId: string): Promise<void> {
  if (isMock()) return mockBids.setSub(submissionId, subId);
  throwIfError(await supabase.rpc('set_submission_sub', { p_submission_id: submissionId, p_sub_id: subId }));
}

/**
 * Reads one bid: extract-bid drafts the findings, then an office-recorded bid whose bidder name matches exactly one
 * directory sub is linked to it. A bidder's own submission already names its member and is left alone.
 */
export async function readBid(submission: SubmissionRow, subs: readonly SubName[]): Promise<ReadBidResult> {
  const result = isMock()
    ? await mockBids.extract(submission.id)
    : await callFunction('extract-bid', { submission_id: submission.id }, readBidResultSchema);
  if (submission.member_id === null && submission.sub_id === null) {
    const sub = matchSub(result.findings.bidder_name, subs);
    if (sub) await setSubmissionSub(submission.id, sub.id);
  }
  return result;
}

interface ReadAllProgress {
  done: number;
  total: number;
  failed: number;
  /** The last failure's message, so a whole-batch problem (no access, server down) is not a silent count. */
  lastError: string | null;
}

/** "Read all": every given submission, three at a time. Page-local: leaving the screen stops it. */
export function useReadAll() {
  const [progress, setProgress] = useState<ReadAllProgress | null>(null);
  const running = useRef(false);
  const qc = useQueryClient();

  const start = useCallback(
    async (projectId: string, orgId: string, submissions: readonly SubmissionRow[]) => {
      if (running.current || submissions.length === 0) return;
      running.current = true;
      setProgress({ done: 0, total: submissions.length, failed: 0, lastError: null });
      const advance = (error: unknown) => {
        setProgress((p) =>
          p === null
            ? p
            : { ...p, done: p.done + 1, failed: p.failed + (error === null ? 0 : 1), lastError: error === null ? p.lastError : messageOf(error) },
        );
      };
      // Each finished read refreshes the lists the names and chips come from; the whole bids cache once at the end.
      const refreshRow = () =>
        Promise.all(
          ['extractions', 'submissions', 'received_files'].map((part) =>
            qc.invalidateQueries({ queryKey: qk.bidsPartAll(projectId, part) }),
          ),
        );
      try {
        const subs = await fetchSubNames(orgId);
        await runPool(
          submissions,
          READ_PARALLEL,
          async (s) => {
            await readBid(s, subs);
            advance(null);
            await refreshRow();
          },
          (_s, e) => {
            advance(e);
            void refreshRow();
          },
        );
      } catch (e: unknown) {
        // Nothing ran (the sub directory did not load): say so on the progress line.
        setProgress((p) => (p === null ? p : { ...p, done: p.total, failed: p.total, lastError: messageOf(e) }));
      } finally {
        running.current = false;
        await qc.invalidateQueries({ queryKey: qk.bids(projectId) });
      }
    },
    [qc],
  );

  return { progress, start, isRunning: progress !== null && progress.done < progress.total };
}
