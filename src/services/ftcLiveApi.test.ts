import { beforeEach, describe, expect, it } from '@jest/globals';
import { fetchActiveMatches, fetchAllEvents, fetchMatches, fetchTeam } from './ftcLiveApi';
import { mockFetch } from '../test/fetchMock';

const EVENT = { eventCode: 'usmnrq1', name: 'Qualifier', fieldCount: 2 };

beforeEach(() => localStorage.clear());

describe('FTC Live API', () => {
  it('fetches every event on the server', async () => {
    mockFetch({
      'http://10.0.0.5/api/v1/events/': { eventCodes: ['usmnrq1'] },
      'http://10.0.0.5/api/v1/events/usmnrq1/': EVENT,
    });
    await expect(fetchAllEvents('10.0.0.5')).resolves.toEqual([EVENT]);
  });

  it('uses the saved server when none is given', async () => {
    localStorage.setItem('FTC_URL', JSON.stringify('10.0.0.7'));
    const fetchMock = mockFetch({ 'http://10.0.0.7/api/v1/events/usmnrq1/matches/': { matches: [] } });
    await expect(fetchMatches('usmnrq1')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('http://10.0.0.7/api/v1/events/usmnrq1/matches/');
  });

  it('falls back to localhost', async () => {
    const fetchMock = mockFetch({ 'http://localhost/api/v1/events/usmnrq1/matches/': { matches: [] } });
    await fetchMatches('usmnrq1');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost/api/v1/events/usmnrq1/matches/');
  });

  it('reports no active match as null', async () => {
    mockFetch({});
    await expect(fetchActiveMatches('usmnrq1', 'h')).resolves.toBeNull();
  });

  it('fails on other errors', async () => {
    mockFetch({});
    await expect(fetchTeam('usmnrq1', 12345, 'h')).rejects.toThrow('Failed to fetch team 12345: Not Found');
  });
});
