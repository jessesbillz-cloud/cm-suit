// What needs me, per tool (Jesse, Sep 28: make the rail actionable). The database counts per record type
// (my_tool_counts: my open tasks plus the RFIs I'm waiting on); the tool that owns a type comes from lib/entityTarget,
// the one mapping.
import { entityTool } from './entityTarget';
import type { Tool } from './layout';

export interface TypeCount {
  /** null: a task about no record. */
  entity_type: string | null;
  n: number;
}

export type ToolCounts = Partial<Record<Tool, number>>;

/**
 * Each record type counts on the tool that owns it. A type no tool owns, or whose tool this rail can't reach (switched
 * off, or not a cross-job tool on "All my jobs"), counts on the Board, whose "Needs you" lists everything.
 */
export function countsByTool(rows: readonly TypeCount[], reachable: readonly Tool[]): ToolCounts {
  const out: ToolCounts = {};
  for (const r of rows) {
    const owner = entityTool(r.entity_type);
    const tool: Tool = owner !== null && reachable.includes(owner) ? owner : 'board';
    out[tool] = (out[tool] ?? 0) + r.n;
  }
  return out;
}

/** The total over some tools (the More item's count). */
export function countOf(counts: ToolCounts, tools: readonly Tool[]): number {
  return tools.reduce((sum, t) => sum + (counts[t] ?? 0), 0);
}

/** A badge's text: the count, at most "9+". */
export function badgeText(n: number): string {
  return n > 9 ? '9+' : String(n);
}
