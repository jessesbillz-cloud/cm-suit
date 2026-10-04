// The QR sheet for the job site (MDR's qr.html): the job (none for the all-my-jobs link), "Request an inspection" (or the
// caller's title: a safety meeting's "Sign in"), the link's QR code and the link as text. One Letter page when printed
// (the print overlay is deliveries' one PrintSheet). QrCode is the one QR drawing (the meeting screen shows it too).
import { useMemo } from 'react';
import { encodeQr, qrPath } from '../../lib/qr';
import { shortLinkText } from '../../lib/requestLink';
import { PrintSheet } from '../deliveries/PrintSheet';

const PAGE_CSS = '@page { size: letter portrait; margin: 0.5in; }';
/** The quiet zone around the code, in modules (the standard's minimum). */
const QUIET = 4;

export function QrCode({ text, className = 'aspect-square w-full max-w-[4.5in]' }: { text: string; className?: string }) {
  const code = useMemo(() => encodeQr(text), [text]);
  const side = code.size + QUIET * 2;
  return (
    <svg
      viewBox={`0 0 ${String(side)} ${String(side)}`}
      role="img"
      aria-label="QR code"
      data-testid="qr-code"
      data-version={code.version}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={side} height={side} fill="#ffffff" />
      <path d={qrPath(code, QUIET)} fill="#000000" />
    </svg>
  );
}

interface QrSheetProps {
  /** The line over the title: the job's name. */
  over?: string | undefined;
  /** The big words: what the code is for. */
  title?: string | undefined;
  url: string;
  onClose: () => void;
}

export function QrSheet({ over, title = 'Request an inspection', url, onClose }: QrSheetProps) {
  return (
    <PrintSheet onClose={onClose}>
      <style>{PAGE_CSS}</style>
      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 text-center print:min-h-[9.5in]" data-testid="qr-sheet">
        {over ? <p className="break-words text-2xl font-medium text-ink-2">{over}</p> : null}
        <h1 className="text-4xl font-bold tracking-[-0.02em] text-ink sm:text-6xl print:text-6xl">{title}</h1>
        <QrCode text={url} />
        <p className="text-xl text-ink">Scan with your phone camera</p>
        <p className="max-w-full break-all font-mono text-[13px] text-ink-2">{shortLinkText(url)}</p>
      </div>
    </PrintSheet>
  );
}
