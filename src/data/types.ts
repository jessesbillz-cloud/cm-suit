// Shapes the app reads. Derived from the generated types so a migration change surfaces as a type error.
import type { Database, Tables } from './database.types';

type Fns = Database['public']['Functions'];

export type MyProject = Fns['my_projects']['Returns'][number];
export type BoardLine = Fns['board_feed']['Returns'][number];
// The generator types RETURNS TABLE columns as non-null; these two are nullable in practice (invited, no end date).
type PersonRaw = Fns['people_display']['Returns'][number];
export type Person = Omit<PersonRaw, 'user_id' | 'access_ends_at'> & { user_id: string | null; access_ends_at: string | null };

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
  'user_id' | 'email' | 'full_name' | 'phone' | 'title' | 'company' | 'timezone' | 'timezone_set_by_user' | 'version'
>;

export type ProfilePatch = Pick<ProfileRow, 'full_name' | 'phone' | 'title' | 'company' | 'timezone' | 'timezone_set_by_user'>;

export type ProjectRow = Pick<
  Tables<'projects'>,
  | 'id'
  | 'org_id'
  | 'name'
  | 'number'
  | 'address'
  | 'timezone'
  | 'stage'
  | 'modules'
  | 'settings'
  | 'version'
  | 'job_type'
  | 'prevailing_wage'
  | 'bid_due_at'
  | 'bid_sealed'
>;

/** The job fields a person edits in Settings (the column grants in migration 0013 allow exactly these and a few more). */
export type ProjectPatch = Partial<
  Pick<
    ProjectRow,
    'name' | 'number' | 'address' | 'timezone' | 'stage' | 'modules' | 'job_type' | 'prevailing_wage' | 'bid_due_at' | 'bid_sealed' | 'settings'
  >
>;

export type MyOrg = Fns['my_orgs']['Returns'][number];

export type OrgPatch = Partial<Pick<MyOrg, 'name' | 'kind'>>;

export interface NewJobInput {
  orgId: string;
  name: string;
  stage: string;
  number: string;
  address: string;
  bidDueAt: string | null;
  prevailingWage: boolean;
  jobType: string;
}

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
