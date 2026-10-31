import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// The slice reads localStorage when it loads, so each test loads a fresh copy.
const loadSlice = async () => {
  let slice: typeof import('./connectionSlice') | undefined;
  await jest.isolateModulesAsync(async () => { slice = await import('./connectionSlice'); });
  return slice!;
};

const rootState = (connection: unknown) => ({ connection }) as never;

beforeEach(() => localStorage.clear());

describe('connection settings', () => {
  it('starts with local OBS and FTC Live', async () => {
    const { default: reducer } = await loadSlice();
    expect(reducer(undefined, { type: 'init' })).toEqual({
      ftcServerUrl: 'localhost', selectedEvent: null, obsUrl: 'localhost', obsPort: 4455, obsPassword: '',
    });
  });

  it('restores the saved settings', async () => {
    localStorage.setItem('FTC_URL', JSON.stringify('10.0.0.5'));
    localStorage.setItem('OBS_Port', JSON.stringify(4456));
    localStorage.setItem('OBS_Password', JSON.stringify('pw'));
    const { default: reducer } = await loadSlice();
    expect(reducer(undefined, { type: 'init' })).toMatchObject({ ftcServerUrl: '10.0.0.5', obsPort: 4456, obsPassword: 'pw' });
  });

  it('starts over when the saved settings are corrupt', async () => {
    localStorage.setItem('OBS_Port', '{not json');
    const { default: reducer } = await loadSlice();
    expect(reducer(undefined, { type: 'init' })).toMatchObject({ obsPort: 4455 });
  });

  it('assumes two fields until an event is picked', async () => {
    const { default: reducer, selectFieldCount, setSelectedEvent } = await loadSlice();
    const initial = reducer(undefined, { type: 'init' });
    expect(selectFieldCount(rootState(initial))).toBe(2);
    const picked = reducer(initial, setSelectedEvent({ fieldCount: 3 } as never));
    expect(selectFieldCount(rootState(picked))).toBe(3);
  });
});
