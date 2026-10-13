// The spec section in front of the uploader (Jesse, Oct 12). A drop or an Upload first has the words of its nameless
// PDFs bound for Submittals, RFIs or CCDs read here (dropSections); files bound for Submittals that still have no section
// are asked for one (SectionPrompt) and go on renamed. Every file goes up with the step that files its section.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AfterUpload } from '../../data/UploadQueue';
import { messageOf } from '../../data/errors';
import { specBooksQuery } from '../../data/specs';
import { useToast } from '../../ui/Toast';
import type { SectionKind } from './classify';
import type { DroppedFile } from './collectDrop';
import { fileSectionStep, textSections, toRead } from './dropSections';
import { SectionPrompt } from './SectionPrompt';
import { applySections, unnamedSubmittals, type Unnamed } from './submittalNames';

interface Asking {
  dropped: DroppedFile[];
  items: Unnamed[];
  after: AfterUpload;
}

export function useSubmittalNaming(
  projectId: string,
  viewing: SectionKind,
  send: (dropped: DroppedFile[], after: AfterUpload) => void,
) {
  const [asking, setAsking] = useState<Asking | null>(null);
  const [reading, setReading] = useState(false);
  const books = useQuery(specBooksQuery(projectId));
  const toast = useToast();

  const go = (dropped: DroppedFile[], found: ReadonlyMap<number, string>) => {
    const byText = new Map<File, string>();
    for (const [at, section] of found) {
      const d = dropped[at];
      if (d) byText.set(d.file, section);
    }
    const after = fileSectionStep(byText);
    const items = unnamedSubmittals(dropped, viewing).filter((i) => !found.has(i.at));
    if (items.length === 0) send(dropped, after);
    else setAsking({ dropped, items, after });
  };

  const start = (dropped: DroppedFile[]) => {
    const at = toRead(dropped, viewing);
    if (at.length === 0) {
      go(dropped, new Map());
      return;
    }
    setReading(true);
    const book = (books.data ?? []).flatMap((b) => b.sections);
    textSections(dropped, at, book).then(
      (found) => {
        setReading(false);
        go(dropped, found);
      },
      (e: unknown) => {
        // The files still go up; only their words were not read.
        setReading(false);
        toast.show({ tone: 'error', message: `Spec sections not read: ${messageOf(e)}` });
        go(dropped, new Map());
      },
    );
  };

  const prompt = asking ? (
    <SectionPrompt
      projectId={projectId}
      items={asking.items}
      onCancel={() => {
        setAsking(null);
      }}
      onDone={(keys) => {
        send(applySections(asking.dropped, keys), asking.after);
        setAsking(null);
      }}
    />
  ) : reading ? (
    <p
      role="status"
      data-testid="upload-reading"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-[13px] font-medium text-white shadow-pop"
    >
      Reading files
    </p>
  ) : null;
  return { start, prompt };
}
