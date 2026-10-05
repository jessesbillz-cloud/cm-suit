// Bid packages in the e2e mock: two on each of Sample Job A and B, Sample Library Addition's full list (the
// estimator's CSI-division-plus-letter codes, spec sections on every one), and what a test adds or edits
// (sessionStorage, through the mock store). Like the database: codes are unique per job, sections are kept once each
// in number order, and a save with a stale version is refused.
import type { PackageRow } from '../bids.types';
import { conflictError, DataError } from '../errors';
import { delay, readMock, writeMock } from './store';

type Seed = readonly [code: string, name: string, sections: readonly string[]];

/** Sample Library Addition (a pipeline job being bid): one package per trade. */
const LIBRARY_JOB = 'job-p1';
const LIBRARY_SEEDS: readonly Seed[] = [
  ['01A', 'General Conditions', ['01 11 00', '01 21 00', '01 23 00', '01 31 00', '01 32 16', '01 33 00', '01 50 00', '01 74 19', '01 77 00', '01 78 39']],
  ['01B', 'Survey and Layout', ['01 71 23', '02 21 00']],
  ['02A', 'Selective Demolition', ['02 41 13', '02 41 19']],
  ['03A', 'Concrete', ['03 11 00', '03 21 00', '03 30 00', '03 35 00']],
  ['04A', 'Masonry', ['04 22 00', '04 72 00']],
  ['05A', 'Structural Steel', ['05 12 00', '05 31 00']],
  ['05B', 'Miscellaneous Metals', ['05 05 19', '05 50 00', '05 51 00', '05 52 00']],
  ['06A', 'Rough Carpentry', ['06 10 00', '06 16 00']],
  ['06B', 'Casework and Countertops', ['06 41 00', '06 41 16', '06 61 16', '12 36 00']],
  ['07A', 'Waterproofing and Sealants', ['07 13 00', '07 14 00', '07 92 00']],
  ['07B', 'Insulation', ['07 21 00', '07 21 16']],
  ['07C', 'Roofing', ['07 22 00', '07 54 23', '07 72 33']],
  ['07D', 'Sheet Metal', ['07 60 00', '07 62 00', '07 71 00']],
  ['08A', 'Doors, Frames and Hardware', ['08 11 13', '08 14 16', '08 31 00', '08 71 00']],
  ['08B', 'Storefront and Glazing', ['08 41 13', '08 44 13', '08 81 00', '08 83 00']],
  ['09A', 'Framing and Drywall', ['09 21 16', '09 22 16', '09 29 00']],
  ['09B', 'Acoustical Ceilings', ['09 51 13', '09 53 00']],
  ['09C', 'Tile', ['09 30 00', '09 30 13']],
  ['09D', 'Resilient Flooring and Carpet', ['09 65 13', '09 65 19', '09 68 13']],
  ['09E', 'Painting', ['09 91 13', '09 91 23']],
  ['10A', 'Specialties', ['10 14 23', '10 21 13', '10 28 13', '10 44 13', '10 44 16']],
  ['12A', 'Window Shades', ['12 24 13']],
  ['14A', 'Elevator', ['14 24 00']],
  ['21A', 'Fire Sprinklers', ['21 13 13']],
  ['22A', 'Plumbing', ['22 05 00', '22 11 16', '22 13 16', '22 42 00']],
  ['23A', 'HVAC', ['23 05 93', '23 31 13', '23 37 13', '23 81 29']],
  ['26A', 'Electrical', ['26 05 19', '26 05 33', '26 24 16', '26 27 26', '26 51 00']],
  ['27A', 'Low Voltage', ['27 10 00', '27 15 00']],
  ['28A', 'Fire Alarm', ['28 46 00']],
  ['31A', 'Earthwork', ['31 10 00', '31 23 00', '31 25 00']],
  ['32A', 'Paving and Site Concrete', ['32 12 16', '32 13 13', '32 16 00', '32 17 23']],
  ['32B', 'Landscape and Irrigation', ['32 80 00', '32 90 00', '32 93 00']],
  ['33A', 'Site Utilities', ['31 23 33', '33 05 00', '33 10 00']],
];

