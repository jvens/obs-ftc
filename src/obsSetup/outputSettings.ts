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
  id: string;
  label: string;
  category: string;
  name: string;
  value: string;
  describe?: (value: string | null) => string;
}

const VIDEO = { width: 1920, height: 1080, fps: 30 };
const PROFILE_RELOAD_NAME = 'FTC Settings Reload (temporary)';

const yesNo = (value: string | null) => value === 'true' ? 'on' : 'off';
const kbps = (value: string | null) => value === null ? 'not set' : `${value} kbps`;

// Fragmented ("hybrid") MP4 survives a crash or power cut and plays anywhere; OBS 30.2 added it.
const recordingFormat = (obsVersion: string) => {
  const [major, minor] = obsVersion.split('.').map(Number);
  return major > 30 || (major === 30 && minor >= 2) ? 'hybrid_mp4' : 'mkv';
};

const FORMAT_NAMES: Record<string, string> = { hybrid_mp4: 'Hybrid MP4', mkv: 'MKV', mp4: 'MP4', mov: 'MOV', flv: 'FLV' };

const profileSettings = (obsVersion: string): ProfileSetting[] => [
  { id: 'output-mode', label: 'Output mode', category: 'Output', name: 'Mode', value: 'Simple' },
  { id: 'video-bitrate', label: 'Video bitrate', category: 'SimpleOutput', name: 'VBitrate', value: '6000', describe: kbps },
  { id: 'audio-bitrate', label: 'Audio bitrate', category: 'SimpleOutput', name: 'ABitrate', value: '160', describe: kbps },
  // Reuses the stream encoder, so recording costs no extra CPU or GPU.
  { id: 'recording-quality', label: 'Recording quality', category: 'SimpleOutput', name: 'RecQuality', value: 'Stream',
    describe: value => value === null ? 'not set' : value === 'Stream' ? 'same as stream' : value },
  { id: 'recording-format', label: 'Recording format', category: 'SimpleOutput', name: 'RecFormat2', value: recordingFormat(obsVersion),
    describe: value => value === null ? 'not set' : FORMAT_NAMES[value] ?? value },
  // Match replays are saved from the replay buffer (see Individual Match Recording on the Outputs view).
  { id: 'replay-buffer', label: 'Replay buffer', category: 'SimpleOutput', name: 'RecRB', value: 'true', describe: yesNo },
  { id: 'reconnect', label: 'Automatically reconnect', category: 'Output', name: 'Reconnect', value: 'true', describe: yesNo },
];

const describe = (setting: ProfileSetting, value: string | null) =>
  setting.describe ? setting.describe(value) : value ?? 'not set';

export const RESOLUTION_ID = 'resolution';
export const FRAME_RATE_ID = 'frame-rate';

// One setting as OBS has it now, beside what this dashboard recommends.
export interface SettingRow {
  id: string;
  label: string;
  current: string;
  recommended: string;
  ok: boolean;
}

export interface OutputSettings {
  rows: SettingRow[];
  // Advice on what is left to the user, such as the encoder.
  notes: string[];
}

interface VideoSettings {
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
  fpsNumerator: number;
  fpsDenominator: number;
}

const fps = (video: VideoSettings) => Math.round(video.fpsNumerator / video.fpsDenominator * 100) / 100;

const videoRows = (video: VideoSettings): SettingRow[] => {
  const size = (width: number, height: number) => `${width}x${height}`;
  const recommendedSize = size(VIDEO.width, VIDEO.height);
  const base = size(video.baseWidth, video.baseHeight);
  const output = size(video.outputWidth, video.outputHeight);
  return [
    { id: RESOLUTION_ID, label: 'Resolution', current: base === output ? base : `${base} canvas, ${output} output`,
      recommended: recommendedSize, ok: base === recommendedSize && output === recommendedSize },
    { id: FRAME_RATE_ID, label: 'Frame rate', current: `${fps(video)} fps`, recommended: `${VIDEO.fps} fps`, ok: fps(video) === VIDEO.fps },
  ];
};

interface ProfileState {
  setting: ProfileSetting;
  current: string | null;
}

