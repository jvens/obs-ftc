import { describe, expect, it } from '@jest/globals';
import { store } from './index';
import { setObsPort } from './connectionSlice';
import { updateMatchEvent } from './matchDataSlice';

describe('store', () => {
  it('saves the connection settings and match data as they change', () => {
    store.dispatch(setObsPort(4456));
    store.dispatch(updateMatchEvent({ shortName: 'Q1', number: 1, updateType: 'MATCH_LOAD', updateTime: 100 }));
    expect(JSON.parse(localStorage.getItem('OBS_Port')!)).toBe(4456);
    expect(JSON.parse(localStorage.getItem('Match_Events')!)).toEqual([{ name: 'Q1', number: 1, MATCH_LOAD: 100 }]);
  });
});
