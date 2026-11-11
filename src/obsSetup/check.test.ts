import { describe, expect, it } from '@jest/globals';
import { applySetup } from './apply';
import { checkSetup } from './check';
import { SOURCE_NAMES, SetupOptions } from './layout';
import { FakeObs } from '../test/fakeObs';

const options = (overrides: Partial<SetupOptions> = {}): SetupOptions => ({
  ftcHost: '192.168.1.5',
  eventCode: 'usmnrq1',
  fieldCount: 2,
  audioMode: 'device',
  overlaySounds: true,
  safeBackgroundUrl: 'https://example.com/bg.png',
  lowerThirdUrl: 'https://obs.example.com/lower-third.html',
  lanReceiver: { port: 4455, password: 'pw' },
  customCameras: [],
  ...overrides,
});

const builtObs = async (setupOptions = options()) => {
  const obs = new FakeObs();
  (await applySetup(obs.call, setupOptions, 'newCollection', () => {}))._unsafeUnwrap();
  return obs;
};

const check = async (obs: FakeObs, checkOptions = options()) => {
  const before = obs.requestTypes().length;
  const issues = (await checkSetup(obs.call, checkOptions))._unsafeUnwrap();
  // Checking never changes OBS.
  expect(obs.requestTypes().slice(before).filter(type => /^(Create|Remove|Set)/.test(type))).toEqual([]);
  return issues;
};

describe('checkSetup', () => {
  it('finds nothing after setup', async () => {
    expect(await check(await builtObs())).toEqual([]);
  });

  it('says every scene is missing in an empty collection', async () => {
    const issues = await check(new FakeObs());
    expect(issues[0]).toEqual({ area: 'scenes', message: expect.stringMatching(/^9 scenes missing: "Field 1", "Field 2", .*"Camera - Ceremony"\.$/) });
  });

  it('says when the FTC Live sources show another event', async () => {
    const obs = await builtObs();
    expect(await check(obs, options({ eventCode: 'usmnrq2' }))).toEqual([
      { area: 'scenes', message: 'The FTC Live sources show event usmnrq1, not usmnrq2.' },
    ]);
  });

  it('says when FTC Live has moved', async () => {
    const obs = await builtObs();
    expect(await check(obs, options({ ftcHost: '10.0.0.2' }))).toEqual([
      { area: 'scenes', message: 'The FTC Live sources load FTC Live from 192.168.1.5, not the address this dashboard uses.' },
    ]);
  });

  it('says when FTC Live has another field', async () => {
    const obs = await builtObs();
    expect(await check(obs, options({ fieldCount: 3 }))).toEqual([
      { area: 'scenes', message: '2 scenes missing: "Field 3", "Camera - Field 3".' },
    ]);
  });

  it('says when a source has been taken out of a scene', async () => {
    const obs = await builtObs();
    const { sceneItemId } = (await obs.call('GetSceneItemId', { sceneName: 'Field 2', sourceName: SOURCE_NAMES.overlay }))._unsafeUnwrap();
    await obs.call('RemoveSceneItem', { sceneName: 'Field 2', sceneItemId });
    expect(await check(obs)).toEqual([{ area: 'scenes', message: `"Field 2" is missing "${SOURCE_NAMES.overlay}".` }]);
  });

  it('says when the audio no longer matches the audio choice', async () => {
    const obs = await builtObs();
    const issues = await check(obs, options({ audioMode: 'camera' }));
    expect(issues.map(issue => issue.area)).toEqual(['audio', 'audio']);
    expect(issues[0].message).toBe(`"${SOURCE_NAMES.audio}" is still on, but the stream audio is set to come from the cameras.`);
    expect(issues[1].message).toMatch(/^Camera audio is off for "Camera - Field 1 \(Capture\)"/);
  });

  it('says when the event audio is muted', async () => {
    const obs = await builtObs();
    await obs.call('SetInputMute', { inputName: SOURCE_NAMES.audio, inputMuted: true });
    expect(await check(obs)).toEqual([{ area: 'audio', message: `"${SOURCE_NAMES.audio}" is muted.` }]);
  });
});
