// Invite bidders (SPEC §11.3): pick packages (prefilled when opened from a package), add subs from the directory for
// those packages or paste emails (one per line, "Company <email>" allowed), Send. Results show inline: sent or not,
// with each invitee's permanent link to copy.
import { useState } from 'react';
import { Copy, Send } from 'lucide-react';
import { useInviteBidders } from '../../data/bids.mutations';
import { useBidPackages } from '../../data/bids.queries';
import type { InviteBiddersResult } from '../../data/bids.types';
import { messageOf } from '../../data/errors';
import { useProject } from '../../data/queries';
import { Button } from '../../ui/Button';
import { ErrorState, LoadingState } from '../../ui/States';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { DirectoryPicks } from './DirectoryPicks';
import { parseRecipients } from './model';

interface InviteBiddersFormProps {
  projectId: string;
  /** The package the form was opened from: picked at the start. */
  packageId: string | null;
}

export function copyLink(text: string, toast: ReturnType<typeof useToast>) {
  navigator.clipboard.writeText(text).then(
    () => {
      toast.show({ message: 'Link copied.' });
    },
    (e: unknown) => {
      toast.show({ tone: 'error', message: `Not copied: ${messageOf(e)}` });
    },
  );
}

function InviteResults({ result }: { result: InviteBiddersResult }) {
  const toast = useToast();
  return (
    <ul className="flex flex-col gap-2 text-sm" data-testid="invite-results">
      {result.invited.map((r) => {
        const sent = r.email_status === 'sent' || r.email_status === 'queued' || r.email_status === 'test_mode';
        return (
          <li key={r.member_id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 break-all text-ink">{r.email}</span>
            <StatusChip status={sent ? 'confirmed' : 'blocked'} label={sent ? 'Sent' : 'Not sent'} />
            <Button
              size="sm"
              variant="quiet"
              icon={Copy}
              aria-label={`Copy link for ${r.email}`}
              onClick={() => {
                copyLink(r.link_url, toast);
              }}
            />
          </li>
        );
      })}
      {result.skipped.map((s) => {
        const email = typeof s === 'string' ? s : s.email;
        return (
          <li key={`skip-${email}`} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 break-all text-ink-2">{email}</span>
            <StatusChip status="cancelled" label="Skipped" />
          </li>
        );
      })}
    </ul>
  );
}

export function InviteBiddersForm({ projectId, packageId }: InviteBiddersFormProps) {
  const packages = useBidPackages(projectId);
  const project = useProject(projectId);
  const invite = useInviteBidders();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(packageId !== null ? [packageId] : []));
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<InviteBiddersResult | null>(null);

  if (packages.isPending) return <LoadingState label="Loading packages" />;
  if (packages.isError) return <ErrorState error={packages.error} onRetry={() => void packages.refetch()} />;

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function send() {
    const { recipients, bad } = parseRecipients(text);
    const invalid =
      picked.size === 0 ? 'Pick a package.' : bad.length > 0 ? `Not an email: ${bad.join(', ')}` : recipients.length === 0 ? 'Add an email.' : null;
    setProblem(invalid);
    if (invalid !== null) return;
    invite.mutate(
      { project_id: projectId, package_ids: [...picked], recipients },
      {
        onSuccess: (r) => {
          setResult(r);
          setText('');
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <h1 className="text-base font-semibold text-ink">Invite</h1>
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Packages</legend>
        {packages.data.map((p) => (
          <label key={p.id} className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1"
              data-testid={`invite-package-${p.code}`}
              checked={picked.has(p.id)}
              onChange={() => {
                toggle(p.id);
              }}
            />
            <span className="w-10 shrink-0 tabular-nums text-ink-2">{p.code}</span>
            <span className="min-w-0 flex-1 break-words">{p.name}</span>
          </label>
        ))}
      </fieldset>
      <DirectoryPicks
        orgId={project.data?.org_id}
        codes={packages.data.filter((p) => picked.has(p.id)).map((p) => p.code)}
        listed={new Set(parseRecipients(text).recipients.map((r) => r.email))}
        onAdd={(line) => {
          setText((t) => (t.trim() === '' ? line : `${t.replace(/\n+$/, '')}\n${line}`));
        }}
      />
      <textarea
        aria-label="Emails, one per line"
        placeholder="Company <email>"
        rows={6}
        data-testid="invite-emails"
        className="rounded-md border border-line px-2.5 py-2 text-sm text-ink outline-none focus:border-accent"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      {problem ? <p className="text-sm text-danger">{problem}</p> : null}
      <Button type="submit" variant="primary" icon={Send} loading={invite.isPending} data-testid="invite-send">
        Send
      </Button>
      {result ? <InviteResults result={result} /> : null}
    </form>
  );
}
