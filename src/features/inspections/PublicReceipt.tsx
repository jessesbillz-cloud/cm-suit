// After a request is sent with no login: the IR number the database gave, the tracker, and the private status link the
// visitor bookmarks or screenshots (only this screen ever shows it: the server keeps its hash).
import { CircleCheck, Copy } from 'lucide-react';
import type { Submitted } from '../../data/requestNoLogin.types';
import { shortLinkText, statusLinkUrl } from '../../lib/requestLink';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { RequestFactsView } from './RequestFactsView';
import { useCopyLink } from './useCopyLink';

interface PublicReceiptProps {
  projectId: string;
  receipt: Submitted;
  onAnother: () => void;
}

export function PublicReceipt({ projectId, receipt, onAnother }: PublicReceiptProps) {
  const copy = useCopyLink();
  const url = statusLinkUrl(window.location.origin, __BASE_PATH__, projectId, receipt.receipt);
  return (
    <Card>
      <div className="flex flex-col gap-4" data-testid="public-receipt">
        <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
          <Icon icon={CircleCheck} size={18} className="text-accent" />
          Sent
        </p>
        <RequestFactsView facts={receipt} />
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-page px-3 py-3">
          <p className="text-xs font-medium text-ink-3">Status link</p>
          <p className="break-all text-sm text-ink" data-testid="public-status-url">
            {shortLinkText(url)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              icon={Copy}
              onClick={() => {
                copy(url);
              }}
            >
              Copy
            </Button>
            <a
              href={url}
              data-testid="public-status-open"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-line-strong bg-card px-4 text-base font-medium text-ink shadow-control hover:bg-card-head"
            >
              Open
            </a>
          </div>
        </div>
        <Button size="lg" variant="primary" className="w-full" onClick={onAnother} data-testid="public-another">
          New request
        </Button>
      </div>
    </Card>
  );
}
