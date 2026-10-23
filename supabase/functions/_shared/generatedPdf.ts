// Official PDFs the server renders (daily reports, IRs, ...; SPEC §6.9, §8.2) are stored through here, the one way.
// Our own code made the bytes from saved content, so the file is stored clean (nothing to scan) with its sha256, and
// a regenerated PDF becomes the next version of the one it replaces. The caller has already checked the person
// (requireUser → requireCapability / the record's own RPC as the caller) and passes the service client, because
// users cannot write scan results or storage objects for files they didn't upload.
import { type Db, must, rpc, storageError } from './db.ts';
import { sha256HexBytes } from './crypto.ts';
import { HttpError } from './http.ts';

export interface GeneratedPdf {
  projectId: string;
  folderId: string;
  /** The filename people download (lib buildFilename pattern, resolved by the caller). */
  name: string;
  bytes: Uint8Array;
  /** The person the PDF belongs to (the signer / author); null when no member is behind it (a request-link visitor's
   *  map, 0057). */
  createdBy: string | null;
  /** Regenerating: the file this one replaces (same version group, next version number). */
  replaces?: string | null | undefined;
}

export interface StoredPdf {
  id: string;
  storage_path: string;
  sha256: string;
}

export async function storeGeneratedPdf(service: Db, pdf: GeneratedPdf): Promise<StoredPdf> {
  return await storeServerFile(service, { ...pdf, mime: 'application/pdf', scanned: true });
}

export interface ServerFile extends GeneratedPdf {
  mime: string;
  /** True for bytes a server made (stored clean, nothing to scan). False for anything a person once uploaded: the row
   *  stays pending and unfinished until the caller's own SQL step finishes it and queues the scan. */
  scanned: boolean;
}

/** The one way the server stores a file: storage first, then the files row with its sha256. */
export async function storeServerFile(service: Db, file: ServerFile): Promise<StoredPdf> {
  const folder = must(
    await service.from('folders').select('id, org_id, project_id').eq('id', file.folderId).is('deleted_at', null).single(),
    'folder',
  ) as { id: string; org_id: string; project_id: string };
  if (folder.project_id !== file.projectId) throw new HttpError(400, 'That folder is not in this job');

  let version: { version_group_id: string; version_no: number; project_id: string } | null = null;
  if (file.replaces) {
    version = must(
      await service.from('files').select('version_group_id, version_no, project_id').eq('id', file.replaces).single(),
      'replaced file',
    ) as { version_group_id: string; version_no: number; project_id: string };
    if (version.project_id !== file.projectId) throw new HttpError(400, 'That file is not in this job');
  }

  const id = crypto.randomUUID();
  const storagePath = await rpc<string>(service, 'file_storage_path', {
    p_project_id: file.projectId,
    p_folder_id: folder.id,
    p_file_id: id,
    p_name: file.name,
  });
  const sha256 = await sha256HexBytes(file.bytes);

  const { error: upErr } = await service.storage.from('files').upload(storagePath, file.bytes, {
    contentType: file.mime,
    upsert: false,
  });
  if (upErr) throw storageError(upErr, 'upload server file');

  must(
    await service.from('files').insert({
      id,
      org_id: folder.org_id,
      project_id: file.projectId,
      folder_id: folder.id,
      storage_path: storagePath,
      original_name: file.name,
      mime: file.mime,
      size: file.bytes.length,
      sha256,
      ...(file.scanned
        ? { scan_status: 'clean', scanned_at: new Date().toISOString(), text_status: 'none', upload_complete: true }
        : { scan_status: 'pending', text_status: 'pending', upload_complete: false }),
      created_by: file.createdBy,
      ...(version ? { version_group_id: version.version_group_id, version_no: version.version_no + 1 } : {}),
    }),
    'insert server file',
  );
  if (file.replaces) {
    must(await service.from('files').update({ superseded_by: id }).eq('id', file.replaces), 'supersede old version');
  }
  return { id, storage_path: storagePath, sha256 };
}
