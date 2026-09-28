// /d/<project>?t=<token>: the job's delivery board for anyone with the link (SPEC §6.4 #3, §13.3). No sign-in:
// the three-week board, posting with a typed name, the receipt, and TV mode. Everything goes through src/data
// (deliveryLink.ts -> the delivery-board function), which answers board fields only.
import { useState } from 'react';
import { Monitor, Plus, Printer } from 'lucide-react';
import { useLinkBoard, useLinkReceipt } from '../../data/deliveryLink';
import { detectZone, todayInZone } from '../../lib/dates';
import { shiftDay } from '../../lib/deliveries';
import { PublicPage } from '../auth/PublicPage';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ErrorState, LoadingState } from '../../ui/States';
import { Board, boardWindow } from './Board';
import { PrintSheet } from './PrintSheet';
import { PublicPost } from './PublicPost';
import { PrintedReceipt, ReceiptBody } from './Receipt';
import { TV_DAYS, TV_REFRESH_MS, TvView } from './TvView';
import { enterFullScreen, leaveFullScreen, useToday } from './useTvScreen';
import { usePublicNav } from './usePublicNav';

interface LinkProps {
  projectId: string;
  token: string;
}

function PublicTv({ projectId, token, tz, onExit }: LinkProps & { tz: string; onExit: () => void }) {
  const today = useToday(tz);
  const board = useLinkBoard(projectId, token, today, shiftDay(today, TV_DAYS - 1), TV_REFRESH_MS);
  return <TvView title={board.data?.project_name ?? ''} tz={tz} rows={board.data?.deliveries} error={board.error} onExit={onExit} />;
}

interface ReceiptCardProps extends LinkProps {
  receiptId: string;
  tz: string;
  projectName: string;
  onClose: () => void;
}

function ReceiptCard({ projectId, token, receiptId, tz, projectName, onClose }: ReceiptCardProps) {
  const receipt = useLinkReceipt(projectId, token, receiptId);
  const [printing, setPrinting] = useState(false);
  if (receipt.isPending) return <LoadingState label="Loading the receipt" />;
  if (receipt.isError) return <ErrorState error={receipt.error} title="No receipt." />;
  return (
    <Card
      title="Posted"
      actions={
        <>
          <Button size="sm" icon={Printer} onClick={() => {
              setPrinting(true);
            }}>
            Print
          </Button>
          <Button size="sm" variant="quiet" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <ReceiptBody delivery={receipt.data} tz={tz} />
      {printing ? (
        <PrintSheet onClose={() => {
            setPrinting(false);
          }}>
          <PrintedReceipt projectName={projectName} delivery={receipt.data} tz={tz} />
        </PrintSheet>
      ) : null}
    </Card>
  );
}

function PublicBoard({ projectId, token }: LinkProps) {
  const nav = usePublicNav();
  // Until the board answers, "today" is this device's; then it is the job's.
  const [deviceZone] = useState(detectZone);
  const [tz, setTz] = useState<string | null>(null);
  const zone = tz ?? deviceZone;
  const today = todayInZone(zone);
  const day = nav.day ?? today;
  const { from, to } = boardWindow(day);
  const board = useLinkBoard(projectId, token, from, to);
  if (board.data && board.data.timezone !== tz) setTz(board.data.timezone);

  if (board.isPending) {
    return (
      <PublicPage title="Deliveries">
        <LoadingState label="Opening the board" />
      </PublicPage>
    );
  }
  if (board.isError && !board.data) {
    return (
      <PublicPage title="Link not active">
        <ErrorState error={board.error} title="This link does not work right now." />
      </PublicPage>
    );
  }
  const data = board.data;
  if (nav.view === 'tv') {
    return (
      <PublicTv
        projectId={projectId}
        token={token}
        tz={zone}
        onExit={() => {
          leaveFullScreen();
          nav.go({ view: 'board' });
        }}
      />
    );
  }

  return (
    <main className="min-h-[100dvh] bg-page px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm text-ink-2">{data.project_name}</p>
            <h1 className="text-xl font-semibold text-ink">Deliveries</h1>
          </div>
          <Button icon={Monitor} data-testid="deliveries-tv" onClick={() => {
              enterFullScreen();
              nav.go({ view: 'tv' });
            }}>
            TV
          </Button>
          {nav.view !== 'post' ? (
            <Button variant="primary" icon={Plus} data-testid="deliveries-post" onClick={() => {
                nav.go({ view: 'post', r: null });
              }}>
              Post delivery
            </Button>
          ) : null}
        </header>
        {nav.receiptId ? (
          <ReceiptCard
            projectId={projectId}
            token={token}
            receiptId={nav.receiptId}
            tz={zone}
            projectName={data.project_name}
            onClose={() => {
              nav.go({ r: null });
            }}
          />
        ) : null}
        {nav.view === 'post' ? (
          <PublicPost
            projectId={projectId}
            token={token}
            tz={zone}
            day={day}
            companies={data.companies}
            onPosted={(receipt) => {
              nav.go({ view: 'board', day: receipt.delivery_date, r: receipt.id });
            }}
            onCancel={() => {
              nav.go({ view: 'board' });
            }}
          />
        ) : null}
        <Card>
          <Board
            tz={zone}
            today={today}
            day={day}
            rows={data.deliveries}
            isPending={false}
            error={board.error}
            onRetry={() => void board.refetch()}
            onPickDay={(d) => {
              nav.go({ day: d });
            }}
          />
        </Card>
      </div>
    </main>
  );
}

export function PublicDeliveries() {
  const nav = usePublicNav();
  if (!nav.token) {
    return (
      <PublicPage title="Link incomplete">
        <p className="text-sm text-ink-2">This link is missing part of its address. Scan the poster again.</p>
      </PublicPage>
    );
  }
  return <PublicBoard key={nav.projectId} projectId={nav.projectId} token={nav.token} />;
}
