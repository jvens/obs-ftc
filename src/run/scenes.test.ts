import { describe, expect, it } from '@jest/globals';
import { runScenes } from './scenes';

describe('runScenes', () => {
  it('offers every scene but the camera scenes, in OBS order', () => {
    expect(runScenes(['Field 1', 'Field 2', 'Ceremony', 'Interview', 'Camera - Field 1', 'Camera - Ceremony']))
      .toEqual(['Field 1', 'Field 2', 'Ceremony', 'Interview']);
  });
});
