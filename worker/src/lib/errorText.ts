import { inspect } from 'node:util';

const ERROR_TEXT_MAX = 2000;

/** Stringify any thrown value, capped at 2000 characters (the queue stores at most that much). */
export function errorText(err: unknown): string {
  let text: string;
  if (err instanceof Error) text = err.message || err.name;
  else if (typeof err === 'string') text = err;
  else text = inspect(err, { depth: 3, breakLength: Infinity });
  return text.length > ERROR_TEXT_MAX ? text.slice(0, ERROR_TEXT_MAX) : text;
}
