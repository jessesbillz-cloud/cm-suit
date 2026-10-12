import { describe, expect, it } from 'vitest';
import { STATUS, stampOutcome, stampStatus, statusCssVariables, statusLabel } from './status';

describe('status', () => {
  it('has every key with its colors and a label', () => {
    for (const [k, v] of Object.entries(STATUS)) {
      expect(v.label.length, k).toBeGreaterThan(0);
      for (const c of [v.fg, v.bg, v.dot, v.solid, v.onSolid]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
  it('emits css variables', () => {
    expect(statusCssVariables()).toContain('--status-pending-dot:#EAB308');
    expect(statusCssVariables()).toContain('--status-confirmed-solid:#16A34A');
    expect(statusCssVariables()).toContain('--status-pending-on-solid:#422006');
    expect(statusLabel('postponed')).toBe('Postponed');
    expect(statusLabel('gc_review')).toBe('GC review');
  });
  it('has the tracker colors (the MDR pipeline): done green, has it a gold ring, ahead grey, late red', () => {
    expect(STATUS.step_done.solid).toBe('#16A34A');
    expect(STATUS.step_current.dot).toBe('#EAB308');
    expect(STATUS.step_current.bg).toBe('#FFFFFF');
    expect(STATUS.step_ahead.bg).toBe('#FFFFFF');
    expect(STATUS.step_ahead.dot).not.toBe(STATUS.step_current.dot);
    expect(STATUS.late.fg).toBe('#DC2626');
    expect(statusCssVariables()).toContain('--status-step_done-solid:#16A34A');
  });
  it("colors a submittal's stamp: done green, attention amber, back red (the furthest back wins)", () => {
    expect(stampStatus('NET')).toBe('approved');
    expect(stampStatus('aan')).toBe('approved');
    expect(stampStatus('MCN')).toBe('pending');
    expect(stampStatus('MCN RNR')).toBe('late');
    expect(stampStatus('R&R')).toBe('late');
    expect(stampStatus('XYZ')).toBeNull();
  });
  it('reads a stamp as approved or not for a reader whose job is approve or not', () => {
    for (const s of ['NET', 'A', 'AN', 'aan', 'MCN', 'AAN MCN']) expect(stampOutcome(s), s).toBe('approved');
    for (const s of ['RNR', 'R&R', 'RR', 'REJ', 'MCN RNR']) expect(stampOutcome(s), s).toBe('not_approved');
    for (const s of ['XYZ', '', 'PD']) expect(stampOutcome(s), s).toBeNull();
    expect(STATUS.approved.label).toBe('Approved');
    expect(STATUS.not_approved.label).toBe('Not approved');
  });
});
