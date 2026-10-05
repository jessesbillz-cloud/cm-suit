// The office drop (SPEC §11.6): each dropped file either uploads straight away with the package guessed from its
// name, waits for a package pick, or is skipped because the same file (name + size) is already in "Bids received".
// Uploads go through the one queue with a record step, so progress survives leaving the screen.
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { recordReceivedBid } from '../../data/bidIntake';
import type { PackageRow, ReceivedFile, SubmissionRow } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { qk } from '../../data/keys';
import { useUploadQueue, type AfterUpload } from '../../data/UploadQueue';
import { guessPackage } from '../../lib/guessPackage';
import { useToast } from '../../ui/Toast';

export interface PendingPick {
  key: string;
  name: string;
  /** The dropped file, or null when a stored copy (existingFileId) is recorded without uploading again. */
  file: File | null;
  existingFileId: string | null;
}

interface IntakeArgs {
  projectId: string;
  folderId: string | null;
  packages: PackageRow[] | undefined;
  files: ReceivedFile[] | undefined;
  submissions: SubmissionRow[] | undefined;
}

const fileKey = (name: string, size: number) => `${name}\u0000${String(size)}`;

export function useIntake(a: IntakeArgs) {
  const queue = useUploadQueue();
  const qc = useQueryClient();
  const toast = useToast();
  const [picks, setPicks] = useState<PendingPick[]>([]);
  const { projectId, folderId, packages, files, submissions } = a;

  const record = useCallback(
    async (fileId: string, packageId: string): Promise<string> => {
      const r = await recordReceivedBid(fileId, packageId);
      // The lists this bid shows in: Received, Coverage, the leveling board and its flags (Leveling, Summary), the pipeline.
      await Promise.all([
        ...['submissions', 'received_files', 'coverage', 'leveling_board', 'flags'].map((part) =>
          qc.invalidateQueries({ queryKey: qk.bidsPartAll(projectId, part) }),
        ),
        qc.invalidateQueries({ queryKey: qk.bidPipeline }),
      ]);
      return `Received #${String(r.receipt)}`;
    },
    [qc, projectId],
  );

  const start = useCallback(
    (p: PendingPick, packageId: string) => {
      if (folderId === null) return;
      if (p.file) {
        const after: AfterUpload = (fileId) => record(fileId, packageId);
        queue.enqueue([p.file], projectId, folderId, after);
      } else if (p.existingFileId !== null) {
        record(p.existingFileId, packageId).catch((e: unknown) => {
          toast.show({ tone: 'error', message: `${p.name} not recorded: ${messageOf(e)}` });
        });
      }
    },
    [folderId, projectId, queue, record, toast],
  );

  const add = useCallback(
    (picked: File[]) => {
      if (folderId === null || !packages || !files || !submissions) return;
      const seen = new Set<string>();
      for (const i of queue.items) {
        if (i.folderId === folderId && i.status !== 'failed' && i.status !== 'cancelled') seen.add(fileKey(i.name, i.size));
      }
      for (const p of picks) seen.add(p.key);
      const waiting: PendingPick[] = [];
      let already = 0;
      for (const f of picked) {
        const key = fileKey(f.name, f.size);
        if (seen.has(key)) continue;
        seen.add(key);
        const stored = files.find((x) => x.original_name === f.name && x.size === f.size && x.upload_complete);
        if (stored && submissions.some((s) => s.file_id === stored.id)) {
          already += 1;
          continue;
        }
        const pending: PendingPick = { key, name: f.name, file: stored ? null : f, existingFileId: stored?.id ?? null };
        const packageId = guessPackage(f.name, packages);
        if (packageId === null) waiting.push(pending);
        else start(pending, packageId);
      }
      if (waiting.length > 0) setPicks((list) => [...list, ...waiting]);
      if (already > 0) toast.show({ message: `${String(already)} already received` });
    },
    [folderId, packages, files, submissions, queue.items, picks, start, toast],
  );

  const pick = useCallback(
    (key: string, packageId: string) => {
      const p = picks.find((x) => x.key === key);
      if (!p) return;
      setPicks((list) => list.filter((x) => x.key !== key));
      start(p, packageId);
    },
    [picks, start],
  );

  return { picks, add, pick, ready: folderId !== null && packages !== undefined && files !== undefined && submissions !== undefined };
}
