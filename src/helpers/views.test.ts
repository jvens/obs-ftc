import { afterEach, describe, expect, it } from '@jest/globals';
import { defaultView, locationFromHash, viewFromHash } from './views';

describe('viewFromHash', () => {
  it('reads the view from the hash', () => {
    expect(viewFromHash('#run')).toBe('run');
    expect(viewFromHash('#/outputs')).toBe('outputs');
    expect(viewFromHash('#Setup')).toBe('setup');
  });

  it('opens the default view for no hash or an unknown one', () => {
    expect(viewFromHash('')).toBe('setup');
    expect(viewFromHash('#graphics', 'about')).toBe('about');
    expect(viewFromHash('#about/needs')).toBe('about');
  });
});

describe('locationFromHash', () => {
  it('reads the part of a view after a slash', () => {
    expect(locationFromHash('#setup/scenes')).toEqual({ view: 'setup', sub: 'scenes' });
    expect(locationFromHash('#run')).toEqual({ view: 'run', sub: '' });
    expect(locationFromHash('#nowhere/scenes')).toEqual({ view: 'setup', sub: '' });
  });
});

describe('defaultView', () => {
  afterEach(() => localStorage.clear());

  it('opens About on the first visit, and Setup once About has been seen', () => {
    expect(defaultView()).toBe('about');
    localStorage.setItem('aboutSeen', 'true');
    expect(defaultView()).toBe('setup');
  });
});
