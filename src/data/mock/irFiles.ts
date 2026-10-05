// e2e mock of the ir-pdf function's 'download' (authorize_ir_file, in short): who may read the request opens its IR PDF
// (the synthetic plan set: mock/sheet) and its own files (an attachment, a result photo, or my own upload), each as a
// URL the viewer shows and Download saves. Anything else is refused as the database refuses it.
import { DataError } from '../errors';
import * as api from './api';
import { request } from './inspections';
import { previewUrl } from './preview';
import { jobName } from './requestNoLogin';
import { sheetUrl } from './sheet';
import { mockUser } from './index';

function gone(): DataError {
  return new DataError('That item no longer exists.', 'P0002', 'not_found');
}

export async function irFile(requestId: string, fileId?: string): Promise<{ url: string; filename: string }> {
  const r = await request(requestId);
  if (!r) throw gone();
  if (fileId === undefined || fileId === r.ir_file_id) {
    if (r.ir_file_id === null) throw new DataError('There is no IR yet.', 'P0002', 'not_found');
    const [y, mo, d] = r.request_date.split('-');
    return { url: sheetUrl(), filename: `IR ${String(r.number)} ${jobName(r.project_id)} ${mo ?? ''}-${d ?? ''}-${y ?? ''}.pdf` };
  }
  const f = await api.file(fileId);
  if (!f) throw gone();
  const listed = r.attachment_ids.includes(fileId) || r.result_photo_ids.includes(fileId) || f.created_by === mockUser().id;
  if (!listed) throw new DataError("You don't have access to that.", '42501', 'forbidden');
  return { url: await previewUrl(fileId), filename: f.original_name };
}
