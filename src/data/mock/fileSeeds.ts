// Synthetic plans and submittals on Sample Job B for Files' sections (0097): sheets in Plans, a "submittals" folder of
// people's own (Files adopts it as the Submittals section) with two trade folders, and a loose folder for To sort.
// Obviously fake names and companies (CLAUDE.md rule 8).
import type { FileRow, FolderRow } from '../types';

const JOB = 'job-b';

function folder(suffix: string, parent: string | null, name: string): FolderRow {
  return {
    id: `${JOB}-${suffix}`,
    project_id: JOB,
    parent_id: parent === null ? null : `${JOB}-${parent}`,
    name,
    kind: 'general',
    view_only: false,
    proprietary: false,
    sort: 100,
    ai_reads: true,
    version: 1,
    file_count: null,
    app_only: false,
    person: null,
  };
}

export const SECTION_SEED_FOLDERS: FolderRow[] = [
  folder('submittals', null, 'submittals'),
  folder('trade-framing', 'submittals', '092000 - Framing, Drywall, Exterior Finishes - Sample Drywall Co'),
  folder('trade-insulation', 'submittals', '072100 - Thermal Insulation - Sample Insulation Co'),
  folder('loose', null, 'Sample loose papers'),
];

function file(n: number, suffix: string, name: string): FileRow {
  return {
    id: `${JOB}-section-file-${String(n)}`,
    project_id: JOB,
    folder_id: `${JOB}-${suffix}`,
    original_name: name,
    mime: 'application/pdf',
    size: 120_000 + n * 1_000,
    scan_status: 'clean',
    upload_complete: true,
    created_at: '2026-10-01T16:00:00Z',
    created_by: 'mock-someone',
  };
}

export const SECTION_SEED_FILES: FileRow[] = [
  file(1, 'plans', 'A201A Floor Plan Level 01 Area A.pdf'),
  file(2, 'plans', 'A101 Sample Site Plan.pdf'),
  file(3, 'plans', 'S-501 Sample Details.pdf'),
  file(4, 'trade-framing', '092900_04.0_Gypsum Board_PD_Acoustic Sealant_NET.pdf'),
  file(5, 'trade-framing', '092400_02.0_Exterior Portland Cement Plaster_PD_MCN RNR.pdf'),
  file(6, 'trade-insulation', '072100_02.0_Thermal Insulation_PD_MCN.pdf'),
  file(7, 'submittals', 'S-0147.0-079200-Joint Sealants- PD - XYZ - AAN.pdf'),
  file(8, 'loose', 'Sample meeting notes.pdf'),
];
