import { describe, expect, it } from 'vitest';
import { STATUS, statusCssVariables, statusLabel } from './status';

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
  it('has the route strip and late colors: current filled in the accent, ahead an outline, late red (not amber)', () => {
    expect(STATUS.step_current.bg).toBe('#2563EB');
    expect(STATUS.step_current.fg).toBe('#FFFFFF');
    expect(STATUS.step_ahead.bg).toBe('#FFFFFF');
    expect(STATUS.step_done.bg).not.toBe(STATUS.step_ahead.bg);
    expect(STATUS.late.fg).toBe('#DC2626');
    expect(statusCssVariables()).toContain('--status-step_done-dot:#C9DAFC');
  });
});
