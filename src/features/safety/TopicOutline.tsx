// What the leader reads out: the talk's points in large type, the questions to discuss, the notes of an own topic, the
// regulation it rests on with its official page, and the talk's PDF (one click, through its gate).
import { useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { downloadErrorMessage, downloadFile } from '../../data/download';
import { downloadTopicFile } from '../../data/safety.mutations';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';

interface Outline {
  points: readonly string[];
  questions: readonly string[];
  notes?: string | undefined;
  source: string | null;
  source_url: string | null;
}

interface TopicOutlineProps {
  projectId: string;
  outline: Outline;
  /** The talk's PDF: a file of the job's Safety folder, or a library topic's (its own gate). */
  pdf: { fileId: string } | { topicId: string } | null;
}

function PdfButton({ projectId, pdf }: { projectId: string; pdf: NonNullable<TopicOutlineProps['pdf']> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      icon={FileText}
      loading={busy}
      className="self-start"
      data-testid="safety-outline-pdf"
      onClick={() => {
        setBusy(true);
        const go = 'fileId' in pdf ? downloadFile(pdf.fileId) : downloadTopicFile(projectId, pdf.topicId);
        go.then(
          () => {
            setBusy(false);
          },
          (e: unknown) => {
            setBusy(false);
            toast.show({ tone: 'error', message: downloadErrorMessage(e) });
          },
        );
      }}
    >
      Download PDF
    </Button>
  );
}

export function TopicOutline({ projectId, outline, pdf }: TopicOutlineProps) {
  const notes = outline.notes?.trim() ?? '';
  if (outline.points.length === 0 && outline.questions.length === 0 && notes === '' && !outline.source && !pdf) return null;
  return (
    <section className="flex flex-col gap-3" data-testid="safety-outline">
      {outline.points.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {outline.points.map((p, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-6 text-ink">
              <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="min-w-0 break-words">{p}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {outline.questions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[13px] font-semibold text-ink-2">Discuss</h3>
          <ol className="flex flex-col gap-1.5">
            {outline.questions.map((q, i) => (
              <li key={i} className="flex gap-2.5 text-[15px] leading-6 text-ink">
                <span className="w-4 shrink-0 font-semibold tabular-nums text-ink-3">{i + 1}</span>
                <span className="min-w-0 break-words">{q}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {notes !== '' ? <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-ink">{notes}</p> : null}
      {outline.source ? (
        outline.source_url ? (
          <a
            href={outline.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-accent hover:underline"
            data-testid="safety-outline-source"
          >
            {outline.source}
            <Icon icon={ExternalLink} size={13} />
          </a>
        ) : (
          <p className="text-[13px] text-ink-2">{outline.source}</p>
        )
      ) : null}
      {pdf ? <PdfButton projectId={projectId} pdf={pdf} /> : null}
    </section>
  );
}
