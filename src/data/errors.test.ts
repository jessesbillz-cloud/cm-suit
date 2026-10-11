import { describe, expect, it } from 'vitest';
import { conflictError, refusalOf, toDataError } from './errors';

describe('refusalOf', () => {
  it("shows the database's own sentence for a refusal worded for people", () => {
    expect(refusalOf(toDataError({ message: 'A signed record stays on file.', code: '42501' }))).toBe('A signed record stays on file.');
    expect(refusalOf(toDataError({ message: 'Only the app adds to that folder.', code: '42501' }))).toBe('Only the app adds to that folder.');
  });

  it('keeps the short message for a bare code or a system message', () => {
    expect(refusalOf(toDataError({ message: 'forbidden', code: '42501' }))).toBe("You don't have access to that.");
    expect(refusalOf(toDataError({ message: 'not_found', code: 'P0002' }))).toBe('That item no longer exists.');
    expect(refusalOf(conflictError())).toBe('Someone else changed this first. Reload and try again.');
    expect(refusalOf(new Error('Network down'))).toBe('Network down');
    expect(refusalOf('x')).toBe('Something went wrong.');
  });
});
