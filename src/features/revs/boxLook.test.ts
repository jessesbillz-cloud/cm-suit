import { describe, expect, it } from 'vitest';
import { boxLook, boxState } from './boxLook';

describe('a box in its state', () => {
  it('fills the whole box with its lib/status solid color', () => {
    expect(boxLook('passed').style).toEqual({
      background: 'var(--status-approved-solid)',
      color: 'var(--status-approved-on-solid)',
      borderColor: 'var(--status-approved-solid)',
    });
    expect(boxLook('requested').style?.background).toBe('var(--status-pending-solid)');
    expect(boxLook('failed').style?.background).toBe('var(--status-not_approved-solid)');
  });

  it('open is white with a strong edge, picked is black', () => {
    expect(boxLook('open')).toEqual({ className: 'bg-card text-ink', style: { borderColor: 'var(--status-step_ahead-fg)' } });
    expect(boxLook('passed', true)).toEqual({ className: 'border-ink bg-ink text-white', style: undefined });
  });

  it('N/A has no box', () => {
    expect(boxState('na')).toBeNull();
    expect(boxState('failed')).toBe('failed');
  });
});
