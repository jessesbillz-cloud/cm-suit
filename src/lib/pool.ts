// Runs one async job per item, at most `limit` at a time, in order. Never rejects: each job's failure is handed to
// `onError`, so a long batch (reading 136 bids) finishes and reports what did not work.

export async function runPool<T>(
  items: readonly T[],
  limit: number,
  job: (item: T) => Promise<void>,
  onError: (item: T, error: unknown) => void,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next] as T;
      next += 1;
      try {
        await job(item);
      } catch (e: unknown) {
        onError(item, e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}
