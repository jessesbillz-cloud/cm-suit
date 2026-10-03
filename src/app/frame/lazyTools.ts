// Each tool's code loads the first time it is needed, so a first screen downloads only the frame and its own tool
// (speed comes right after security, Jesse Oct 1). preloadTool starts a tool's download before the click: the rail on
// hover or focus, the phone's tabs on touch, More when it opens, and the open tool as soon as the frame starts.
// lazyRouteComponent (the router's lazy helper) gives each part a preload() and, after a deploy has replaced the
// files, reloads the page once instead of failing.
import { lazyRouteComponent } from '@tanstack/react-router';
import type { Tool } from '../../lib/layout';

// The main area, one screen per tool.
export const Board = lazyRouteComponent(() => import('../../features/board/Board').then((m) => ({ default: m.Board })));
export const FilesTool = lazyRouteComponent(() => import('../../features/files/FilesTool').then((m) => ({ default: m.FilesTool })));
export const BidPipeline = lazyRouteComponent(() =>
  import('../../features/bids/BidPipeline').then((m) => ({ default: m.BidPipeline })),
);
export const BidsTool = lazyRouteComponent(() => import('../../features/bids/BidsTool').then((m) => ({ default: m.BidsTool })));
export const PeopleTool = lazyRouteComponent(() => import('../../features/people/PeopleTool').then((m) => ({ default: m.PeopleTool })));
export const SettingsTool = lazyRouteComponent(() =>
  import('../../features/settings/SettingsTool').then((m) => ({ default: m.SettingsTool })),
);
export const CalendarTool = lazyRouteComponent(() =>
  import('../../features/calendar/CalendarTool').then((m) => ({ default: m.CalendarTool })),
);
export const DailiesTool = lazyRouteComponent(() => import('../../features/dailies/DailiesTool').then((m) => ({ default: m.DailiesTool })));
export const InspectionsTool = lazyRouteComponent(() =>
  import('../../features/inspections/InspectionsTool').then((m) => ({ default: m.InspectionsTool })),
);
export const RevsTool = lazyRouteComponent(() => import('../../features/revs/RevsTool').then((m) => ({ default: m.RevsTool })));
export const DeliveriesTool = lazyRouteComponent(() =>
  import('../../features/deliveries/DeliveriesTool').then((m) => ({ default: m.DeliveriesTool })),
);
export const CorrectionsTool = lazyRouteComponent(() =>
  import('../../features/corrections/CorrectionsTool').then((m) => ({ default: m.CorrectionsTool })),
);
export const RfisTool = lazyRouteComponent(() => import('../../features/rfis/RfisTool').then((m) => ({ default: m.RfisTool })));
export const PermitsTool = lazyRouteComponent(() => import('../../features/permits/PermitsTool').then((m) => ({ default: m.PermitsTool })));
export const HoursTool = lazyRouteComponent(() => import('../../features/hours/HoursTool').then((m) => ({ default: m.HoursTool })));
export const TimesheetsTool = lazyRouteComponent(() =>
  import('../../features/timesheets/TimesheetsTool').then((m) => ({ default: m.TimesheetsTool })),
);

// An opened item: the right column, the phone's full screen, or its own window.
export const BoardItem = lazyRouteComponent(() => import('../../features/board/BoardItem').then((m) => ({ default: m.BoardItem })));
export const FileItem = lazyRouteComponent(() => import('../../features/files/FileItem').then((m) => ({ default: m.FileItem })));
export const BidsItem = lazyRouteComponent(() => import('../../features/bids/BidsItem').then((m) => ({ default: m.BidsItem })));
export const CalendarItem = lazyRouteComponent(() =>
  import('../../features/calendar/CalendarItem').then((m) => ({ default: m.CalendarItem })),
);
export const DailiesItem = lazyRouteComponent(() => import('../../features/dailies/DailiesItem').then((m) => ({ default: m.DailiesItem })));
export const InspectionsItem = lazyRouteComponent(() =>
  import('../../features/inspections/InspectionsItem').then((m) => ({ default: m.InspectionsItem })),
);
export const RevsItem = lazyRouteComponent(() => import('../../features/revs/RevsItem').then((m) => ({ default: m.RevsItem })));
export const DeliveryItem = lazyRouteComponent(() =>
  import('../../features/deliveries/DeliveryItem').then((m) => ({ default: m.DeliveryItem })),
);
export const CorrectionItem = lazyRouteComponent(() =>
  import('../../features/corrections/CorrectionItem').then((m) => ({ default: m.CorrectionItem })),
);
export const RfiItem = lazyRouteComponent(() => import('../../features/rfis/RfiItem').then((m) => ({ default: m.RfiItem })));
export const PermitItem = lazyRouteComponent(() => import('../../features/permits/PermitItem').then((m) => ({ default: m.PermitItem })));
export const HoursItem = lazyRouteComponent(() => import('../../features/hours/HoursItem').then((m) => ({ default: m.HoursItem })));
export const TimesheetsItem = lazyRouteComponent(() =>
  import('../../features/timesheets/TimesheetsItem').then((m) => ({ default: m.TimesheetsItem })),
);
export const CommentsPanel = lazyRouteComponent(() =>
  import('../../features/comments/CommentsPanel').then((m) => ({ default: m.CommentsPanel })),
);

// The desktop's docked panel: what's on today beside the board, the board beside every other tool.
export const TodayPanel = lazyRouteComponent(() => import('../../features/board/TodayPanel').then((m) => ({ default: m.TodayPanel })));
export const DockedBoard = lazyRouteComponent(() => import('../../features/board/DockedBoard').then((m) => ({ default: m.DockedBoard })));

interface Part {
  preload?: () => Promise<void> | undefined;
}

/** A tool's screen and its item view; Bids on All my jobs is the pipeline. */
function partsOf(tool: Tool, onJob: boolean): readonly Part[] {
  switch (tool) {
    case 'board':
      return [Board, BoardItem];
    case 'files':
      return [FilesTool, FileItem];
    case 'bids':
      return onJob ? [BidsTool, BidsItem] : [BidPipeline];
    case 'people':
      return [PeopleTool];
    case 'settings':
      return [SettingsTool];
    case 'calendar':
      return [CalendarTool, CalendarItem];
    case 'dailies':
      return [DailiesTool, DailiesItem];
    case 'inspections':
      return [InspectionsTool, InspectionsItem];
    case 'revs':
      return [RevsTool, RevsItem];
    case 'deliveries':
      return [DeliveriesTool, DeliveryItem];
    case 'corrections':
      return [CorrectionsTool, CorrectionItem];
    case 'rfis':
      return [RfisTool, RfiItem];
    case 'permits':
      return [PermitsTool, PermitItem];
    case 'hours':
      return [HoursTool, HoursItem];
    case 'timesheets':
      return [TimesheetsTool, TimesheetsItem];
  }
}

/**
 * Starts downloading a tool's code (once; later calls do nothing). Never throws: a failed download is retried, and
 * shown, when the tool renders.
 */
export function preloadTool(tool: Tool, onJob: boolean): void {
  for (const part of partsOf(tool, onJob)) void part.preload?.();
}

/** The desktop's docked panel for a tool (the phone has none). */
export function preloadDocked(tool: Tool): void {
  void (tool === 'board' ? TodayPanel : DockedBoard).preload?.();
}
