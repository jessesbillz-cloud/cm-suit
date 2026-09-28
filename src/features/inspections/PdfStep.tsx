// The IR PDF: Generate IR (signed on the server, silent), Update PDF when the signed content changed, Delete PDF &
// start over (a legal record: asked once, inline), and a re-stamp when the POSTPONED mark is out of step.
import { useState } from 'react';
import { FileSignature, RefreshCw, Trash2 } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { useDeletePdf, useGenerateIr, useRestampIr } from '../../data/inspections.decide';
import type { IrRequest } from '../../data/inspections.types';
import { buildFilename } from '../../lib/buildFilename';
import { Button } from '../../ui/Button';
import { StatusChip } from '../../ui/StatusChip';
import { useToast } from '../../ui/Toast';
import { SignButton } from '../auth/SignButton';
import { IR_FILENAME } from './model';

interface PdfStepProps {
  row: IrRequest;
  jobName: string;
}

export function PdfStep({ row, jobName }: PdfStepProps) {
  const generate = useGenerateIr();
  const restamp = useRestampIr();
  const remove = useDeletePdf();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  if (row.result === null || (row.status === 'postponed' && row.ir_file_id === null)) return null;
  const filename = buildFilename(IR_FILENAME, { number: row.number, date: row.request_date, fields: { Project: jobName } });
  const sign = () => generate.mutateAsync({ row, filename });
  const onSigned = () => {
    toast.show({ message: `IR ${String(row.number)} made.` });
  };
  const stampOff = (row.status === 'postponed') !== row.pdf_postponed;

  if (row.ir_file_id === null) {
    return (
      <div>
        <SignButton label="Generate IR" testId="ir-generate" icon={FileSignature} pending={generate.isPending} sign={sign} onSigned={onSigned} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="ir-pdf">
      {row.pdf_stale ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status="pending" label="PDF out of date" />
          <SignButton label="Update PDF" testId="ir-update-pdf" icon={FileSignature} pending={generate.isPending} sign={sign} onSigned={onSigned} />
        </div>
      ) : null}
      {stampOff && !row.pdf_stale ? (
        <div>
          <Button
            size="sm"
            icon={RefreshCw}
            loading={restamp.isPending}
            onClick={() => {
              restamp.mutate(row, {
                onError: (e) => {
                  toast.show({ tone: 'error', message: messageOf(e) });
                },
              });
            }}
          >
            {row.status === 'postponed' ? 'Stamp PDF postponed' : 'Remove postponed stamp'}
          </Button>
        </div>
      ) : null}
      {deleting ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          Delete IR {row.number} PDF?
          <Button
            size="sm"
            variant="danger"
            loading={remove.isPending}
            onClick={() => {
              remove.mutate(row, {
                onSuccess: () => {
                  setDeleting(false);
                },
                onError: (e) => {
                  toast.show({ tone: 'error', message: messageOf(e) });
                },
              });
            }}
          >
            Delete
          </Button>
          <Button
            size="sm"
            variant="quiet"
            onClick={() => {
              setDeleting(false);
            }}
          >
            Keep
          </Button>
        </div>
      ) : (
        <div>
          <Button
            size="sm"
            variant="quiet"
            icon={Trash2}
            onClick={() => {
              setDeleting(true);
            }}
          >
            Delete PDF & start over
          </Button>
        </div>
      )}
    </div>
  );
}
