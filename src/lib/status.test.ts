import { describe, expect, it } from 'vitest';
import { STATUS, statusCssVariables, statusLabel } from './status';

describe('status', () => {
  it('has every key with three colors and a label', () => {
    for (const [k, v] of Object.entries(STATUS)) {
      expect(v.label.length, k).toBeGreaterThan(0);
      for (const c of [v.fg, v.bg, v.dot]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
  it('emits css variables', () => {
    expect(statusCssVariables()).toContain('--status-pending-dot:#EAB308');
    expect(statusLabel('postponed')).toBe('Postponed');
  });
});
