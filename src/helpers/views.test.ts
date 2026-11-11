import { describe, expect, it } from '@jest/globals';
import { applyThemeFromUrl, viewFromHash } from './views';

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

describe('applyThemeFromUrl', () => {
  it('turns on dark mode with ?theme=dark only', () => {
    const dark = document.createElement('html');
    applyThemeFromUrl('?theme=dark', dark);
    expect(dark.dataset.theme).toBe('dark');

    const light = document.createElement('html');
    applyThemeFromUrl('?theme=light', light);
    applyThemeFromUrl('', light);
    expect(light.dataset.theme).toBeUndefined();
  });
});
