// PUBLIC ENDPOINT (SPEC §6.4 #2): permanent file / folder share link.
//
// Why public: share links go to people who may not be project members. The link never expires by itself; instead,
// access is checked on every click: the link must not be revoked, the caller must name the recipient address, and
// they must be signed in (Supabase Auth email code) AS that address. Without a session we answer 401 needs_code and
// the page runs signInWithOtp(email) and calls again. Every download is logged (downloads + audit).
//
// Service role: share recipients aren't members, so RLS can't authorize them; this function is the gate.
import { handlePublic, HttpError, needsCode, ok } from '../_shared/http.ts';
import { type Db, must, serviceClient, signedDownloadUrl } from '../_shared/db.ts';
import { optionalUser } from '../_shared/auth.ts';
import { email, parseJson, uuid, z } from '../_shared/validate.ts';
import { clientIp, limit } from '../_shared/ratelimit.ts';
import { audit } from '../_shared/audit.ts';
import { maskEmail } from '../_shared/email.ts';

const Body = z.object({
  share_link_id: uuid,
  email,
  /** Folder shares only: which file in the shared folder to download. */
  file_id: uuid.optional(),
}).strict();

interface ShareRow {
  id: string;
  org_id: string;
  project_id: string;
  target_type: 'file' | 'folder';
  target_id: string;
  recipient_email: string;
  member_id: string | null;
  revoked_at: string | null;
  use_count: number;
}

interface FileRow {
  id: string;
  project_id: string;
  folder_id: string;
  storage_path: string;
  original_name: string;
  mime: string;
  size: number;
  sha256: string | null;
  scan_status: 'pending' | 'clean' | 'infected' | 'too_large_to_scan';
}

interface FolderRow {
  id: string;
  project_id: string;
  name: string;
  view_only: boolean;
}

const GONE = 'This link is not active for that email address.';

async function linkIsLive(service: Db, link: ShareRow): Promise<boolean> {
  const project = must(
    await service.from('projects').select('deleted_at').eq('id', link.project_id).maybeSingle(),
    'project lookup',
  ) as { deleted_at: string | null } | null;
  if (!project || project.deleted_at) return false;
  if (!link.member_id) return true;
  const member = must(
    await service.from('project_members').select('status, access_ends_at').eq('id', link.member_id).maybeSingle(),
    'member lookup',
  ) as { status: string; access_ends_at: string | null } | null;
  if (!member || member.status === 'revoked') return false;
  return !member.access_ends_at || new Date(member.access_ends_at).getTime() > Date.now();
}

async function loadFolder(service: Db, id: string, projectId: string): Promise<FolderRow> {
  const folder = must(
    await service.from('folders').select('id, project_id, name, view_only').eq('id', id).is('deleted_at', null).maybeSingle(),
    'folder lookup',
  ) as FolderRow | null;
  if (!folder || folder.project_id !== projectId) throw new HttpError(404, 'The shared folder no longer exists.');
  return folder;
}

async function loadFile(service: Db, id: string, projectId: string): Promise<FileRow> {
  const file = must(
    await service.from('files')
      .select('id, project_id, folder_id, storage_path, original_name, mime, size, sha256, scan_status')
      .eq('id', id).is('deleted_at', null).eq('upload_complete', true).maybeSingle(),
    'file lookup',
  ) as FileRow | null;
  if (!file || file.project_id !== projectId) throw new HttpError(404, 'The shared file no longer exists.');
  return file;
}

async function markUsed(service: Db, link: ShareRow): Promise<void> {
  // Read-modify-write: a rare concurrent click can undercount use_count; downloads/audit rows are the real record.
  const { error } = await service.from('share_links')
    .update({ use_count: link.use_count + 1, last_used_at: new Date().toISOString() }).eq('id', link.id);
  if (error) throw new HttpError(500, `share_links update: ${error.message}`);
}

Deno.serve(handlePublic(async (req) => {
  const service = serviceClient();
  await limit(service, `share:ip:${clientIp(req) ?? 'unknown'}`, 20, 20 / 60);
  const body = await parseJson(req, Body, 4096);
  await limit(service, `share:link:${body.share_link_id}`, 10, 10 / 60);

  const link = must(
    await service.from('share_links')
      .select('id, org_id, project_id, target_type, target_id, recipient_email, member_id, revoked_at, use_count')
      .eq('id', body.share_link_id).maybeSingle(),
    'share link lookup',
  ) as ShareRow | null;
  // One answer for unknown / revoked / wrong address, so the endpoint doesn't confirm who a link was sent to.
  if (!link || link.revoked_at || link.recipient_email !== body.email) throw new HttpError(404, GONE);
  if (!(await linkIsLive(service, link))) throw new HttpError(404, GONE);

  const session = await optionalUser(req);
  const masked = maskEmail(link.recipient_email);
  if (!session) return needsCode(req, masked, 'signed_out');
  if ((session.user.email ?? '').toLowerCase() !== link.recipient_email) return needsCode(req, masked, 'other_account');

  let fileId: string;
  if (link.target_type === 'folder') {
    const folder = await loadFolder(service, link.target_id, link.project_id);
    if (!body.file_id) {
      const files = must(
        await service.from('files').select('id, original_name, size')
          .eq('folder_id', folder.id).is('deleted_at', null).is('superseded_by', null)
          .eq('upload_complete', true).neq('scan_status', 'infected')
          .order('original_name').limit(1000),
        'folder listing',
      ) as { id: string; original_name: string; size: number }[];
      await markUsed(service, link);
      await audit(service, {
        action: 'share.view', actorKind: 'public_link', entityType: 'folder', entityId: folder.id,
        projectId: link.project_id, orgId: link.org_id, actorUserId: session.user.id,
        details: { share_link_id: link.id, recipient: link.recipient_email }, req,
      });
      return ok(req, { kind: 'folder', folder_name: folder.name, view_only: folder.view_only, files });
    }
    fileId = body.file_id;
  } else {
    if (body.file_id && body.file_id !== link.target_id) throw new HttpError(400, 'file_id does not match this link');
    fileId = link.target_id;
  }

  const file = await loadFile(service, fileId, link.project_id);
  if (link.target_type === 'folder' && file.folder_id !== link.target_id) throw new HttpError(404, 'The shared file no longer exists.');
  const folder = await loadFolder(service, file.folder_id, link.project_id);
  // Same gates as authorize_download(): view-only never hands out a URL; infected never; pending only for the uploader.
  if (folder.view_only) throw new HttpError(403, 'view_only');
  if (file.scan_status === 'infected') throw new HttpError(403, 'infected');
  if (file.scan_status === 'pending') throw new HttpError(403, 'scan_pending');

  const { error: dlError } = await service.from('downloads').insert({
    file_id: file.id,
    project_id: file.project_id,
    user_id: session.user.id,
    share_link_id: link.id,
    ip: clientIp(req),
    variant: 'original',
  });
  if (dlError) throw new HttpError(500, `downloads insert: ${dlError.message}`);
  await audit(service, {
    action: 'download', actorKind: 'public_link', entityType: 'file', entityId: file.id,
    projectId: file.project_id, orgId: link.org_id, contentHash: file.sha256, actorUserId: session.user.id,
    details: { share_link_id: link.id, variant: 'original', name: file.original_name, recipient: link.recipient_email }, req,
  });
  await markUsed(service, link);

  const url = await signedDownloadUrl(service, 'files', file.storage_path, file.original_name);
  return ok(req, { kind: 'file', url, filename: file.original_name });
}));
