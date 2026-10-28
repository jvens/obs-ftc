import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { ObsCall, delay, sequence } from './obsCall';

// Stream and recording settings that suit an FTC event stream, in Simple output mode so volunteers
// can follow them in OBS's settings dialog.

export interface SettingsReport {
  changes: string[];
  notes: string[];
}

type Log = (line: string) => void;

interface ProfileSetting {
  label: string;
  category: string;
  name: string;
  value: string;
  describe?: (value: string | null) => string;
}

const VIDEO = { width: 1920, height: 1080, fps: 30 };
const PROFILE_RELOAD_NAME = 'FTC Settings Reload (temporary)';

const yesNo = (value: string | null) => value === 'true' ? 'on' : 'off';

// Fragmented ("hybrid") MP4 survives a crash or power cut and plays anywhere; OBS 30.2 added it.
const recordingFormat = (obsVersion: string) => {
  const [major, minor] = obsVersion.split('.').map(Number);
  return major > 30 || (major === 30 && minor >= 2) ? 'hybrid_mp4' : 'mkv';
};

const profileSettings = (obsVersion: string): ProfileSetting[] => [
  { label: 'Output mode', category: 'Output', name: 'Mode', value: 'Simple' },
  { label: 'Video bitrate', category: 'SimpleOutput', name: 'VBitrate', value: '6000', describe: value => `${value} kbps` },
  { label: 'Audio bitrate', category: 'SimpleOutput', name: 'ABitrate', value: '160', describe: value => `${value} kbps` },
  // Reuses the stream encoder, so recording costs no extra CPU or GPU.
  { label: 'Recording quality', category: 'SimpleOutput', name: 'RecQuality', value: 'Stream',
    describe: value => value === 'Stream' ? 'same as stream' : String(value) },
  { label: 'Recording format', category: 'SimpleOutput', name: 'RecFormat2', value: recordingFormat(obsVersion) },
  // Match replays are saved from the replay buffer (see Match Replay Recording Settings).
  { label: 'Replay buffer', category: 'SimpleOutput', name: 'RecRB', value: 'true', describe: yesNo },
  { label: 'Automatically reconnect', category: 'Output', name: 'Reconnect', value: 'true', describe: yesNo },
];

const describe = (setting: ProfileSetting, value: string | null) =>
  setting.describe ? setting.describe(value) : String(value);

const waitFor = (check: () => ResultAsync<boolean, string>, what: string, attempts = 40): ResultAsync<void, string> =>
  check().andThen(done => done ? okAsync(undefined)
    : attempts <= 0 ? errAsync(`Timed out waiting for OBS ${what}`)
    : delay(250).andThen(() => waitFor(check, what, attempts - 1)));

const replayBufferActive = (call: ObsCall) =>
  call('GetReplayBufferStatus').map(({ outputActive }) => outputActive)
    // Fails when the replay buffer is turned off in the profile.
    .orElse(() => okAsync<boolean, string>(false));

const currentProfileIs = (call: ObsCall, name: string) =>
  call('GetProfileList').map(({ currentProfileName }) => currentProfileName === name);

// OBS only rebuilds its outputs (e.g. adds the replay buffer) when the profile is loaded, so switch
// to a throwaway profile and back.
const reloadProfile = (call: ObsCall, log: Log) =>
  call('GetProfileList').andThen(({ currentProfileName, profiles }) => {
    log('Reloading the OBS profile so the new settings take effect');
    const cleanup = profiles.includes(PROFILE_RELOAD_NAME) ? call('RemoveProfile', { profileName: PROFILE_RELOAD_NAME }) : okAsync(undefined);
    return cleanup
      .andThen(() => call('CreateProfile', { profileName: PROFILE_RELOAD_NAME }))
      .andThen(() => waitFor(() => currentProfileIs(call, PROFILE_RELOAD_NAME), 'to switch profiles'))
      .andThen(() => call('SetCurrentProfile', { profileName: currentProfileName }))
      .andThen(() => waitFor(() => currentProfileIs(call, currentProfileName), 'to switch profiles'))
      .andThen(() => call('RemoveProfile', { profileName: PROFILE_RELOAD_NAME }));
  });

export const applyRecommendedSettings = (call: ObsCall, log: Log): ResultAsync<SettingsReport, string> =>
  ResultAsync.combine([call('GetVersion'), call('GetStreamStatus'), call('GetRecordStatus'), call('GetVideoSettings'), replayBufferActive(call)])
    .andThen(([version, stream, record, video, replaying]) => {
      if (stream.outputActive || record.outputActive)
        return errAsync<SettingsReport, string>('Stop streaming and recording before changing these settings.');
      const settings = profileSettings(version.obsVersion);
      return ResultAsync.combine(settings.map(setting =>
        call('GetProfileParameter', { parameterCategory: setting.category, parameterName: setting.name })
          .map(({ parameterValue }) => ({ setting, current: parameterValue }))))
        .andThen(current => {
          const changedProfile = current.filter(({ setting, current }) => current !== setting.value);
          const videoChanged = video.baseWidth !== VIDEO.width || video.baseHeight !== VIDEO.height
            || video.outputWidth !== VIDEO.width || video.outputHeight !== VIDEO.height
            || video.fpsNumerator / video.fpsDenominator !== VIDEO.fps;
          const changes = [
            ...(videoChanged
              ? [`Video: ${video.baseWidth}x${video.baseHeight} canvas, ${video.outputWidth}x${video.outputHeight} output at `
                + `${Math.round(video.fpsNumerator / video.fpsDenominator * 100) / 100} fps → ${VIDEO.width}x${VIDEO.height} at ${VIDEO.fps} fps`]
              : []),
            ...changedProfile.map(({ setting, current }) => `${setting.label}: ${describe(setting, current)} → ${describe(setting, setting.value)}`),
          ];
          if (changes.length === 0)
            return okAsync(changes);

          const pause = replaying
            ? (log('Stopping the replay buffer'), call('StopReplayBuffer').andThen(() =>
                waitFor(() => replayBufferActive(call).map(active => !active), 'to stop the replay buffer')))
            : okAsync(undefined);
          return pause
            .andThen(() => videoChanged
              ? call('SetVideoSettings', {
                  baseWidth: VIDEO.width, baseHeight: VIDEO.height,
                  outputWidth: VIDEO.width, outputHeight: VIDEO.height,
                  fpsNumerator: VIDEO.fps, fpsDenominator: 1,
                })
              : okAsync(undefined))
            .andThen(() => sequence(changedProfile, ({ setting }) => call('SetProfileParameter', {
              parameterCategory: setting.category, parameterName: setting.name, parameterValue: setting.value,
            })))
            .andThen(() => changedProfile.length > 0 ? reloadProfile(call, log) : okAsync(undefined))
            .andThen(() => replaying
              ? (log('Restarting the replay buffer'), call('StartReplayBuffer').andThen(() =>
                  waitFor(() => replayBufferActive(call), 'to restart the replay buffer')))
              : okAsync(undefined))
            .map(() => changes);
        })
        .andThen(changes => call('GetProfileParameter', { parameterCategory: 'SimpleOutput', parameterName: 'StreamEncoder' })
          .map(({ parameterValue }) => ({
            changes,
            // Hardware support can't be read over the websocket, so the encoder is left to the user.
            notes: parameterValue?.startsWith('x264')
              ? ['The stream uses the x264 software encoder, which is hard on laptops at 1080p. If this computer has an NVIDIA, Intel or AMD GPU, choose its hardware encoder in OBS Settings > Output.']
              : [],
          })));
    });
