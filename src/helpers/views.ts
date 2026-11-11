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

export interface Location {
  view: ViewId;
  // The part of the view after a slash, such as a Setup step (#setup/scenes); empty when there is none.
  sub: string;
}

export const locationFromHash = (hash: string): Location => {
  const [id = '', sub = ''] = hash.replace(/^#\/?/, '').toLowerCase().split('/');
  const view = VIEWS.find(candidate => candidate.id === id)?.id;
  return view ? { view, sub } : { view: DEFAULT_VIEW, sub: '' };
};

export const viewFromHash = (hash: string): ViewId => locationFromHash(hash).view;

export const useLocation = (): Location => {
  const [location, setLocation] = useState(() => locationFromHash(window.location.hash));
  useEffect(() => {
    const onHashChange = () => setLocation(locationFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return location;
};

// A preview of dark mode until it has a setting of its own: ?theme=dark.
export const applyThemeFromUrl = (search: string, root: HTMLElement) => {
  if (new URLSearchParams(search).get('theme') === 'dark') root.dataset.theme = 'dark';
};
