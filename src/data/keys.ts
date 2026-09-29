// TanStack Query keys: one table so invalidation is never guessed.
export const qk = {
  myProjects: ['my_projects'] as const,
  myOrgs: ['my_orgs'] as const,
  project: (projectId: string) => ['project', projectId] as const,
  board: (projectId: string | null) => ['board', projectId ?? 'all'] as const,
  activity: (id: string) => ['activity', id] as const,
  readMark: (projectId: string) => ['read_mark', projectId] as const,
  tasks: (projectId: string | null) => ['tasks', projectId ?? 'all'] as const,
  tasksAll: ['tasks'] as const,
  layout: ['user_layout'] as const,
  folders: (projectId: string) => ['folders', projectId] as const,
  files: (folderId: string) => ['files', folderId] as const,
  file: (fileId: string) => ['file', fileId] as const,
  people: (projectId: string) => ['people', projectId] as const,
  roles: ['roles'] as const,
  profile: ['profile'] as const,
  capability: (projectId: string, cap: string) => ['capability', projectId, cap] as const,
  orgAdmin: (orgId: string) => ['is_org_admin', orgId] as const,
  orgSettings: (orgId: string) => ['org_settings', orgId] as const,
  /** Every bids query of a job sits under this prefix: one invalidation after any bid write. */
  bids: (projectId: string) => ['bids', projectId] as const,
  bidsPart: (projectId: string, part: string, id = '') => ['bids', projectId, part, id] as const,
  /** Two-step login: the session's level and the verified authenticator. */
  mfa: ['mfa'] as const,
  /** Prefixes of everything RLS answers differently at aal2 (capabilities, bids and pricing access, bid files). */
  aal2Dependent: [['capability'], ['bids'], ['folders'], ['files'], ['file'], ['folder_can_write']] as const,
  /** Every id of one part (e.g. the received files of any folder), for a narrower refresh than qk.bids. */
  bidsPartAll: (projectId: string, part: string) => ['bids', projectId, part] as const,
  /** The org's sub directory (SPEC §11.2) and each sub's history sit under this prefix. */
  subs: (orgId: string) => ['subs', orgId] as const,
  subHistory: (orgId: string, subId: string) => ['subs', orgId, 'history', subId] as const,
  /** Calendar lines (SPEC §7.6): every range and every opened line sit under this prefix; one refresh after any write. */
  calendar: ['calendar'] as const,
  calendarRange: (projectId: string | null, from: string, to: string) => ['calendar', 'range', projectId ?? 'all', from, to] as const,
  calendarLine: (id: string) => ['calendar', 'line', id] as const,
  /** When my calendar feed link was made (never the token itself). */
  calendarFeed: ['calendar_feed'] as const,
  /** Every dailies query of a job sits under this prefix (SPEC §13.1). */
  dailies: (projectId: string) => ['dailies', projectId] as const,
  dailiesPart: (projectId: string, part: string, id = '') => ['dailies', projectId, part, id] as const,
  /** Every inspections query of a job sits under this prefix: one invalidation after any IR write. */
  inspections: (projectId: string) => ['inspections', projectId] as const,
  inspectionsPart: (projectId: string, part: string, id = '') => ['inspections', projectId, part, id] as const,
  /** The roles holding ir.decide (who can be a co-inspector), read from the capability matrix. */
  decideRoles: ['role_permissions', 'ir.decide'] as const,
  /** Every deliveries query of a job sits under this prefix: one invalidation after any delivery write. */
  deliveries: (projectId: string) => ['deliveries', projectId] as const,
  deliveriesPart: (projectId: string, part: string, id = '') => ['deliveries', projectId, part, id] as const,
  /** The public delivery link's board (no session): its own prefix, never mixed with the signed-in cache. */
  deliveryLink: (projectId: string) => ['delivery_link', projectId] as const,
  deliveryLinkPart: (projectId: string, part: string, id = '') => ['delivery_link', projectId, part, id] as const,
  /** Every corrections query of a job sits under this prefix: one invalidation after any corrections write. */
  corrections: (projectId: string) => ['corrections', projectId] as const,
  correctionsPart: (projectId: string, part: string, id = '') => ['corrections', projectId, part, id] as const,
  /** The bids pipeline across all my jobs (counts only). */
  bidPipeline: ['bid_pipeline'] as const,
  /** The CSI MasterFormat reference (the same for every job). */
  csi: ['csi'] as const,
  /** Every RFI query of a job sits under this prefix: one invalidation after any RFI write. */
  rfis: (projectId: string) => ['rfis', projectId] as const,
  rfisPart: (projectId: string, part: string, id = '') => ['rfis', projectId, part, id] as const,
  /** RFIs someone else is sitting on, across all my jobs (the top of "Needs you"). */
  rfiWaiting: ['rfi_waiting'] as const,
  /** A company's logo (path and a fresh signed URL for the preview). */
  orgLogo: (orgId: string) => ['org_logo', orgId] as const,
  /** Testing only: the "View as" control in the top bar (0039). */
  viewAs: ['testing_view_as'] as const,
  /** My role's recommended rail on each of my jobs (0040). */
  recommendedTools: ['my_recommended_tools'] as const,
  /** What needs me per record type (0040): under the tasks prefix, so every task write refreshes the rail badges. */
  toolCounts: (projectId: string | null) => ['tasks', 'tool_counts', projectId ?? 'all'] as const,
  /** Every hours query (my hours, contract hours, billing, invoices; 0043) sits under this prefix: one refresh after any write. */
  hours: ['hours'] as const,
  hoursPart: (part: string, id = '') => ['hours', part, id] as const,
  /** Today's report on each of my jobs (0045): the top of All my jobs. */
  dailyToday: ['daily_today'] as const,
  /** The job's inspection request link (members.manage) and my hub link (0046): on or off and since when, never a token. */
  requestLink: (projectId: string) => ['request_link', projectId] as const,
  requestHub: ['request_hub'] as const,
  /** The public request page (no session needed): its own prefix, never mixed with the signed-in cache. */
  requestLinkPublic: (projectId: string) => ['request_link_public', projectId] as const,
  /** Opened with the job's token or a hub's (`via`), as a session (or signed out): one answer each. */
  requestLinkOpen: (projectId: string, via: string) => ['request_link_public', projectId, 'open', via] as const,
  /** The public hub page's list of jobs. */
  requestHubPublic: (hubId: string) => ['request_hub_public', hubId] as const,
  /** A photo's short-lived preview URL (0047), per file and where it is opened from (its folder, an RFI, a request). */
  imagePreview: (fileId: string, via: string) => ['image_preview', fileId, via] as const,
};
