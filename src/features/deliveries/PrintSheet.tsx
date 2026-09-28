// A printable sheet over the page (receipt, monthly summary, link poster). While it is open, printing shows only the
// sheet: the rest of the page is hidden by a print-only rule.
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { Button } from '../../ui/Button';

const PRINT_CSS =
  '@media print { body > *:not(.print-sheet) { display: none !important; } .print-sheet { position: static !important; overflow: visible !important; } }';

interface PrintSheetProps {
  onClose: () => void;
  children: ReactNode;
}

export function PrintSheet({ onClose, children }: PrintSheetProps) {
  return createPortal(
    <div className="print-sheet fixed inset-0 z-50 overflow-auto bg-card" data-testid="print-sheet">
      <style>{PRINT_CSS}</style>
      <div className="flex justify-end gap-2 border-b border-line p-3 print:hidden">
        <Button variant="primary" icon={Printer} onClick={() => {
            window.print();
          }}>
          Print
        </Button>
        <Button onClick={onClose}>Close</Button>
      </div>
      <div className="mx-auto max-w-3xl p-8">{children}</div>
    </div>,
    document.body,
  );
}
