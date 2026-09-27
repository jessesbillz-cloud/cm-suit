// Run an external program with arguments as an array (never through a shell), a hard timeout and capped output.
import { spawn } from 'node:child_process';
import { log } from './log.js';

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ExecOptions {
  timeoutMs: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Per stream; anything beyond is dropped and marked truncated. Default 1 MiB. */
  maxOutputBytes?: number;
}

const DEFAULT_MAX_OUTPUT = 1024 * 1024;

class CappedOutput {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  private truncated = false;

  constructor(private readonly max: number) {}

  push(chunk: Buffer): void {
    if (this.size >= this.max) {
      this.truncated = true;
      return;
    }
    const room = this.max - this.size;
    const part = chunk.length > room ? chunk.subarray(0, room) : chunk;
    if (part.length < chunk.length) this.truncated = true;
    this.chunks.push(part);
    this.size += part.length;
  }

  text(): string {
    const body = Buffer.concat(this.chunks).toString('utf8');
    return this.truncated ? `${body}\n[output truncated]` : body;
  }
}

/** Resolves with the exit code (non-zero included). Rejects if the program cannot start, times out or is killed. */
export function run(cmd: string, args: readonly string[], opts: ExecOptions): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const max = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    const stdout = new CappedOutput(max);
    const stderr = new CappedOutput(max);
    // detached: the child leads its own process group, so a timeout kills helpers it spawned (soffice.bin).
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? process.cwd(),
      env: opts.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      shell: false,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, opts.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`${cmd} could not start: ${err.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${cmd} timed out after ${opts.timeoutMs} ms`));
      } else if (code === null) {
        reject(new Error(`${cmd} was killed by ${signal ?? 'an unknown signal'}`));
      } else {
        resolve({ code, stdout: stdout.text(), stderr: stderr.text() });
      }
    });
  });
}

/** Like `run`, but a non-zero exit is an error carrying the tail of the program's output. */
export async function runOk(cmd: string, args: readonly string[], opts: ExecOptions): Promise<ExecResult> {
  const result = await run(cmd, args, opts);
  if (result.code !== 0) {
    const output = (result.stderr.trim() || result.stdout.trim()).slice(-1500);
    throw new Error(`${cmd} exited with ${result.code}: ${output}`);
  }
  return result;
}

function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (err) {
    // ESRCH: the group already exited between the timer firing and the kill. Anything else is reported.
    // (This runs in a timer callback, so throwing would crash the whole worker.)
    if (!(err instanceof Error && 'code' in err && err.code === 'ESRCH')) log.error('could not kill timed-out process group', err, { pid });
  }
}
