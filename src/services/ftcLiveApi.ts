import { Event, FtcMatch } from '../types/FtcLive';

/**
 * FTC Live API Service
 * Centralized API calls to the FTC Live scoring system
 */

// Get the server URL from localStorage or default
const getServerUrl = (): string => {
  const stored = localStorage.getItem('FTC_URL');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return stored;
    }
  }
  return 'localhost';
};

/**
 * Fetch list of event codes from the server
 */
export const fetchEventCodes = async (serverUrl?: string): Promise<string[]> => {
  const url = serverUrl || getServerUrl();
  const response = await fetch(`http://${url}/api/v1/events/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }
  const data = await response.json();
  return data.eventCodes;
};

/**
 * Fetch details for a specific event
 */
export const fetchEvent = async (eventCode: string, serverUrl?: string): Promise<Event> => {
  const url = serverUrl || getServerUrl();
  const response = await fetch(`http://${url}/api/v1/events/${eventCode}/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch event ${eventCode}: ${response.statusText}`);
  }
  return await response.json() as Event;
};

/**
 * Fetch all events with their details
 */
export const fetchAllEvents = async (serverUrl?: string): Promise<Event[]> => {
  const eventCodes = await fetchEventCodes(serverUrl);
  const events = await Promise.all(
    eventCodes.map(code => fetchEvent(code, serverUrl))
  );
  return events;
};

/**
 * Fetch matches for an event
 */
export const fetchMatches = async (eventCode: string, serverUrl?: string): Promise<FtcMatch[]> => {
  const url = serverUrl || getServerUrl();
  const response = await fetch(`http://${url}/api/v1/events/${eventCode}/matches/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch matches: ${response.statusText}`);
  }
  const data = await response.json();
  return data.matches as FtcMatch[];
};

/**
 * Fetch the currently active match for an event
 */
export const fetchActiveMatches = async (eventCode: string, serverUrl?: string): Promise<FtcMatch[] | null> => {
  const url = serverUrl || getServerUrl();
  const response = await fetch(`http://${url}/api/v1/events/${eventCode}/matches/active/`);
  if (!response.ok) {
    if (response.status === 404) {
      return null; // No active match
    }
    throw new Error(`Failed to fetch active match: ${response.statusText}`);
  }
  const matches = await response.json() as { matches: FtcMatch[] };
  return matches.matches;
};

/**
 * Fetch a specific match by match number
 */
export const fetchMatch = async (
  eventCode: string,
  matchNumber: number,
  serverUrl?: string
): Promise<FtcMatch | null> => {
  const url = serverUrl || getServerUrl();
  const response = await fetch(`http://${url}/api/v1/events/${eventCode}/matches/${matchNumber}/`);
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to fetch match ${matchNumber}: ${response.statusText}`);
  }
  return await response.json() as FtcMatch;
};

/**
 * Fetch team numbers for an event
 */
export const fetchTeamNumbers = async (eventCode: string, serverUrl?: string): Promise<number[]> => {
  const url = serverUrl || getServerUrl();
  const response = await fetch(`http://${url}/api/v1/events/${eventCode}/teams/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch teams: ${response.statusText}`);
  }
  const data = await response.json();
  return data.teamNumbers;
};

export interface TeamInfo {
  number: number;
  name: string;
  school: string;
  city: string;
  state: string;
  country: string;
}

/**
 * Fetch details for a specific team
 */
export const fetchTeam = async (
  eventCode: string,
  teamNumber: number,
  serverUrl?: string
): Promise<TeamInfo> => {
  const url = serverUrl || getServerUrl();
  const response = await fetch(`http://${url}/api/v1/events/${eventCode}/teams/${teamNumber}/`);
  if (!response.ok) {
    throw new Error(`Failed to fetch team ${teamNumber}: ${response.statusText}`);
  }
  return await response.json() as TeamInfo;
};
