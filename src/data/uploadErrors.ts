// What a failed upload says to a person: one short sentence (CLAUDE.md rules 6 and 15). The TUS client's own error
// (method, url, response text, request id) goes to the console and stays on the DataError as serverMessage; it is
// never shown on a screen.
import { DataError } from './errors';

/** The code on the DataError of a file storage refused as too large. */
const TOO_BIG_CODE = '413';

/** The part of the TUS client's DetailedError this file reads: the response, or null when the request got none. */
interface FromRequest {
  originalResponse?: { getStatus: () => number; getBody: () => string } | null;
}

function fromRequest(e: unknown): e is FromRequest {
  return typeof e === 'object' && e !== null && 'originalResponse' in e;
}

/** The HTTP status storage answered with; 0 when the request got no answer; null when the error is not a request's. */
export function uploadStatus(e: unknown): number | null {
  if (!fromRequest(e)) return null;
  return e.originalResponse?.getStatus() ?? 0;
}

/**
 * Should the uploader try the request again by itself? Never after a refusal (4xx: too large, no access), because
 * the same request gets the same answer; 409 and 423 are a moved offset or a lock, which the next try reads again.
 * The TUS client's own default, pinned here so a size refusal always fails at once.
 */
export function shouldRetryUpload(status: number | null, online: boolean): boolean {
  if (!online) return false;
  const s = status ?? 0;
  return s < 400 || s >= 500 || s === 409 || s === 423;
}

/** The short sentence for an upload storage did not take. The size cap is a server setting: no number is promised. */
export function plainUploadError(e: unknown): DataError {
  const raw = e instanceof Error ? e.message : null;
  const status = uploadStatus(e);
  const body = fromRequest(e) ? (e.originalResponse?.getBody() ?? '') : '';
  if (status === 413 || /maximum size exceeded|maximum allowed size|payload too large|entity too large/i.test(body)) {
    return new DataError('Too big to upload here.', TOO_BIG_CODE, raw);
  }
  if (status === 401 || status === 403) return new DataError("You don't have access to that.", String(status), raw);
  if (status === 0) return new DataError('Connection lost. Try again.', null, raw);
  return new DataError('Upload failed. Try again.', status === null ? null : String(status), raw);
}

/** Storage refused the file as too large: trying again cannot work. */
export function isTooBig(e: unknown): boolean {
  return e instanceof DataError && e.code === TOO_BIG_CODE;
}
