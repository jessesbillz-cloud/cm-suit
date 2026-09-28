// The CSI MasterFormat reference (migration 0033): every division and a curated set of sections, the same for every
// job. Read-only for everyone; the org's own CSI list arrives later as org data (SPEC §11.2).
import type { Tables } from './database.types';

type CsiDivision = Pick<Tables<'csi_divisions'>, 'number' | 'title' | 'reserved'>;
export type CsiSection = Pick<Tables<'csi_sections'>, 'number' | 'division' | 'level' | 'title'>;

export interface CsiLibrary {
  divisions: CsiDivision[];
  sections: CsiSection[];
}
