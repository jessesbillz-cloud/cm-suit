// A missing secret means refuse the request (SPEC §6.3). Never skip a check because a value is absent.
import { HttpError } from './http.ts';

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, `Server misconfigured: ${name} is not set`);
  return v;
}

export function envOptional(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}

export const BRAND_NAME = (): string => envOptional('BRAND_NAME') ?? 'FUTURE_NAME';
