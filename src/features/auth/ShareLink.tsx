// /s/<share-link-id>: a permanent share link (SPEC §6.4 #2). Access is checked on every click: the recipient names
// their address and signs in as it with an email code. Then the file downloads, or the folder lists its files.
import { useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { z } from 'zod';
import { Download } from 'lucide-react';
import { sendCode, useSession } from '../../data/auth';
import { saveSignedUrl } from '../../data/download';
import { messageOf } from '../../data/errors';
import { openShare, type ShareFolder } from '../../data/links';
import { formatBytes } from '../../lib/format';
import { Button } from '../../ui/Button';
import { CodeForm } from './CodeForm';
import { PublicPage } from './PublicPage';

const route = getRouteApi('/s/$shareLinkId');
const emailSchema = z.string().trim().toLowerCase().email('Enter the email address this link was sent to.');

type Step = { kind: 'email' } | { kind: 'code'; masked: string } | { kind: 'file'; filename: string } | { kind: 'folder'; folder: ShareFolder };

interface FolderListProps {
  folder: ShareFolder;
  busyId: string | null;
  onDownload: (fileId: string) => void;
}

function FolderList({ folder, busyId, onDownload }: FolderListProps) {
  if (folder.files.length === 0) return <p className="text-sm text-ink-2">This folder is empty.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {folder.files.map((f) => (
        <li key={f.id} className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1 break-words text-sm text-ink">{f.original_name}</span>
          <span className="text-xs text-ink-2">{formatBytes(f.size)}</span>
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

  async function open(address: string, fileId?: string): Promise<void> {
    const res = await openShare(shareLinkId, address, fileId);
    if (res.kind === 'needs_code') {
      await sendCode(address);
      setStep({ kind: 'code', masked: res.email_masked });
    } else if (res.kind === 'file') {
      await saveSignedUrl(res.url, res.filename);
      setStep({ kind: 'file', filename: res.filename });
    } else {
      setStep({ kind: 'folder', folder: res });
    }
  }

  function run(task: () => Promise<void>) {
    setBusy(true);
    setProblem(null);
    task()
      .catch((e: unknown) => {
        setProblem(messageOf(e));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  const address = email.trim().toLowerCase();
  const error = problem ? (
    <p role="alert" className="text-sm text-danger">
      {problem}
    </p>
  ) : null;

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
    return (
      <PublicPage title="Your download started">
        <div className="flex flex-col gap-3">
          <p className="break-words text-sm text-ink">{step.filename}</p>
          {error}
          <Button variant="primary" icon={Download} loading={busy} onClick={() => {
              run(() => open(address));
            }}
          >
            Download again
          </Button>
        </div>
      </PublicPage>
    );
  }
  if (step.kind === 'folder') {
    return (
      <PublicPage title={step.folder.folder_name}>
        {step.folder.view_only ? <p className="mb-2 text-sm text-ink-2">This folder is view-only.</p> : null}
        {error}
        <FolderList
          folder={step.folder}
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
        <label className="flex flex-col gap-1 text-sm font-medium text-ink" htmlFor="share-email">
          Email
        </label>
        <input
          id="share-email"
          type="email"
          autoComplete="email"
          className="h-11 rounded-md border border-line px-3 text-base text-ink outline-none focus:border-accent"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <p className="text-xs text-ink-2">Use the address this link was sent to. We email a code to confirm it is you.</p>
        {error}
        <Button type="submit" variant="primary" loading={busy}>
          Continue
        </Button>
      </form>
    </PublicPage>
  );
}
