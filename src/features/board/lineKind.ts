// The type icon a board line (or a task) leads with: the icon of the tool that owns its record (lib/entityTarget, the
// one type -> tool mapping), else the tool named by the event's first word ('member.joined'), else the fallback.
import type { LucideIcon } from 'lucide-react';
import { entityTarget } from '../../lib/entityTarget';
import type { Tool } from '../../lib/layout';
import { TOOL_META } from '../../ui/tools';

/** Lines about no record: the event's first word. */
const EVENT_TOOL: Record<string, Tool> = {
  file: 'files',
  member: 'people',
  bid: 'bids',
  addendum: 'bids',
  ir: 'inspections',
  delivery: 'deliveries',
  correction: 'corrections',
  rfi: 'rfis',
  daily: 'dailies',
};

export function kindIcon(
  entityType: string | null,
  entityId: string | null,
  kind: string,
  fallback: LucideIcon = TOOL_META.board.icon,
): LucideIcon {
  // The feed returns '' for "no record".
  const target = entityTarget(entityType === '' ? null : entityType, entityId === '' ? null : entityId);
  const tool = target?.tool ?? EVENT_TOOL[kind.split('.')[0] ?? ''];
  return tool ? TOOL_META[tool].icon : fallback;
}
