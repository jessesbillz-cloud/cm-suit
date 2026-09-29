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
});
