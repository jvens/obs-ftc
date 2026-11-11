import { describe, expect, it } from '@jest/globals';
import { SetupFacts, expectedScenes, setupStepStates, stepFromId } from './steps';

const facts = (overrides: Partial<SetupFacts> = {}): SetupFacts => ({
  ftcConnected: false,
  obsConnected: false,
  obsAddress: 'localhost:4455',
  scenes: [],
  fieldCount: 2,
  audioMode: 'device',
  fieldScenes: ['', '', ''],
  finalsScene: '',
  ...overrides,
});

const allScenes = expectedScenes(2);

describe('stepFromId', () => {
  it('knows the steps and nothing else', () => {
    expect(stepFromId('scenes')).toBe('scenes');
    expect(stepFromId('graphics')).toBeUndefined();
  });
});

describe('expectedScenes', () => {
  it('lists the scenes setup builds for the event', () => {
    expect(expectedScenes(2)).toEqual([
      'Field 1', 'Field 2', 'Ceremony', 'Alliance Selection', 'Pit Display', 'Sponsor Loop',
      'Camera - Field 1', 'Camera - Field 2', 'Camera - Ceremony',
    ]);
  });
});

describe('setupStepStates', () => {
  it('starts with everything to do', () => {
    const states = setupStepStates(facts());
    expect(states['ftc-live']).toEqual({ status: 'todo', detail: 'Pick the event and connect' });
    expect(states.obs).toEqual({ status: 'todo', detail: 'Not connected' });
    expect(states.scenes).toEqual({ status: 'todo', detail: 'Connect to OBS first' });
    expect(states.switching.status).toBe('todo');
  });

  it('ticks off the connections', () => {
    const states = setupStepStates(facts({ ftcConnected: true, event: { name: 'Qualifier', fieldCount: 1 }, obsConnected: true }));
    expect(states['ftc-live']).toEqual({ status: 'done', detail: 'Qualifier · 1 field' });
    expect(states.obs).toEqual({ status: 'done', detail: 'localhost:4455' });
  });

  it('counts the scenes setup still has to build', () => {
    expect(setupStepStates(facts({ obsConnected: true, scenes: ['Field 1', 'Other'] })).scenes)
      .toEqual({ status: 'todo', detail: '1 of 9 scenes in OBS' });
    expect(setupStepStates(facts({ obsConnected: true, scenes: [...allScenes, 'Other'] })).scenes)
      .toEqual({ status: 'done', detail: 'All 9 scenes in OBS' });
  });

  it('needs every field, and finals with more than one field, on a scene OBS has', () => {
    const connected = { obsConnected: true, scenes: allScenes };
    expect(setupStepStates(facts({ ...connected, fieldScenes: ['Field 1', 'Field 2', ''], finalsScene: '' })).switching.status).toBe('todo');
    expect(setupStepStates(facts({ ...connected, fieldScenes: ['Field 1', 'Gone', ''], finalsScene: 'Field 1' })).switching.status).toBe('todo');
    expect(setupStepStates(facts({ ...connected, fieldScenes: ['Field 1', 'Field 2', ''], finalsScene: 'Field 1' })).switching)
      .toEqual({ status: 'done', detail: 'Fields and finals assigned' });
    expect(setupStepStates(facts({ ...connected, fieldCount: 1, fieldScenes: ['Field 1', '', ''] })).switching)
      .toEqual({ status: 'done', detail: 'Field assigned' });
  });

  it('describes the steps it cannot check', () => {
    const states = setupStepStates(facts({ audioMode: 'camera' }));
    expect(states.audio).toEqual({ status: 'info', detail: 'Event audio from the cameras' });
    expect(states.settings.status).toBe('info');
  });
});
