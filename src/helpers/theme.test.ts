import { afterEach, describe, expect, it } from '@jest/globals';
import { applyTheme, storedTheme } from './theme';

afterEach(() => localStorage.clear());

describe('storedTheme', () => {
  it('is light until dark is chosen', () => {
    expect(storedTheme()).toBe('light');
    localStorage.setItem('theme', JSON.stringify('dark'));
    expect(storedTheme()).toBe('dark');
  });

  it('is light for anything it cannot read', () => {
    localStorage.setItem('theme', 'not json');
    expect(storedTheme()).toBe('light');
    localStorage.setItem('theme', JSON.stringify('purple'));
    expect(storedTheme()).toBe('light');
  });
});

describe('applyTheme', () => {
  it('sets data-theme for dark and removes it for light', () => {
    const root = document.createElement('html');
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    applyTheme('light', root);
    expect(root.dataset.theme).toBeUndefined();
  });
});
