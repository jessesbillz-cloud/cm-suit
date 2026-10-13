// The home's RFIs waiting: the RFIs I sent or may issue that someone else is sitting on, late first, then the ones
// nobody has opened for days (the database's rfi_waiting decides). On a job's board they sit on top of Needs you.
import { useRfiWaiting } from '../../../data/rfis.queries';
import { Card } from '../../../ui/Card';
import { ErrorState, LoadingState } from '../../../ui/States';
import { RfiWaitingLine } from '../RfiWaiting';
import { useProjectZones } from '../zones';
import { CountTitle } from './CountTitle';

export function RfisWaitingCard() {
  const waiting = useRfiWaiting();
  const zoneOf = useProjectZones();
  const rows = waiting.data ?? [];
  const now = new Date();

  return (
    <div data-testid="home-rfis">
      <Card title={<CountTitle label="RFIs waiting" count={waiting.isSuccess ? rows.length : null} testId="home-rfis-count" />} padded={false}>
        {waiting.isPending ? <LoadingState label="Loading waiting RFIs" /> : null}
        {waiting.isError ? <ErrorState error={waiting.error} title="Waiting RFIs did not load." onRetry={() => void waiting.refetch()} /> : null}
        {waiting.isSuccess && rows.length === 0 ? <p className="px-4 py-3 text-sm text-ink-2">None waiting.</p> : null}
        {rows.length > 0 ? (
          <ul className="divide-y divide-line">
            {rows.map((w) => (
              <RfiWaitingLine key={w.id} row={w} showJob zone={zoneOf(w.project_id)} now={now} />
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