const FIXTURES: readonly PackageRow[] = [
  { id: 'pkg-1', project_id: 'job-a', code: '03A', name: 'Sample concrete', scope_text: 'Footings and slabs per sample plans.', spec_sections: ['03 30 00'], version: 1 },
  { id: 'pkg-2', project_id: 'job-a', code: '09A', name: 'Sample drywall', scope_text: 'Framing and board per sample plans.', spec_sections: ['09 21 16', '09 29 00'], version: 1 },
  // Sample Job B carries the leveling fixtures (mock/leveling).
  { id: 'pkg-b1', project_id: 'job-b', code: '03A', name: 'Sample concrete', scope_text: 'Footings and slabs per sample plans.', spec_sections: [], version: 1 },
  { id: 'pkg-b2', project_id: 'job-b', code: '09A', name: 'Sample drywall', scope_text: 'Framing and board per sample plans.', spec_sections: [], version: 1 },
  ...LIBRARY_SEEDS.map(([code, name, sections]) => ({
    id: `pkg-lib-${code}`,
    project_id: LIBRARY_JOB,
    code,
    name,
    scope_text: '',
    spec_sections: [...sections],
    version: 1,
  })),
];

/** What the database's spec_sections trigger does: each number once, in number order. */
function tidy(sections: readonly string[]): string[] {
  return [...new Set(sections)].sort();
}

/** Every package of a job, removed ones too: the fixtures with this test's edits, then the ones this test added. */
function allOf(projectId: string): PackageRow[] {
  const saved = readMock().packages.filter((p) => p.project_id === projectId);
  const base = FIXTURES.filter((p) => p.project_id === projectId).map((p) => saved.find((x) => x.id === p.id) ?? p);
  return [...base, ...saved.filter((x) => !base.some((b) => b.id === x.id))];
}

/** A job's live packages by code. */
export function list(projectId: string): PackageRow[] {
  const removed = readMock().removedPackages;
  return allOf(projectId)
    .filter((p) => !removed.includes(p.id))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function takenBy(projectId: string, code: string, exceptId: string | null): boolean {
  return list(projectId).some((p) => p.code === code && p.id !== exceptId);
}

function duplicate(): DataError {
  return new DataError('That already exists.', '23505', 'mock: bid_packages (project_id, code) is unique');
}

export async function add(v: {
  projectId: string;
  code: string;
  name: string;
  scopeText: string;
  specSections: readonly string[];
}): Promise<PackageRow> {
  await delay();
  if (takenBy(v.projectId, v.code, null)) throw duplicate();
  const row: PackageRow = {
    id: `pkg-new-${String(readMock().packages.length + 1)}`,
    project_id: v.projectId,
    code: v.code,
    name: v.name,
    scope_text: v.scopeText,
    spec_sections: tidy(v.specSections),
    version: 1,
  };
  writeMock((m) => ({ ...m, packages: [...m.packages, row] }));
  return row;
}

export async function save(
  row: PackageRow,
  patch: Pick<PackageRow, 'code' | 'name' | 'scope_text' | 'spec_sections'>,
): Promise<PackageRow> {
  await delay();
  const current = list(row.project_id).find((p) => p.id === row.id);
  if (!current || current.version !== row.version) throw conflictError();
  if (takenBy(row.project_id, patch.code, row.id)) throw duplicate();
  const next: PackageRow = { ...current, ...patch, spec_sections: tidy(patch.spec_sections), version: current.version + 1 };
  writeMock((m) => ({ ...m, packages: [...m.packages.filter((p) => p.id !== next.id), next] }));
  return next;
}

/** Packages the mock bidders were invited to (Sample Job A's): like the database, those can't be removed. */
const INVITED = new Set(['pkg-1', 'pkg-2']);

/** set_bid_package_removed: a package with invites stays; a removed one's code is free again; returns the new version. */
export async function setRemoved(row: PackageRow, version: number, removed: boolean): Promise<number> {
  await delay();
  const current = allOf(row.project_id).find((p) => p.id === row.id);
  if (!current) throw new DataError('That item no longer exists.', 'P0002', 'mock: package not found');
  if (current.version !== version) throw conflictError();
  if (removed && INVITED.has(row.id)) throw new DataError('This package has invites or bids.', '22023', 'mock: package in use');
  if (!removed && takenBy(row.project_id, current.code, row.id)) throw duplicate();
  const next: PackageRow = { ...current, version: current.version + 1 };
  writeMock((m) => ({
    ...m,
    packages: [...m.packages.filter((p) => p.id !== next.id), next],
    removedPackages: removed ? [...m.removedPackages, row.id] : m.removedPackages.filter((x) => x !== row.id),
  }));
  return next.version;
}
