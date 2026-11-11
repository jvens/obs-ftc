import { beforeEach, describe, expect, it } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import matchData, { fetchMatchIfUnknown, fetchMatchList, selectError, selectMatches, updateMatchEvent, updateMatchInfo } from './matchDataSlice';
import connection from './connectionSlice';
import { FtcMatch } from '../types/FtcLive';
import { mockFetch } from '../test/fetchMock';

const newStore = () => configureStore({ reducer: { matchData, connection } });

const match = (matchName: string, matchNumber: number, team: number): FtcMatch => ({
  matchName,
  matchNumber,
  field: 1,
  red: { team1: team, team2: team + 1, isTeam1Surrogate: false, isTeam2Surrogate: false },
  blue: { team1: team + 2, team2: team + 3, isTeam1Surrogate: false, isTeam2Surrogate: false },
  finished: false,
  matchState: 'UNPLAYED',
  time: 1700000000000 + matchNumber,
});

const MATCHES_URL = 'http://h/api/v1/events/e/matches/';

beforeEach(() => localStorage.clear());

describe('match events', () => {
  it('records each match event time, adding the match when it is new', () => {
    const store = newStore();
    store.dispatch(updateMatchEvent({ shortName: 'Q1', number: 1, updateType: 'MATCH_LOAD', updateTime: 100 }));
    store.dispatch(updateMatchEvent({ shortName: 'Q1', number: 1, updateType: 'MATCH_START', updateTime: 200 }));
    expect(selectMatches(store.getState())).toEqual([{ name: 'Q1', number: 1, MATCH_LOAD: 100, MATCH_START: 200 }]);
  });

  it('keeps the field from the match events', () => {
    const store = newStore();
    store.dispatch(updateMatchEvent({ shortName: 'Q1', number: 1, updateType: 'MATCH_LOAD', updateTime: 100, field: 2 }));
    store.dispatch(updateMatchEvent({ shortName: 'Q1', number: 1, updateType: 'MATCH_START', updateTime: 200 }));
    expect(selectMatches(store.getState())[0].field).toBe(2);
  });

  it('merges match info into the match', () => {
    const store = newStore();
    store.dispatch(updateMatchEvent({ shortName: 'Q1', number: 1, updateType: 'MATCH_LOAD', updateTime: 100 }));
    store.dispatch(updateMatchInfo({ name: 'Q1', recordingFile: 'Q1.mp4' }));
    expect(selectMatches(store.getState())[0]).toEqual({ name: 'Q1', number: 1, MATCH_LOAD: 100, recordingFile: 'Q1.mp4' });
  });
});

describe('fetchMatchList', () => {
  it('fills in the teams and keeps what was recorded for each match', async () => {
    mockFetch({ [MATCHES_URL]: { matches: [match('Q1', 1, 100), match('Q2', 2, 200)] } });
    const store = newStore();
    store.dispatch(updateMatchEvent({ shortName: 'Q1', number: 1, updateType: 'MATCH_START', updateTime: 5 }));

    await store.dispatch(fetchMatchList({ eventCode: 'e', serverUrl: 'h' }));

    expect(selectMatches(store.getState())).toEqual([
      expect.objectContaining({ name: 'Q1', MATCH_START: 5, red1: 100, blue1: 102 }),
      expect.objectContaining({ name: 'Q2', red1: 200, scheduledTime: 1700000000002 }),
    ]);
  });

  it('reports a failure', async () => {
    mockFetch({});
    const store = newStore();
    await store.dispatch(fetchMatchList({ eventCode: 'e', serverUrl: 'h' }));
    expect(selectError(store.getState())).toBe('Failed to fetch matches: Not Found');
  });
});

describe('fetchMatchIfUnknown', () => {
  it('looks up a match it has no teams for', async () => {
    mockFetch({ [`${MATCHES_URL}active/`]: { matches: [match('Q3', 3, 300)] } });
    const store = newStore();
    await store.dispatch(fetchMatchIfUnknown({ eventCode: 'e', matchName: 'Q3', serverUrl: 'h' }));
    expect(selectMatches(store.getState())).toEqual([expect.objectContaining({ name: 'Q3', red1: 300 })]);
  });

  it('does not ask FTC Live about a match it already knows', async () => {
    const fetchMock = mockFetch({});
    const store = newStore();
    store.dispatch(updateMatchInfo({ name: 'Q3', number: 3, blue1: 1 }));
    await store.dispatch(fetchMatchIfUnknown({ eventCode: 'e', matchName: 'Q3', serverUrl: 'h' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
