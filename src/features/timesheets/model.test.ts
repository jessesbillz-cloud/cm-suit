import { describe, expect, it } from 'vitest';
import { currentMonth, invoiceChip, invoiceTitle, monthFrom } from './model';

describe('timesheets model', () => {
  it('invoice chips: Draft gray, Sent blue, Paid green', () => {
    expect(invoiceChip('draft')).toEqual({ status: 'cancelled', label: 'Draft' });
    expect(invoiceChip('sent')).toEqual({ status: 'assigned', label: 'Sent' });
    expect(invoiceChip('paid')).toEqual({ status: 'approved', label: 'Paid' });
    expect(invoiceTitle({ number: 41 })).toBe('Invoice #41');
  });
  it('the month in the URL, never past this month', () => {
    expect(monthFrom('2026-01-01')).toBe('2026-01');
    expect(monthFrom(undefined)).toBe(currentMonth());
    expect(monthFrom('not a day')).toBe(currentMonth());
    expect(monthFrom('2999-01-01')).toBe(currentMonth());
  });
});
