import { useEffect, useState } from 'react';

// The dashboard's views: getting ready (Setup), running the event (Run), and what is saved for each
// match (Outputs). The view is in the URL's hash (#run), so a reload or a bookmark opens it again.
export const VIEWS = [
  { id: 'setup', label: 'Setup' },
  { id: 'run', label: 'Run' },
  { id: 'outputs', label: 'Outputs' },
] as const;

export type ViewId = typeof VIEWS[number]['id'];

const DEFAULT_VIEW: ViewId = 'setup';

export const viewFromHash = (hash: string): ViewId => {
  const id = hash.replace(/^#\/?/, '').toLowerCase();
  return VIEWS.find(view => view.id === id)?.id ?? DEFAULT_VIEW;
};

export const useView = (): ViewId => {
  const [view, setView] = useState(() => viewFromHash(window.location.hash));
  useEffect(() => {
    const onHashChange = () => setView(viewFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return view;
};

// A preview of dark mode until it has a setting of its own: ?theme=dark.
export const applyThemeFromUrl = (search: string, root: HTMLElement) => {
  if (new URLSearchParams(search).get('theme') === 'dark') root.dataset.theme = 'dark';
};
