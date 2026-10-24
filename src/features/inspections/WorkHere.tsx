// Work it here (0117; Jesse, Oct 23: "can't do anything - it gives me a view like the GC"): on a copy from My Daily
// Reports, whoever decides inspections on the job turns it into the suite's own request in one tap. It keeps its data,
// files and number, the nightly import leaves it alone from then on, and its steps show at once. The database refuses
// a copy whose number one of the job's own requests already carries, and says so.
import { Hammer } from 'lucide-react';
import { useWorkHere } from '../../data/inspections.decide';
import { refusalOf } from '../../data/errors';
import type { IrRequest } from '../../data/inspections.types';
import { Button } from '../../ui/Button';

export function WorkHere({ row }: { row: IrRequest }) {
  const work = useWorkHere();
  return (
    <div className="flex flex-col gap-2" data-testid="ir-work-here-box">
      <Button
        variant="primary"
        icon={Hammer}
        className="self-start"
        loading={work.isPending}
        data-testid="ir-work-here"
        onClick={() => {
          work.mutate(row);
        }}
      >
        Work it here
      </Button>
      {work.isError ? (
        <p role="alert" className="text-sm text-danger">
          {refusalOf(work.error)}
        </p>
      ) : null}
    </div>
  );
}
