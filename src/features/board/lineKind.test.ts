import { describe, expect, it } from 'vitest';
import { ListTodo } from 'lucide-react';
import { TOOL_META } from '../../ui/tools';
import { kindIcon } from './lineKind';

describe('board line icons', () => {
  it("a line about a record wears its tool's icon", () => {
    expect(kindIcon('file', 'f-1', 'file.uploaded')).toBe(TOOL_META.files.icon);
    expect(kindIcon('inspection_request', 'ir-1', 'ir.results')).toBe(TOOL_META.inspections.icon);
    // 0061: the deputy's line when a request reaches OFS, and the requester's "sent to OFS".
    expect(kindIcon('inspection_request', 'ir-1', 'ir.ofs')).toBe(TOOL_META.inspections.icon);
    expect(kindIcon('', '', 'ir.ofs')).toBe(TOOL_META.inspections.icon);
    expect(kindIcon('addendum', 'a-1', 'addendum.issued')).toBe(TOOL_META.bids.icon);
    expect(kindIcon('project_member', '', 'member.revoked')).toBe(TOOL_META.people.icon);
  });
  it("a line about no record goes by the event's first word, else the board's icon", () => {
    expect(kindIcon('', '', 'member.joined')).toBe(TOOL_META.people.icon);
    expect(kindIcon(null, null, 'rfi.asked')).toBe(TOOL_META.rfis.icon);
    expect(kindIcon('', '', 'note')).toBe(TOOL_META.board.icon);
    expect(kindIcon(null, null, 'review', ListTodo)).toBe(ListTodo);
  });
});
