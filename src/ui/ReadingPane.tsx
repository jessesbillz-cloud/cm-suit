// The reading pane (SPEC §7.4): one flat view. Header, body, attachments with one-click downloads, and a footer
// with "Open in new window", the item's own actions and "Download". History sits behind one link. Arrow keys move to
// the next/previous item.
import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Download, ExternalLink, History, Paperclip } from 'lucide-react';
import { formatBytes } from '../lib/format';
import { Button } from './Button';
import { Icon } from './Icon';

interface Attachment {
  id: string;
  name: string;
  size?: number | undefined;
}

interface ReadingPaneProps {
  /** A small line above the title saying what the item is (e.g. an icon and "IR 12"). */
  eyebrow?: ReactNode | undefined;
  number?: string | undefined;
  title: string;
  /** One line under the title: who, when, which job. */
  meta?: ReactNode | undefined;
  children?: ReactNode | undefined;
  attachments?: readonly Attachment[] | undefined;
  onDownloadAttachment?: ((id: string) => void) | undefined;
  /** Which attachment is downloading right now (shows a spinner on that one button). */
  downloadingId?: string | null | undefined;
  onOpenWindow?: (() => void) | undefined;
  onDownload?: (() => void) | undefined;
  downloading?: boolean | undefined;
  /** The footer's Download label when it says what downloads (e.g. "Download IR"). */
  downloadLabel?: string | undefined;
  /** More footer buttons, before Download (e.g. "Open in Files"). "Open in new window" then shows as an icon. */
  actions?: ReactNode | undefined;
  onPrev?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  onHistory?: (() => void) | undefined;
}

function isTyping(target: EventTarget): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export function ReadingPane(props: ReadingPaneProps) {
  const { eyebrow, number, title, meta, children, attachments = [], actions, onPrev, onNext, onHistory } = props;
  const root = useRef<HTMLElement>(null);

  // Focus the pane when the item changes, so the arrow keys work straight away.
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, [title, number]);

  return (
    <article
      ref={root}
      tabIndex={-1}
      className="flex h-full flex-col outline-none"
      onKeyDown={(e) => {
        if (isTyping(e.target)) return;
        if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && onNext) {
          e.preventDefault();
          onNext();
        } else if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && onPrev) {
          e.preventDefault();
          onPrev();
        }
      }}
    >
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink-2">{eyebrow}</div> : null}
          <h1 className="break-words text-base font-semibold text-ink">
            {number ? <span className="mr-2 tabular-nums text-ink-2">{number}</span> : null}
            {title}
          </h1>
          {meta ? <div className="mt-1 text-sm text-ink-2">{meta}</div> : null}
        </div>
        {onPrev ?? onNext ? (
          <div className="flex gap-1">
            <Button size="sm" variant="quiet" icon={ChevronUp} aria-label="Previous item" disabled={!onPrev} onClick={onPrev} />
            <Button size="sm" variant="quiet" icon={ChevronDown} aria-label="Next item" disabled={!onNext} onClick={onNext} />
          </div>
        ) : null}
      </header>

      <div className="flex-1 overflow-auto px-5 py-4 text-sm leading-6 text-ink">
        {children}
        {attachments.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2" aria-label="Attachments">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                <Icon icon={Paperclip} size={16} className="text-ink-3" />
                <span className="min-w-0 flex-1 break-words">{a.name}</span>
                {a.size !== undefined ? <span className="text-xs text-ink-2">{formatBytes(a.size)}</span> : null}
                {props.onDownloadAttachment ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Download}
                    loading={props.downloadingId === a.id}
                    onClick={() => {
                      props.onDownloadAttachment?.(a.id);
                    }}
                  >
                    Download
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {onHistory ? (
          <button type="button" className="mt-4 inline-flex items-center gap-1 text-sm text-accent hover:underline" onClick={onHistory}>
            <Icon icon={History} size={14} />
            History
          </button>
        ) : null}
      </div>

      {props.onOpenWindow ?? props.onDownload ?? actions ? (
        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          {props.onOpenWindow && actions ? (
            <Button
              variant="quiet"
              icon={ExternalLink}
              aria-label="Open in new window"
              title="Open in new window"
              className="mr-auto"
              onClick={props.onOpenWindow}
            />
          ) : null}
          {props.onOpenWindow && !actions ? (
            <Button variant="quiet" icon={ExternalLink} onClick={props.onOpenWindow}>
              Open in new window
            </Button>
          ) : null}
          {actions}
          {props.onDownload ? (
            <Button variant="primary" icon={Download} loading={props.downloading} onClick={props.onDownload}>
              {props.downloadLabel ?? 'Download'}
            </Button>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
