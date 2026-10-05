// "View IR" on the status link (0075): the request's IR PDF by the same receipt, once made. One click saves it with its
// own filename (lib/saveFile); the server signs a fresh URL and logs the download each time.
import { FileText } from 'lucide-react';
import { messageOf } from '../../data/errors';
import { usePublicIr } from '../../data/requestNoLogin';
import { saveFile } from '../../lib/saveFile';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';

export function PublicIr({ projectId, receipt }: { projectId: string; receipt: string }) {
  const ir = usePublicIr(projectId, receipt);
  const toast = useToast();
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="lg"
        variant="primary"
        icon={FileText}
        className="w-full"
        loading={ir.isPending}
        data-testid="public-view-ir"
        onClick={() => {
          ir.mutate(undefined, {
            onSuccess: (file) => {
              saveFile(file.url, file.filename).catch((e: unknown) => {
                toast.show({ tone: 'error', message: `Not saved: ${messageOf(e)}` });
              });
            },
          });
        }}
      >
        View IR
      </Button>
      {ir.isError ? (
        <p role="alert" className="text-sm text-danger">
          {messageOf(ir.error)}
        </p>
      ) : null}
    </div>
  );
}
