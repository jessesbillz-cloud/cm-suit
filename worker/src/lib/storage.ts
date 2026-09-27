// Stream objects out of Supabase Storage without buffering them (plan sets can be several GB).
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Db } from './supabase.js';
import { HashingPassThrough } from './hash.js';

// Long enough for a multi-GB transfer to start; the URL is only used server-side by the worker.
const SIGNED_URL_SECONDS = 3600;

interface ObjectStream {
  body: Readable;
  /** From Content-Length; null when the server did not send one. */
  size: number | null;
}

export async function openObject(db: Db, bucket: string, path: string): Promise<ObjectStream> {
  const signed = await db.storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (signed.error) throw new Error(`signed URL for ${bucket}/${path} failed: ${signed.error.message}`);
  const res = await fetch(signed.data.signedUrl);
  if (!res.ok || res.body === null) {
    await res.body?.cancel();
    throw new Error(`download of ${bucket}/${path} failed: HTTP ${res.status}`);
  }
  const length = res.headers.get('content-length');
  const size = length === null ? null : Number(length);
  const body = Readable.fromWeb(res.body);
  return { body, size: size !== null && Number.isFinite(size) ? size : null };
}

interface DownloadedFile {
  bytes: number;
  sha256: string;
}

/** Stream an object to `dest`, hashing on the way. Fails if the byte count disagrees with Content-Length. */
export async function downloadToFile(db: Db, bucket: string, path: string, dest: string): Promise<DownloadedFile> {
  const { body, size } = await openObject(db, bucket, path);
  const hasher = new HashingPassThrough();
  await pipeline(body, hasher, createWriteStream(dest, { flags: 'wx' }));
  if (size !== null && hasher.bytes !== size) {
    throw new Error(`download of ${bucket}/${path} was truncated: ${hasher.bytes} of ${size} bytes`);
  }
  return { bytes: hasher.bytes, sha256: hasher.digest() };
}

export async function uploadBuffer(db: Db, bucket: string, path: string, data: Buffer, contentType: string): Promise<void> {
  const res = await db.storage.from(bucket).upload(path, data, { contentType, upsert: true });
  if (res.error) throw new Error(`upload to ${bucket}/${path} failed: ${res.error.message}`);
}
