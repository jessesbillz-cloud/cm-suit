import { describe, expect, it } from 'vitest';
import type { SubRow } from '../../data/subs.types';
import { cslbUrl, draftPatch, licenseChip, matchesQuery, parseTrades, searchText, toDraft } from './subs';

const ROW: SubRow = {
  id: 'sub-1',
  org_id: 'org-1',
  company: 'Sample Drywall Co',
  trades: ['09B', '09A'],
  contacts: [{ name: 'Sample Person ', email: 'Person@Example.test', phone: '555-0101', title: '' }],
  city: 'Sample City',
  zip: null,
  region: null,
  cslb_number: '100001',
  cslb_status: null,
  cslb_checked_at: null,
  license_classes: null,
  dir_number: null,
  certifications: null,
  notes: '',
  version: 3,
};

describe('parseTrades', () => {
  it('reads codes in any case and separator, sorted without repeats', () => {
    expect(parseTrades('09b, 09A;10a 09A')).toEqual(['09A', '09B', '10A']);
    expect(parseTrades('  ')).toEqual([]);
  });
  it('refuses anything that is not a code like 09A', () => {
    expect(parseTrades('09A drywall')).toBeNull();
    expect(parseTrades('9A')).toBeNull();
  });
});

describe('draftPatch', () => {
  it('saves nothing when nothing was touched, even if stored values are untidy', () => {
    expect(draftPatch(toDraft(ROW), ROW)).toEqual({ patch: null, problem: null });
  });
  it('returns only the changed fields, cleaned', () => {
    const d = { ...toDraft(ROW), city: '  ', zip: ' 92000 ', trades: '09a 09b 10A' };
    expect(draftPatch(d, ROW)).toEqual({ patch: { trades: ['09A', '09B', '10A'], city: null, zip: '92000' }, problem: null });
  });
  it('drops empty contacts and lowercases emails', () => {
    const d = { ...toDraft(ROW), contacts: [...ROW.contacts, { name: '', email: ' NEW@example.test ', phone: '', title: '' }, { name: '', email: '', phone: '', title: '' }] };
    expect(draftPatch(d, ROW).patch).toEqual({
      contacts: [
        { name: 'Sample Person', email: 'person@example.test', phone: '555-0101', title: '' },
        { name: '', email: 'new@example.test', phone: '', title: '' },
      ],
    });
  });
  it('explains what is wrong instead of saving', () => {
    expect(draftPatch({ ...toDraft(ROW), company: ' ' }, ROW).problem).toBe('Company is empty.');
    expect(draftPatch({ ...toDraft(ROW), trades: 'drywall' }, ROW).problem).toBe('Trades look like 09A.');
  });
});

describe('find, chips, CSLB link', () => {
  it('matches every word anywhere in company, contact, city or license', () => {
    const text = searchText(ROW);
    expect(matchesQuery(text, 'drywall person')).toBe(true);
    expect(matchesQuery(text, '100001')).toBe(true);
    expect(matchesQuery(text, 'concrete')).toBe(false);
  });
  it('shows a license chip only once checked', () => {
    expect(licenseChip(null)).toBeNull();
    expect(licenseChip('expired')).toEqual({ status: 'not_approved', label: 'Expired' });
  });
  it('links the CSLB detail page by the digits of the number', () => {
    expect(cslbUrl('# 100001')).toBe('https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/LicenseDetail.aspx?LicNum=100001');
    expect(cslbUrl('')).toBeNull();
  });
});
