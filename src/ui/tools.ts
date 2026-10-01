// Tool names and icons: one table for the rail, the phone bar and the settings screen.
import {
  CalendarDays,
  ClipboardCheck,
  Clock,
  FileQuestion,
  Folder,
  Gavel,
  ListChecks,
  MessagesSquare,
  NotebookPen,
  ReceiptText,
  Settings,
  Stamp,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Tool } from '../lib/layout';

export const TOOL_META: Record<Tool, { label: string; icon: LucideIcon }> = {
  board: { label: 'Board', icon: MessagesSquare },
  files: { label: 'Files', icon: Folder },
  bids: { label: 'Bids', icon: Gavel },
  calendar: { label: 'Calendar', icon: CalendarDays },
  dailies: { label: 'Dailies', icon: NotebookPen },
  inspections: { label: 'Inspections', icon: ClipboardCheck },
  rfis: { label: 'RFIs', icon: FileQuestion },
  permits: { label: 'Permits', icon: Stamp },
  deliveries: { label: 'Deliveries', icon: Truck },
  corrections: { label: 'Corrections', icon: ListChecks },
  people: { label: 'People', icon: Users },
  settings: { label: 'Settings', icon: Settings },
  hours: { label: 'Hours', icon: Clock },
  timesheets: { label: 'Timesheets', icon: ReceiptText },
};
