// /s/<share-link-id>: a permanent share link (SPEC §6.4 #2). Access is checked on every click: the recipient names
// their address and signs in as it with an email code; someone already signed in on this device goes straight on.
// Then a file opens on the page itself, with Download one click on it (Jesse, Oct 12: no download step, no pop-ups),
// or a folder lists its files and a tap on one opens it in the file viewer. Every look goes through the share endpoint
// and is logged as a download there. A view-only folder lists names only: the endpoint hands out no URL for it (its
// page images are server-rendered, not built yet).
import { useEffect, useRef, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { z } from 'zod';
import { Download } from 'lucide-react';
import { sendCode, useSession } from '../../data/auth';
import { saveSignedUrl } from '../../data/download';
import { messageOf } from '../../data/errors';
import { FunctionError } from '../../data/functions';
import { openShare, type SharedFile, type ShareFolder } from '../../data/links';
import { fileKind } from '../../lib/fileKind';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';
import { useFileViewer, type ViewerItem } from '../../ui/FileViewer';
import { Icon } from '../../ui/Icon';
import { fileIcon } from '../../ui/fileIcon';
import { LoadingState } from '../../ui/States';
import { CodeForm, INPUT } from './CodeForm';
import { PublicPage } from './PublicPage';
import { ShareFileView } from './ShareFileView';

const route = getRouteApi('/s/$shareLinkId');
const emailSchema = z.string().trim().toLowerCase().email('Enter the email address this link was sent to.');

type Step = { kind: 'email' } | { kind: 'code'; masked: string } | { kind: 'file'; file: SharedFile } | { kind: 'folder'; folder: ShareFolder };

interface FolderListProps {
  folder: ShareFolder;
  busyId: string | null;
  onDownload: (fileId: string) => void;
  /** The viewer's items, one per file (left out for a view-only folder). */
  items: readonly ViewerItem[] | null;
}

function FolderList({ folder, busyId, onDownload, items }: FolderListProps) {
  const viewer = useFileViewer();
  if (folder.files.length === 0) return <p className="text-sm text-ink-2">This folder is empty.</p>;
  return (
    <ul className="-mx-2 flex flex-col divide-y divide-line border-t border-line">
      {folder.files.map((f, i) => (
        <li key={f.id} className="flex min-h-[52px] items-center gap-3 px-2 py-2.5">
          <button
            type="button"
            data-testid="share-file-open"
            disabled={items === null}
            className="flex min-w-0 flex-1 items-center gap-3 text-left enabled:hover:text-accent"
            onClick={() => {
              if (items) viewer.open(items, i);
            }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-page text-ink-2">
              <Icon icon={fileIcon(f.original_name)} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-medium">{f.original_name}</span>
              <span className="block text-xs tabular-nums text-ink-2">{formatBytes(f.size)}</span>
            </span>
          </button>
          {folder.view_only ? null : (
            <Button size="sm" icon={Download} loading={busyId === f.id} onClick={() => {
                onDownload(f.id);
              }}>
              Download
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ShareLink() {
  const { shareLinkId } = route.useParams();
  const session = useSession();
  const [email, setEmail] = useState(session.user?.email ?? '');
  const [step, setStep] = useState<Step>({ kind: 'email' });
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Asked once per visit: signed in already, or the email typed. Signing in by code later doesn't ask again on its own.
  const asked = useRef(false);
  // The URL the file step came with: the first look uses it instead of asking (and logging) again.
  const firstUrl = useRef<string | null>(null);

  async function open(address: string, fileId?: string): Promise<void> {
    asked.current = true;
    setEmail(address);
    const res = await openShare(shareLinkId, address, fileId);
    if (res.kind === 'needs_code') {
      await sendCode(address);
      setStep({ kind: 'code', masked: res.email_masked });
    } else if (res.kind === 'file') {
      firstUrl.current = res.url;
      setStep({ kind: 'file', file: res });
    } else {
      setStep({ kind: 'folder', folder: res });
    }
  }

  function run(task: () => Promise<void>, quietIfNotMine = false) {
    setBusy(true);
    setProblem(null);
    task()
      .catch((e: unknown) => {
        // Signed in as someone the link wasn't sent to: the email form, as if nobody were signed in.
        if (quietIfNotMine && e instanceof FunctionError && e.status === 404) return;
        setProblem(messageOf(e));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  // Already signed in on this device: open it as that address at once.
  const signedIn = session.status === 'signed_in' ? (session.user?.email.toLowerCase() ?? null) : null;
  useEffect(() => {
    if (asked.current || signedIn === null) return;
    run(() => open(signedIn), true);
  });

  const address = email.trim().toLowerCase();

  /** A fresh signed URL through the share endpoint (its own gate, logged there). */
  async function fileUrl(fileId?: string): Promise<{ url: string; filename: string }> {
    const res = await openShare(shareLinkId, address, fileId);
    if (res.kind !== 'file') throw new Error('Sign in again to open this file.');
    return res;
  }

  function shareItem(id: string | undefined, name: string): ViewerItem {
    return {
      id: id ?? shareLinkId,
      name,
      kind: fileKind(name),
      url: async () => {
        const have = id === undefined ? firstUrl.current : null;
        firstUrl.current = null;
        return have ?? (await fileUrl(id)).url;
      },
      download: async () => {
        const res = await fileUrl(id);
        await saveSignedUrl(res.url, res.filename);
      },
    };
  }
  const error = problem ? (
    <p role="alert" className="text-sm text-danger">
      {problem}
    </p>
  ) : null;

  if (step.kind === 'email' && (session.status === 'loading' || (signedIn !== null && (busy || !asked.current)))) {
    return (
      <PublicPage title="Shared with you">
        <LoadingState label="Opening" />
      </PublicPage>
    );
  }
  if (step.kind === 'code') {
    return (
      <PublicPage title="Enter your code">
        <CodeForm email={address} emailLabel={step.masked} onVerified={() => open(address)} onBack={() => {
            setStep({ kind: 'email' });
          }} />
      </PublicPage>
    );
  }
  if (step.kind === 'file') {
    return <ShareFileView item={shareItem(undefined, step.file.filename)} projectId={step.file.project_id ?? null} />;
  }
  if (step.kind === 'folder') {
    return (
      <PublicPage title={step.folder.folder_name}>
        {step.folder.view_only ? <p className="text-sm text-ink-2">This folder is view-only.</p> : null}
        {error}
        <FolderList
          folder={step.folder}
          items={step.folder.view_only ? null : step.folder.files.map((f) => shareItem(f.id, f.original_name))}
          busyId={busyId}
          onDownload={(fileId) => {
            setBusyId(fileId);
            setProblem(null);
            openShare(shareLinkId, address, fileId)
              .then((res) => (res.kind === 'file' ? saveSignedUrl(res.url, res.filename) : Promise.reject(new Error('Sign in again to download.'))))
              .catch((e: unknown) => {
                setProblem(messageOf(e));
              })
              .finally(() => {
                setBusyId(null);
              });
          }}
        />
      </PublicPage>
    );
  }

  return (
    <PublicPage title="Shared with you">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = emailSchema.safeParse(email);
          if (!parsed.success) {
            setProblem(parsed.error.issues[0]?.message ?? 'Enter your email address.');
            return;
          }
          run(() => open(parsed.data));
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink" htmlFor="share-email">
            Email
          </label>
          <input
            id="share-email"
            type="email"
            autoComplete="email"
            className={INPUT}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </div>
        <p className="text-xs text-ink-2">The address this link was sent to.</p>
        {error}
        <Button type="submit" variant="primary" loading={busy} className="h-11">
          Continue
        </Button>
      </form>
    </PublicPage>
  );
}
