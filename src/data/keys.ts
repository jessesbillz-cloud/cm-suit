// TanStack Query keys: one table so invalidation is never guessed.
export const qk = {
  myProjects: ['my_projects'] as const,
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
};
