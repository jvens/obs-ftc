import { describe, expect, it } from '@jest/globals';
import { locationFromHash, viewFromHash } from './views';

describe('viewFromHash', () => {
  it('reads the view from the hash', () => {
    expect(viewFromHash('#run')).toBe('run');
    expect(viewFromHash('#/outputs')).toBe('outputs');
    expect(viewFromHash('#Setup')).toBe('setup');
  });

  it('opens Setup for no hash or an unknown one', () => {
    expect(viewFromHash('')).toBe('setup');
    expect(viewFromHash('#graphics')).toBe('setup');
  });
});

describe('locationFromHash', () => {
  it('reads the part of a view after a slash', () => {
    expect(locationFromHash('#setup/scenes')).toEqual({ view: 'setup', sub: 'scenes' });
    expect(locationFromHash('#run')).toEqual({ view: 'run', sub: '' });
    expect(locationFromHash('#nowhere/scenes')).toEqual({ view: 'setup', sub: '' });
  });
});
