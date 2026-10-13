// The naming rule in front of the uploader: a drop or an Upload with files bound for Submittals that carry no spec
// section asks for one (SectionPrompt), then goes on renamed; anything else goes straight on.
import { useState } from 'react';
import type { SectionKind } from './classify';
import type { DroppedFile } from './collectDrop';
import { SectionPrompt } from './SectionPrompt';
import { applySections, unnamedSubmittals, type Unnamed } from './submittalNames';

interface Asking {
  dropped: DroppedFile[];
  items: Unnamed[];
}

export function useSubmittalNaming(projectId: string, viewing: SectionKind, send: (dropped: DroppedFile[]) => void) {
  const [asking, setAsking] = useState<Asking | null>(null);
  const start = (dropped: DroppedFile[]) => {
    const items = unnamedSubmittals(dropped, viewing);
    if (items.length === 0) send(dropped);
    else setAsking({ dropped, items });
  };
  const prompt = asking ? (
    <SectionPrompt
      projectId={projectId}
      items={asking.items}
      onCancel={() => {
        setAsking(null);
      }}
      onDone={(keys) => {
        send(applySections(asking.dropped, keys));
        setAsking(null);
      }}
    />
  ) : null;
  return { start, prompt };
}
