// SHA-256 computed while a stream passes through, so multi-GB files are never buffered.
import { createHash, type Hash } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';

export class HashingPassThrough extends Transform {
  private readonly hash: Hash = createHash('sha256');
  private count = 0;
  private hex: string | null = null;

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.hash.update(chunk);
    this.count += chunk.length;
    callback(null, chunk);
  }

  get bytes(): number {
    return this.count;
  }

  /** Hex digest. Call only after the stream has finished. */
  digest(): string {
    this.hex ??= this.hash.digest('hex');
    return this.hex;
  }
}
