// Shapes the app reads. Derived from the generated types so a migration change surfaces as a type error.
import type { Database, Tables } from './database.types';

type Fns = Database['public']['Functions'];

export type MyProject = Fns['my_projects']['Returns'][number];
export type BoardLine = Fns['board_feed']['Returns'][number];
export type Person = Fns['people_display']['Returns'][number];

export type TaskRow = Pick<
  Tables<'tasks'>,
  'id' | 'project_id' | 'kind' | 'title' | 'entity_type' | 'entity_id' | 'due_at' | 'requires_signature' | 'version'
>;

export type FolderRow = Pick<Tables<'folders'>, 'id' | 'project_id' | 'parent_id' | 'name' | 'kind' | 'view_only' | 'proprietary'>;

export type FileRow = Pick<
  Tables<'files'>,
  | 'id'
  | 'project_id'
  | 'folder_id'
  | 'original_name'
  | 'mime'
  | 'size'
  | 'scan_status'
  | 'upload_complete'
  | 'created_at'
  | 'created_by'
>;

export type ActivityRow = Pick<
  Tables<'activity'>,
  'id' | 'project_id' | 'kind' | 'entity_type' | 'entity_id' | 'summary' | 'actor_user_id' | 'created_at'
>;

export type ProfileRow = Pick<
  Tables<'profiles'>,
  'user_id' | 'email' | 'full_name' | 'phone' | 'title' | 'company' | 'timezone' | 'version'
>;

export type ProfilePatch = Pick<ProfileRow, 'full_name' | 'phone' | 'title' | 'company' | 'timezone'>;

export type ProjectRow = Pick<
  Tables<'projects'>,
  'id' | 'org_id' | 'name' | 'number' | 'address' | 'timezone' | 'stage' | 'modules' | 'settings' | 'version'
>;

export type RoleRow = Pick<Tables<'roles'>, 'name' | 'description'>;

export interface AppUser {
  id: string;
  email: string;
}

export interface InviteInput {
  project_id: string;
  email: string;
  role: string;
  access_ends_at?: string | null;
}

export interface InviteResult {
  member_id: string;
  status: string;
  link_url: string;
  email_status: string;
  email_error: string | null;
}
