// The Files page's frame: its header (title, the line under it, Upload and the AI switch) over its content. Holding a
// file's box (a spec section's PDF pages, data-fill), it fills the main area and the box scrolls.
import type { ReactNode } from 'react';
import { PageHeader } from '../../ui/PageHeader';
import { TOOL_META } from '../../ui/tools';

interface FrameProps {
  meta?: string | undefined;
  actions?: ReactNode;
  below?: ReactNode;
  children: ReactNode;
}

const META = TOOL_META.files;

export function FilesFrame({ meta, actions, below, children }: FrameProps) {
  return (
    <div className="flex flex-col has-[[data-fill]]:h-full">
      <PageHeader title={META.label} icon={META.icon} meta={meta} actions={actions} below={below} />
      {children}
    </div>
  );
}