const readProfile = (call: ObsCall, settings: ProfileSetting[]) =>
  ResultAsync.combine(settings.map(setting =>
    call('GetProfileParameter', { parameterCategory: setting.category, parameterName: setting.name })
      .map(({ parameterValue }): ProfileState => ({ setting, current: parameterValue }))));

const profileRow = ({ setting, current }: ProfileState): SettingRow => ({
  id: setting.id,
  label: setting.label,
  current: describe(setting, current),
  recommended: describe(setting, setting.value),
  ok: current === setting.value,
});

// Hardware support can't be read over the websocket, so the encoder is left to the user.
const encoderNotes = (call: ObsCall) =>
  call('GetProfileParameter', { parameterCategory: 'SimpleOutput', parameterName: 'StreamEncoder' })
    .map(({ parameterValue }) => parameterValue?.startsWith('x264')
      ? ['The stream uses the x264 software encoder, which is hard on laptops at 1080p. If this computer has an NVIDIA, Intel or AMD GPU, choose its hardware encoder in OBS Settings > Output.']
      : []);

// The stream and recording settings OBS has now, each beside the recommended value.
export const readOutputSettings = (call: ObsCall): ResultAsync<OutputSettings, string> =>
  ResultAsync.combine([call('GetVersion'), call('GetVideoSettings')])
    .andThen(([version, video]) => readProfile(call, profileSettings(version.obsVersion))
      .map(profile => [...videoRows(video), ...profile.map(profileRow)]))
    .andThen(rows => encoderNotes(call).map(notes => ({ rows, notes })));

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

// Sets the chosen settings (by row id, or all of them) to the recommended values, and reports what
// changed as "Label: before → after".
export const applyOutputSettings = (call: ObsCall, ids: readonly string[] | 'all', log: Log): ResultAsync<SettingsReport, string> => {
  const chosen = (id: string) => ids === 'all' || ids.includes(id);
  return ResultAsync.combine([call('GetVersion'), call('GetStreamStatus'), call('GetRecordStatus'), call('GetVideoSettings'), replayBufferActive(call)])
    .andThen(([version, stream, record, video, replaying]) => {
      if (stream.outputActive || record.outputActive)
        return errAsync<SettingsReport, string>('Stop streaming and recording before changing these settings.');
      const settings = profileSettings(version.obsVersion).filter(setting => chosen(setting.id));
      return readProfile(call, settings)
        .andThen(profile => {
          const changedProfile = profile.filter(({ setting, current }) => current !== setting.value);
          const changedVideo = videoRows(video).filter(row => !row.ok && chosen(row.id));
          const changes = [...changedVideo, ...changedProfile.map(profileRow)]
            .map(row => `${row.label}: ${row.current} → ${row.recommended}`);
          if (changes.length === 0)
            return okAsync(changes);

          const resolution = changedVideo.some(row => row.id === RESOLUTION_ID);
          const frameRate = changedVideo.some(row => row.id === FRAME_RATE_ID);
          const pause = replaying
            ? (log('Stopping the replay buffer'), call('StopReplayBuffer').andThen(() =>
                waitFor(() => replayBufferActive(call).map(active => !active), 'to stop the replay buffer')))
            : okAsync(undefined);
          return pause
            .andThen(() => changedVideo.length > 0
              ? call('SetVideoSettings', {
                  baseWidth: resolution ? VIDEO.width : video.baseWidth,
                  baseHeight: resolution ? VIDEO.height : video.baseHeight,
                  outputWidth: resolution ? VIDEO.width : video.outputWidth,
                  outputHeight: resolution ? VIDEO.height : video.outputHeight,
                  fpsNumerator: frameRate ? VIDEO.fps : video.fpsNumerator,
                  fpsDenominator: frameRate ? 1 : video.fpsDenominator,
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
        .andThen(changes => encoderNotes(call).map(notes => ({ changes, notes })));
    });
};

export const applyRecommendedSettings = (call: ObsCall, log: Log): ResultAsync<SettingsReport, string> =>
  applyOutputSettings(call, 'all', log);
