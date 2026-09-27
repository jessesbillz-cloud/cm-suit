// Invite a person (members.manage). The edge function creates the member and a permanent access link and emails it.
// When the email can't go (email test mode, a bounce), the link is shown with copy and mail-app fallbacks.
import { useState } from 'react';
import { z } from 'zod';
import { Copy, Mail, UserPlus } from 'lucide-react';
import { useInviteMember } from '../../data/mutations';
import { useRoles } from '../../data/queries';
import { messageOf } from '../../data/errors';
import type { InviteResult } from '../../data/types';
import { endOfDayInZone } from '../../lib/dates';
import { humanize } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { useToast } from '../../ui/Toast';

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  role: z.string().min(1, 'Pick a role.'),
  accessEnds: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a date or leave it empty.'),
});

interface InviteFormProps {
  projectId: string;
  projectName: string;
  /** The project time zone: "access ends" means the end of that day on the job (CLAUDE.md rule 14). */
  timeZone: string;
}

interface SentProps {
  email: string;
  projectName: string;
  result: InviteResult;
}

function Sent({ email, projectName, result }: SentProps) {
  const toast = useToast();
  const emailed = result.email_status === 'sent' || result.email_status === 'queued';
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Your access to ${projectName}`)}&body=${encodeURIComponent(
    `Open this link to get to ${projectName}. It asks for a code we email you, and it keeps working:\n\n${result.link_url}`,
  )}`;
  return (
    <div className="mt-3 rounded-md border border-line bg-page p-3 text-sm">
      <p className="text-ink">{emailed ? `Invite emailed to ${email}.` : `Invite created for ${email}, but the email was not sent.`}</p>
      {result.email_error ? <p className="text-danger">{result.email_error}</p> : null}
      <p className="mt-2 break-all text-xs text-ink-2">{result.link_url}</p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          icon={Copy}
          onClick={() => {
            navigator.clipboard.writeText(result.link_url).then(
              () => {
                toast.show({ message: 'Link copied.' });
              },
              (e: unknown) => {
                toast.show({ tone: 'error', message: `Could not copy: ${messageOf(e)}` });
              },
            );
          }}
        >
          Copy link
        </Button>
        <a
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-card px-2.5 text-sm font-medium text-ink hover:bg-page"
          href={mailto}
        >
          <Mail size={16} strokeWidth={1.75} aria-hidden="true" />
          Open in my mail app
        </a>
      </div>
    </div>
  );
}

export function InviteForm({ projectId, projectName, timeZone }: InviteFormProps) {
  const roles = useRoles();
  const invite = useInviteMember();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [accessEnds, setAccessEnds] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; result: InviteResult } | null>(null);

  function submit() {
    const parsed = inviteSchema.safeParse({ email, role, accessEnds });
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Check the form.');
      return;
    }
    setProblem(null);
    const v = parsed.data;
    invite.mutate(
      {
        project_id: projectId,
        email: v.email,
        role: v.role,
        access_ends_at: v.accessEnds === '' ? null : endOfDayInZone(v.accessEnds, timeZone),
      },
      {
        onSuccess: (result) => {
          setSent({ email: v.email, result });
          setEmail('');
        },
        onError: (e) => {
          setProblem(messageOf(e));
        },
      },
    );
  }

  return (
    <Card title="Invite someone">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_12rem_10rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Email
          <input
            type="email"
            autoComplete="off"
            className="h-9 rounded-md border border-line px-2.5 text-sm font-normal text-ink outline-none focus:border-accent"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Role
          <select
            className="h-9 rounded-md border border-line bg-card px-2 text-sm font-normal text-ink"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
            }}
          >
            <option value="">Pick a role</option>
            {(roles.data ?? []).map((r) => (
              <option key={r.name} value={r.name}>
                {humanize(r.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Access ends (optional)
          <input
            type="date"
            className="h-9 rounded-md border border-line px-2 text-sm font-normal text-ink outline-none focus:border-accent"
            value={accessEnds}
            onChange={(e) => {
              setAccessEnds(e.target.value);
            }}
          />
        </label>
        <Button type="submit" variant="primary" icon={UserPlus} loading={invite.isPending}>
          Invite
        </Button>
      </form>
      {roles.isError ? <p className="mt-2 text-sm text-danger">Roles did not load: {messageOf(roles.error)}</p> : null}
      {problem ? <p className="mt-2 text-sm text-danger">{problem}</p> : null}
      {sent ? <Sent email={sent.email} projectName={projectName} result={sent.result} /> : null}
    </Card>
  );
}
