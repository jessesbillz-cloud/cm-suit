import { describe, expect, it } from 'vitest';
import type { PublicMap } from '../../data/requestNoLogin.types';
import type { IrMapContext } from '../../data/revs.types';
import { memberMapView, publicMapView } from './mapView';

const strokes = [{ c: 1 as const, w: 0.01, p: [[0.1, 0.1], [0.2, 0.2]] as [number, number][] }];
const legend = [{ color: 1 as const, name: 'Sample CJ Stuffing' }];

const ctx: IrMapContext = {
  request_id: 'r1', project_id: 'job-s', number: 12, ofs_number: 4, phase: 'PH III', request_date: '2026-10-05', what: 'Level 02 CJ',
  sheet_file_id: 'sheet-1', page: 3, strokes, legend, result: null, signed_at: null, signer_name: null, version: 7,
  map_file_id: 'map-1', stale: false, can_edit: true,
};

const pub: PublicMap = {
  number: 12, ofs_number: 4, phase: 'PH III', request_date: '2026-10-05', what: 'Level 02 CJ', sheet_file_id: 'sheet-1', page: 3,
  strokes, legend, result: null, signed: false, version: 7, has_map: true, stale: false, can_edit: true,
  sheets: [{ file_id: 'sheet-1', label: 'Level 02' }],
};

describe('one map view for a member and a link visitor', () => {
  it('reads the same from either side', () => {
    const want = { sheetFileId: 'sheet-1', page: 3, strokes, legend, version: 7, canEdit: true, made: true };
    expect(memberMapView(ctx)).toEqual(want);
    expect(publicMapView(pub)).toEqual(want);
  });

  it('is made only while the map PDF on file shows what is drawn now', () => {
    expect(memberMapView({ ...ctx, stale: true }).made).toBe(false);
    expect(memberMapView({ ...ctx, map_file_id: null }).made).toBe(false);
    expect(publicMapView({ ...pub, stale: true }).made).toBe(false);
    expect(publicMapView({ ...pub, has_map: false }).made).toBe(false);
  });
});
