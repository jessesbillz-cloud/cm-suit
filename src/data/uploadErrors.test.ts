import { describe, expect, it } from 'vitest';
import { DataError } from './errors';
import { isTooBig, plainUploadError, shouldRetryUpload, uploadStatus } from './uploadErrors';

/** An error shaped like the TUS client's DetailedError: its long message, and the response (or none). */
function tusError(status: number | null, body = ''): Error {
  const message = `tus: unexpected response while creating upload, originated from request (method: POST, url: https://storage.example.test/storage/v1/upload/resumable, response code: ${status === null ? 'n/a' : String(status)}, response text: ${body}, request id: n/a)`;
  return Object.assign(new Error(message), {
    originalRequest: {},
    originalResponse: status === null ? null : { getStatus: () => status, getBody: () => body },
  });
}

describe('upload errors', () => {
  it('a file storage refuses as too large reads as one short sentence, with no number and no request dump', () => {
    const e = plainUploadError(tusError(413, 'Maximum size exceeded'));
    expect(e.message).toBe('Too big to upload here.');
    expect(e.message).not.toMatch(/tus|url|request id|\d/);
    expect(isTooBig(e)).toBe(true);
  });

  it('the full TUS error stays on the error for the logs', () => {
    const e = plainUploadError(tusError(413, 'Maximum size exceeded'));
    expect(e).toBeInstanceOf(DataError);
    expect(e.serverMessage).toContain('response code: 413');
    expect(e.serverMessage).toContain('Maximum size exceeded');
  });

  it('the size refusal is recognised by its text too, whatever the status', () => {
    expect(isTooBig(plainUploadError(tusError(400, 'Payload too large')))).toBe(true);
    expect(isTooBig(plainUploadError(tusError(400, 'The object exceeded the maximum allowed size')))).toBe(true);
  });

  it('every other TUS error is a short sentence as well', () => {
    expect(plainUploadError(tusError(403, 'new row violates row-level security policy')).message).toBe("You don't have access to that.");
    expect(plainUploadError(tusError(null)).message).toBe('Connection lost. Try again.');
    expect(plainUploadError(tusError(500, 'Internal Server Error')).message).toBe('Upload failed. Try again.');
    expect(plainUploadError(new Error('tus: no file or stream to upload provided')).message).toBe('Upload failed. Try again.');
    expect(plainUploadError('not an error').message).toBe('Upload failed. Try again.');
    for (const e of [tusError(403), tusError(null), tusError(500), new Error('tus: x')]) expect(isTooBig(plainUploadError(e))).toBe(false);
  });

  it('reads the status storage answered with', () => {
    expect(uploadStatus(tusError(413))).toBe(413);
    expect(uploadStatus(tusError(null))).toBe(0);
    expect(uploadStatus(new Error('plain'))).toBeNull();
    expect(uploadStatus(null)).toBeNull();
  });

  it('a refusal is never retried; a lost connection, a server error, a lock and a moved offset are', () => {
    expect(shouldRetryUpload(413, true)).toBe(false);
    expect(shouldRetryUpload(400, true)).toBe(false);
    expect(shouldRetryUpload(403, true)).toBe(false);
    expect(shouldRetryUpload(0, true)).toBe(true);
    expect(shouldRetryUpload(null, true)).toBe(true);
    expect(shouldRetryUpload(503, true)).toBe(true);
    expect(shouldRetryUpload(409, true)).toBe(true);
    expect(shouldRetryUpload(423, true)).toBe(true);
    expect(shouldRetryUpload(503, false)).toBe(false);
  });

  it('only an upload error says too big', () => {
    expect(isTooBig(new Error('Too big to upload here.'))).toBe(false);
    expect(isTooBig(new DataError('That already exists.', '23505', null))).toBe(false);
  });
});
