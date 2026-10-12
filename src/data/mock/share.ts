// e2e mock of the share endpoint (SPEC §6.4 #2): one link, to job B's gypsum board submittal, sent to the mock PM. The
// PM, signed in, opens it at once; a visitor (the 'anon' mock user) is asked for a code the first time, then opens it.
// Any other link or address gets the endpoint's one answer for "not active".
import { FunctionError } from '../functions';
import type { ShareResult } from '../links';
import * as api from './api';
import { mockUser } from './index';
import { previewUrl } from './preview';
import { delay } from './store';

const LINK = 'mock-share-submittal';
const FILE = 'job-b-section-file-4';
const TO = 'pm@example.test';
/** Set once the visitor has been sent a code (sessionStorage: one tab, one sign-in). */
const CODE_SENT = 'mock-share-code-sent';

export async function open(linkId: string, email: string, fileId?: string): Promise<ShareResult> {
  await delay();
  const f = await api.file(FILE);
  if (linkId !== LINK || email !== TO || (fileId !== undefined && fileId !== FILE) || !f) {
    throw new FunctionError(404, 'not_found', 'This link is not active for that email address.', null, null);
  }
  if (mockUser().email !== TO && window.sessionStorage.getItem(CODE_SENT) === null) {
    window.sessionStorage.setItem(CODE_SENT, '1');
    return { kind: 'needs_code', email_masked: 'p***@example.test', reason: 'signed_out' };
  }
  return { kind: 'file', url: await previewUrl(FILE), filename: f.original_name, file_id: f.id, project_id: f.project_id };
}
