// THE single uploader (SPEC §6.5, §8.1; CLAUDE.md rule 11). Resumable TUS straight to Supabase Storage.
//   1. register the files row (the database picks the id and the storage path)
//   2. TUS upload to that path, resuming a previous attempt when there is one
//   3. mark upload_complete and queue the virus scan (idempotent: scan_file:<file_id>)
// A row whose upload never finishes (storage refused it, the person stopped it) is taken back with
// removeUnfinishedUpload, or reused when the same file is picked again (findUnfinished).
import { z } from 'zod';
import { SUPABASE_KEY, SUPABASE_URL, accessToken, supabase } from './client';
import { DataError, throwIfError, throwIfErrorMaybe, toDataError } from './errors';
import * as mock from './mock/api';
import { isMock } from './mock';
import { plainUploadError, shouldRetryUpload, uploadStatus } from './uploadErrors';

const CHUNK_SIZE = 6 * 1024 * 1024; // Supabase requires exactly 6 MiB chunks for resumable uploads.
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

interface UploadArgs {
  file: File;
  projectId: string;
  folderId: string;
  userId: string;
  onProgress: (loaded: number, total: number) => void;
  signal: AbortSignal;
  /** Told the files row's id as soon as it is registered, before any bytes go up (what Remove takes back). */
  onRegistered?: ((fileId: string) => void) | undefined;
}

function abortError(): DOMException {
  return new DOMException('Upload cancelled', 'AbortError');
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

async function runTus(file: File, reg: Registered, a: UploadArgs): Promise<void> {
  // The TUS client loads with the first upload, not with the app.
  const { Upload } = await import('tus-js-client');
  return new Promise((resolve, reject) => {
    // Stopped before the first byte: an abort that already happened fires no event.
    if (a.signal.aborted) {
      reject(abortError());
      return;
    }
    const upload = new Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: RETRY_DELAYS,
      // A refusal (too large, no access) fails at once: the same request would get the same answer.
      onShouldRetry: (err) => shouldRetryUpload(uploadStatus(err), window.navigator.onLine),
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
        // The TUS client's full error (method, url, response, request id) is for the console; people get a sentence.
        console.warn('upload failed', err);
        reject(plainUploadError(err));
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
            reject(abortError());
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
        // Stopped while looking: start() would clear the client's own aborted flag and upload anyway.
        if (a.signal.aborted) return;
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

/** The same three steps against the mock: an unfinished row, the bytes (refused over the mock's cap), then complete. */
async function mockUpload(a: UploadArgs): Promise<{ fileId: string }> {
  const total = a.file.size;
  const reg = await mock.registerUpload(a.projectId, a.folderId, a.file.name, a.file.type || 'application/octet-stream', total);
  a.onRegistered?.(reg.id);
  if (total > mock.MOCK_STORAGE_CAP) {
    const refusal = { getStatus: () => 413, getBody: () => 'Maximum size exceeded' };
    throw plainUploadError(Object.assign(new Error('mock storage: response code: 413'), { originalResponse: refusal }));
  }
  // A bigger file takes longer, so there is time to stop it.
  const wait = 80 + Math.min(1500, Math.round(total / 8192));
  for (let step = 1; step <= 4; step += 1) {
    if (a.signal.aborted) throw abortError();
    await new Promise<void>((r) => window.setTimeout(r, wait));
    a.onProgress(Math.round((total * step) / 4), total);
  }
  if (a.signal.aborted) throw abortError();
  await mock.completeUpload(reg.id);
  return { fileId: reg.id };
}

/** Uploads one file end to end. Rejects with an AbortError DOMException when cancelled through `signal`. */
export async function uploadFile(a: UploadArgs): Promise<{ fileId: string }> {
  if (isMock()) return mockUpload(a);
  const reg = await registerFile(a);
  a.onRegistered?.(reg.id);
  await runTus(a.file, reg, a);
  await markUploadComplete(reg.id);
  await enqueueScan(reg.id, a.projectId);
  return { fileId: reg.id };
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/**
 * Takes back the files row of an upload that never finished (remove_unfinished_upload): the caller's own row only,
 * never a finished file, safe to repeat. The same file picked again then registers a new row and starts clean.
 */
export async function removeUnfinishedUpload(fileId: string): Promise<void> {
  if (isMock()) return mock.removeUnfinishedUpload(fileId);
  throwIfErrorMaybe(await supabase.rpc('remove_unfinished_upload', { p_file_id: fileId }));
}
