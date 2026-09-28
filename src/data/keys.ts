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
  /** Every dailies query of a job sits under this prefix (SPEC §13.1). */
  dailies: (projectId: string) => ['dailies', projectId] as const,
  dailiesPart: (projectId: string, part: string, id = '') => ['dailies', projectId, part, id] as const,
};
