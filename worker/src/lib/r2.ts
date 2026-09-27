// Cloudflare R2 (S3 API) target for the nightly storage copy (SPEC §6.5 backups).
import type { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3';
import type { WorkerEnv } from './env.js';
import { log } from './log.js';

// Above this (or with an unknown length) use multipart; a single PUT tops out at 5 GiB on R2.
const SINGLE_PUT_MAX = 1024 * 1024 * 1024;
const PART_SIZE = 64 * 1024 * 1024;
const SOURCE_UPDATED_AT = 'source-updated-at';

export class R2Store {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(env: Pick<WorkerEnv, 'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET'>) {
    this.bucket = env.R2_BUCKET;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
      // R2 does not accept the SDK's default streaming trailer checksums; only send them when an API requires it.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  /** True when R2 already holds this key copied from the same source version (lets a retried run skip it). */
  async isCurrent(key: string, sourceUpdatedAt: string | null, size: number | null): Promise<boolean> {
    if (sourceUpdatedAt === null) return false;
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      const sameVersion = head.Metadata?.[SOURCE_UPDATED_AT] === sourceUpdatedAt;
      return sameVersion && (size === null || head.ContentLength === size);
    } catch (err) {
      if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) return false;
      throw err;
    }
  }

  /** Stream `body` to `key`. `size` is the exact byte count when known. */
  async putStream(key: string, body: Readable, size: number | null, sourceUpdatedAt: string | null): Promise<void> {
    const metadata: Record<string, string> = sourceUpdatedAt === null ? {} : { [SOURCE_UPDATED_AT]: sourceUpdatedAt };
    if (size !== null && size <= SINGLE_PUT_MAX) {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentLength: size, Metadata: metadata }),
      );
      return;
    }
    await this.putMultipart(key, body, metadata);
  }

  async putJson(key: string, value: unknown): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(value, null, 2),
        ContentType: 'application/json',
      }),
    );
  }

  private async putMultipart(key: string, body: Readable, metadata: Record<string, string>): Promise<void> {
    const created = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, Metadata: metadata }),
    );
    const uploadId = created.UploadId;
    if (uploadId === undefined) throw new Error(`R2 did not return an upload id for ${key}`);
    const parts: CompletedPart[] = [];

    const uploadPart = async (data: Buffer): Promise<void> => {
      const partNumber = parts.length + 1;
      const res = await this.client.send(
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: data,
          ContentLength: data.length,
        }),
      );
      if (res.ETag === undefined) throw new Error(`R2 returned no ETag for part ${partNumber} of ${key}`);
      parts.push({ ETag: res.ETag, PartNumber: partNumber });
    };

    try {
      let pending: Buffer[] = [];
      let pendingBytes = 0;
      for await (const chunk of body as AsyncIterable<Buffer>) {
        pending.push(chunk);
        pendingBytes += chunk.length;
        while (pendingBytes >= PART_SIZE) {
          const all = Buffer.concat(pending);
          await uploadPart(all.subarray(0, PART_SIZE));
          // Copy the remainder so the large concatenated buffer can be freed.
          const rest = Buffer.from(all.subarray(PART_SIZE));
          pending = rest.length > 0 ? [rest] : [];
          pendingBytes = rest.length;
        }
      }
      if (pendingBytes > 0 || parts.length === 0) await uploadPart(Buffer.concat(pending));
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        }),
      );
    } catch (err) {
      await this.client
        .send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }))
        .catch((abortErr: unknown) => {
          log.error('R2 multipart abort failed', abortErr, { key });
        });
      throw err;
    }
  }
}
