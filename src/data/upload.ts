// THE single uploader (SPEC §6.5, §8.1; CLAUDE.md rule 11). Resumable TUS straight to Supabase Storage.
//   1. register the files row (the database picks the id and the storage path)
//   2. TUS upload to that path, resuming a previous attempt when there is one
//   3. mark upload_complete and queue the virus scan (idempotent: scan_file:<file_id>)
import { Upload } from 'tus-js-client';
import { z } from 'zod';
import { SUPABASE_KEY, SUPABASE_URL, accessToken, supabase } from './client';
import { DataError, throwIfError, throwIfErrorMaybe, toDataError } from './errors';
import * as mock from './mock/api';
import { isMock } from './mock';

const CHUNK_SIZE = 6 * 1024 * 1024; // Supabase requires exactly 6 MiB chunks for resumable uploads.
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

interface UploadArgs {
  file: File;
  projectId: string;
  folderId: string;
  userId: string;
  onProgress: (loaded: number, total: number) => void;
  signal: AbortSignal;
}

const registeredSchema = z.object({
  id: z.string(),
  storage_path: z.string().min(1),
  mime: z.string(),
});
type Registered = z.infer<typeof registeredSchema>;

type LooseRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

/** My own unfinished row for the same file in the same folder: reusing it is what lets a re-picked file resume. */
async function findUnfinished(a: UploadArgs): Promise<Registered | null> {
  return throwIfErrorMaybe(
    await supabase
      .from('files')
      .select('id, storage_path, mime')
      .eq('folder_id', a.folderId)
      .eq('original_name', a.file.name)
      .eq('size', a.file.size)
      .eq('created_by', a.userId)
      .eq('upload_complete', false)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle(),
  );
}

async function registerFile(a: UploadArgs): Promise<Registered> {
  const existing = await findUnfinished(a);
  if (existing) return existing;
  // TODO(lead): register_file(p_folder_id uuid, p_original_name text, p_mime text, p_size bigint) returns public.files
  // is requested in the Phase 0 report. Until it is in the migrations (and so in database.types.ts), call it loosely.
  const rpc = supabase.rpc.bind(supabase) as unknown as LooseRpc;
  const res = await rpc('register_file', {
    p_folder_id: a.folderId,
    p_original_name: a.file.name,
    p_mime: a.file.type || 'application/octet-stream',
    p_size: a.file.size,
  });
  if (res.error) throw toDataError(res.error);
  const row: unknown = Array.isArray(res.data) ? res.data[0] : res.data;
  return registeredSchema.parse(row);
}

function runTus(file: File, reg: Registered, a: UploadArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: RETRY_DELAYS,
      chunkSize: CHUNK_SIZE,
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true,
      headers: { apikey: SUPABASE_KEY, 'x-upsert': 'false' },
      metadata: { bucketName: 'files', objectName: reg.storage_path, contentType: reg.mime, cacheControl: '3600' },
      // One fingerprint per registered path, so a resume can never land a file on another row's path.
      fingerprint: () => Promise.resolve(`files:${reg.storage_path}`),
      // A multi-GB upload can outlive an access token: fetch a fresh one for every request.
      onBeforeRequest: async (req) => {
        req.setHeader('authorization', `Bearer ${await accessToken()}`);
      },
      onProgress: (sent, total) => {
        a.onProgress(sent, total);
      },
      onError: (err) => {
        reject(err);
      },
      onSuccess: () => {
        resolve();
      },
    });
    a.signal.addEventListener(
      'abort',
      () => {
        upload.abort().then(
          () => {
            reject(new DOMException('Upload cancelled', 'AbortError'));
          },
          (e: unknown) => {
            reject(e instanceof Error ? e : new Error('Could not cancel the upload'));
          },
        );
      },
      { once: true },
    );
    upload.findPreviousUploads().then(
      (previous) => {
        const last = previous[0];
        if (last) upload.resumeFromPreviousUpload(last);
        upload.start();
      },
      (e: unknown) => {
        reject(e instanceof Error ? e : new Error('Could not check for an earlier upload'));
      },
    );
  });
}

async function markUploadComplete(fileId: string): Promise<void> {
  const rows = throwIfError(await supabase.from('files').update({ upload_complete: true }).eq('id', fileId).select('id'));
  if (rows.length === 0) throw new DataError('The upload finished but the file could not be saved. Try again.', null, null);
}

async function enqueueScan(fileId: string, projectId: string): Promise<void> {
  throwIfError(
    await supabase.rpc('enqueue_job', {
      p_kind: 'scan_file',
      p_payload: { file_id: fileId },
      p_project_id: projectId,
      p_idempotency_key: `scan_file:${fileId}`,
    }),
  );
}

async function mockUpload(a: UploadArgs): Promise<{ fileId: string }> {
  const total = a.file.size;
  for (let step = 1; step <= 4; step += 1) {
    if (a.signal.aborted) throw new DOMException('Upload cancelled', 'AbortError');
    await new Promise<void>((r) => window.setTimeout(r, 80));
    a.onProgress(Math.round((total * step) / 4), total);
  }
  const row = await mock.addUploadedFile(a.projectId, a.folderId, a.file.name, a.file.type || 'application/octet-stream', total);
  return { fileId: row.id };
}

/** Uploads one file end to end. Rejects with an AbortError DOMException when cancelled through `signal`. */
export async function uploadFile(a: UploadArgs): Promise<{ fileId: string }> {
  if (isMock()) return mockUpload(a);
  const reg = await registerFile(a);
  await runTus(a.file, reg, a);
  await markUploadComplete(reg.id);
  await enqueueScan(reg.id, a.projectId);
  return { fileId: reg.id };
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
