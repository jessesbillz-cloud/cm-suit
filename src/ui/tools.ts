// Tool names and icons: one table for the rail, the phone bar and the settings screen.
import { CalendarDays, Folder, Gavel, MessagesSquare, Settings, Users, type LucideIcon } from 'lucide-react';
import type { Tool } from '../lib/layout';

export const TOOL_META: Record<Tool, { label: string; icon: LucideIcon }> = {
  board: { label: 'Board', icon: MessagesSquare },
  files: { label: 'Files', icon: Folder },
  bids: { label: 'Bids', icon: Gavel },
  calendar: { label: 'Calendar', icon: CalendarDays },
  people: { label: 'People', icon: Users },
  settings: { label: 'Settings', icon: Settings },
};
