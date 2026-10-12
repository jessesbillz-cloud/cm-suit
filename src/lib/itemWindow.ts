// An item alone in its own browser window (?window=1, SPEC §7.2): the one way to build its address and open it.
import { inAppPath } from './basePath';
import type { Tool } from './layout';

/** "All my jobs" tools that open items in the right column (the board's lines are the default). */
export function allItemTool(tool: Tool): 'calendar' | 'timesheets' | 'permits' | 'board' {
  return tool === 'calendar' || tool === 'timesheets' || tool === 'permits' ? tool : 'board';
}

/** The item's own-window address, with the app's base path in front. `projectId` null: All my jobs. */
function itemWindowHref(projectId: string | null, tool: Tool, itemId: string): string {
  const base = projectId === null ? `/all/${allItemTool(tool)}/${itemId}` : `/p/${projectId}/${tool}/${itemId}`;
  return inAppPath(`${base}?window=1`);
}

/** Opens the item in a new browser window. */
export function openItemWindow(projectId: string | null, tool: Tool, itemId: string): void {
  window.open(itemWindowHref(projectId, tool, itemId), '_blank', 'noopener');
}
