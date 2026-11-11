import { useEffect, useState } from 'react';
import { Result } from 'neverthrow';

// The dashboard's views: what it is and how to start (About), getting ready (Setup), running the
// event (Run), what is saved for each match (Outputs), and every match's events and files (Matches).
// The view is in the URL's hash (#run), so a reload or a bookmark opens it again.
export const VIEWS = [
  { id: 'about', label: 'About' },
  { id: 'setup', label: 'Setup' },
  { id: 'run', label: 'Run' },
  { id: 'outputs', label: 'Outputs' },
  { id: 'matches', label: 'Matches' },
] as const;

export type ViewId = typeof VIEWS[number]['id'];

// A first visit opens About; after that, the dashboard opens on Setup.
const ABOUT_SEEN_KEY = 'aboutSeen';

const readAboutSeen = Result.fromThrowable(() => localStorage.getItem(ABOUT_SEEN_KEY) === 'true', () => 'unreadable');
const writeAboutSeen = Result.fromThrowable(() => localStorage.setItem(ABOUT_SEEN_KEY, 'true'), () => 'unwritable');

export const defaultView = (): ViewId => readAboutSeen().unwrapOr(true) ? 'setup' : 'about';

export interface Location {
  view: ViewId;
  // The part of the view after a slash, such as a Setup step (#setup/scenes); empty when there is none.
  sub: string;
}

export const locationFromHash = (hash: string, fallback: ViewId = 'setup'): Location => {
  const [id = '', sub = ''] = hash.replace(/^#\/?/, '').toLowerCase().split('/');
  const view = VIEWS.find(candidate => candidate.id === id)?.id;
  return view ? { view, sub } : { view: fallback, sub: '' };
};

export const viewFromHash = (hash: string, fallback: ViewId = 'setup'): ViewId => locationFromHash(hash, fallback).view;

export const useLocation = (): Location => {
  const [location, setLocation] = useState(() => locationFromHash(window.location.hash, defaultView()));
  useEffect(() => {
    const onHashChange = () => setLocation(locationFromHash(window.location.hash, defaultView()));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => { if (location.view === 'about') writeAboutSeen(); }, [location.view]);
  return location;
};
