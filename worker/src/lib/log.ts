// Structured JSON logs to stdout/stderr. `error` also reports to Sentry (a no-op when Sentry is not initialised).
import * as Sentry from '@sentry/node';
import { errorText } from './errorText.js';

type LogContext = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, err?: unknown, ctx?: LogContext): void;
}

function write(level: 'info' | 'warn' | 'error', msg: string, ctx: LogContext | undefined, err: unknown): void {
  const line: Record<string, unknown> = { ts: new Date().toISOString(), level, msg, ...ctx };
  if (err !== undefined) {
    line.error = errorText(err);
    if (err instanceof Error && err.stack) line.stack = err.stack;
  }
  const stream = level === 'info' ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(line)}\n`);
}

export const log: Logger = {
  info(msg, ctx) {
    write('info', msg, ctx, undefined);
  },
  warn(msg, ctx) {
    write('warn', msg, ctx, undefined);
  },
  error(msg, err, ctx) {
    write('error', msg, ctx, err);
    if (err === undefined) {
      Sentry.captureMessage(msg, { level: 'error', extra: { ...ctx } });
    } else {
      Sentry.captureException(err, { extra: { msg, ...ctx } });
    }
  },
};
