import { useEffect } from 'react';
import { Result } from 'neverthrow';
import { usePersistentState } from './persistant';

// Light or dark colors (src/theme.css), chosen in the dashboard's header and remembered in this
// browser. The LAN camera page follows the same choice; pages OBS shows as browser sources do not.
export type Theme = 'light' | 'dark';

// Stored the way usePersistentState stores it: as JSON.
const THEME_KEY = 'theme';

const readStored = Result.fromThrowable(() => JSON.parse(localStorage.getItem(THEME_KEY) ?? '"light"') as unknown, () => 'unreadable');

export const storedTheme = (): Theme => readStored().unwrapOr('light') === 'dark' ? 'dark' : 'light';

export const applyTheme = (theme: Theme, root: HTMLElement) => {
  if (theme === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
};

// The theme setting, applied to the page as it changes.
export const useTheme = (): [Theme, (theme: Theme) => void] => {
  const [theme, setTheme] = usePersistentState<Theme>(THEME_KEY, storedTheme());
  useEffect(() => applyTheme(theme, document.documentElement), [theme]);
  return [theme, setTheme];
};
