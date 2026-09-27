// CORS: authenticated functions allow only the app origin (plus localhost in dev); public endpoints allow *.
import { env } from './env.ts';

const LOCAL = /^http:\/\/localhost(:\d+)?$/;

export function corsHeaders(req: Request, publicEndpoint = false): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const appOrigin = env('APP_ORIGIN');
  const allow = publicEndpoint ? '*' : origin === appOrigin || LOCAL.test(origin) ? origin : appOrigin;
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin',
  };
}
