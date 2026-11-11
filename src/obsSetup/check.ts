import { ResultAsync, okAsync } from 'neverthrow';
import { canonical } from './apply';
import { cameraMuted } from './cameras';
import { PlannedInput, SOURCE_NAMES, SetupOptions, buildPlan, cameraKindHasAudio, cameraTypeOfKind } from './layout';
import { ObsCall, getPlatform } from './obsCall';

// What "Update for this event" would change, found without changing anything, so the Setup view can
// say that OBS is out of date and why: a scene missing, a source pointing at another event.

// scenes: fixed by "Update for this event" on Scenes and cameras; audio: by "Update OBS" on Audio.
export type SetupIssueArea = 'scenes' | 'audio';

export interface SetupIssue {
  area: SetupIssueArea;
  message: string;
}

const FTC_LIVE_SOURCES = [SOURCE_NAMES.overlay, SOURCE_NAMES.pit, SOURCE_NAMES.sponsor];

const eventCodeOf = (url: string) => /\/event\/([^/]+)\/display/.exec(url)?.[1] ?? '';
const hostOf = (url: string) => /^\w+:\/\/([^/]+)/.exec(url)?.[1] ?? '';

const quoted = (names: string[]) => names.map(name => `"${name}"`).join(', ');
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

interface InputState {
  name: string;
  kind: string;
}

// The planned inputs whose settings differ from OBS, described in words a volunteer can act on.
const settingIssues = (call: ObsCall, inputs: PlannedInput[], present: InputState[]): ResultAsync<SetupIssue[], string> => {
  const checked = inputs.filter(input => !input.keepExistingSettings && present.some(other => other.name === input.name && other.kind === input.kind));
  return ResultAsync.combine(checked.map(input => call('GetInputSettings', { inputName: input.name })
    .map(({ inputSettings }) => ({
      input,
      changed: Object.entries(input.settings).filter(([key, value]) => canonical(inputSettings[key]) !== canonical(value)).map(([key]) => key),
      url: String(inputSettings.url ?? ''),
    }))))
    .map(results => {
      const issues: SetupIssue[] = [];
      const wrongEvent = new Set<string>();
      const wrongHost = new Set<string>();
      for (const { input, changed, url } of results.filter(result => result.changed.length > 0)) {
        const wanted = String(input.settings.url ?? '');
        if (FTC_LIVE_SOURCES.includes(input.name) && changed.includes('url')) {
          if (eventCodeOf(url) !== eventCodeOf(wanted)) wrongEvent.add(eventCodeOf(url) || 'no event');
          if (hostOf(url) !== hostOf(wanted)) wrongHost.add(hostOf(url) || 'nowhere');
          if (eventCodeOf(url) === eventCodeOf(wanted) && hostOf(url) === hostOf(wanted))
            issues.push({ area: 'scenes', message: `"${input.name}" has settings from an earlier setup.` });
        } else {
          issues.push({ area: 'scenes', message: `"${input.name}" has settings from an earlier setup.` });
        }
      }
      const eventCode = eventCodeOf(String(results.find(result => result.input.name === SOURCE_NAMES.overlay)?.input.settings.url ?? ''));
      if (wrongEvent.size > 0)
        issues.unshift({ area: 'scenes', message: `The FTC Live sources show event ${[...wrongEvent].join(', ')}, not ${eventCode}.` });
      if (wrongHost.size > 0)
        issues.unshift({ area: 'scenes', message: `The FTC Live sources load FTC Live from ${[...wrongHost].join(', ')}, not the address this dashboard uses.` });
      return issues;
    });
};

const missingItemIssues = (call: ObsCall, scenes: { name: string; sources: string[] }[]) =>
  ResultAsync.combine(scenes.map(scene => call('GetSceneItemList', { sceneName: scene.name })
    .map(({ sceneItems }) => {
      const present = new Set(sceneItems.map(item => String(item.sourceName)));
      return { scene: scene.name, missing: scene.sources.filter(source => !present.has(source)) };
    })))
    .map(results => results.flatMap(({ scene, missing }): SetupIssue[] => [
      ...missing.filter(source => source !== SOURCE_NAMES.audio).map(source => ({ area: 'scenes' as const, message: `"${scene}" is missing "${source}".` })),
      ...(missing.includes(SOURCE_NAMES.audio) ? [{ area: 'audio' as const, message: `"${scene}" is missing "${SOURCE_NAMES.audio}".` }] : []),
    ]));

const muted = (call: ObsCall, inputName: string) => call('GetInputMute', { inputName }).map(({ inputMuted }) => inputMuted);

// Camera audio is on only when the stream takes its audio from the cameras.
const cameraAudioIssues = (call: ObsCall, cameraScenes: string[], options: SetupOptions) =>
  ResultAsync.combine(cameraScenes.map(sceneName => call('GetSceneItemList', { sceneName })
    .andThen(({ sceneItems }) => {
      const inputs = sceneItems
        .filter(item => cameraTypeOfKind(item.inputKind) !== undefined && cameraKindHasAudio(item.inputKind))
        .map(item => String(item.sourceName));
      return ResultAsync.combine(inputs.map(inputName => muted(call, inputName).map(isMuted => ({ inputName, isMuted }))));
    })))
    .map(scenes => {
      const wrong = scenes.flat().filter(({ isMuted }) => isMuted !== cameraMuted(options.audioMode)).map(({ inputName }) => inputName);
      return wrong.length === 0 ? [] : [{
        area: 'audio' as const,
        message: `Camera audio is ${cameraMuted(options.audioMode) ? 'on' : 'off'} for ${quoted(wrong)}, but the stream audio is set to ${options.audioMode === 'camera' ? 'come from the cameras' : 'something else'}.`,
      }];
    });

const eventAudioIssues = (call: ObsCall, inputs: InputState[], options: SetupOptions): ResultAsync<SetupIssue[], string> => {
  const exists = inputs.some(input => input.name === SOURCE_NAMES.audio);
  if (options.audioMode === 'device')
    return exists
      ? muted(call, SOURCE_NAMES.audio).map(isMuted => isMuted ? [{ area: 'audio' as const, message: `"${SOURCE_NAMES.audio}" is muted.` }] : [])
      : okAsync([{ area: 'audio' as const, message: `OBS has no "${SOURCE_NAMES.audio}" source yet.` }]);
  return exists
    ? muted(call, SOURCE_NAMES.audio).map(isMuted => isMuted ? [] : [{ area: 'audio' as const, message: `"${SOURCE_NAMES.audio}" is still on, but the stream audio is set to ${options.audioMode === 'camera' ? 'come from the cameras' : 'none'}.` }])
    : okAsync([]);
};

export const checkSetup = (call: ObsCall, options: SetupOptions): ResultAsync<SetupIssue[], string> =>
  ResultAsync.combine([getPlatform(call), call('GetSceneList'), call('GetInputList')])
    .andThen(([platform, { scenes }, { inputs }]) => {
      const plan = buildPlan(options, platform);
      const sceneNames = new Set(scenes.map(scene => String(scene.sceneName)));
      const present = inputs.map(input => ({ name: String(input.inputName), kind: String(input.inputKind) }));

      const missingScenes = [...plan.scenes.map(scene => scene.name), ...plan.cameras.map(camera => camera.scene)]
        .filter(name => !sceneNames.has(name));
      const sceneIssues: SetupIssue[] = missingScenes.length === 0 ? [] : [{
        area: 'scenes',
        message: `${plural(missingScenes.length, 'scene')} missing: ${quoted(missingScenes)}.`,
      }];
      // Inputs are made with the scenes that show them, so a missing scene already explains them.
      const missingInputs = plan.inputs
        .filter(input => input.name !== SOURCE_NAMES.audio && !present.some(other => other.name === input.name))
        .filter(input => plan.scenes.some(scene => sceneNames.has(scene.name) && scene.items.some(item => item.source === input.name)))
        .map(input => input.name);
      const inputIssues: SetupIssue[] = missingInputs.length === 0 ? [] : [{ area: 'scenes', message: `Missing ${quoted(missingInputs)}.` }];

      return ResultAsync.combine([
        settingIssues(call, plan.inputs, present),
        missingItemIssues(call, plan.scenes.filter(scene => sceneNames.has(scene.name))
          .map(scene => ({ name: scene.name, sources: scene.items.map(item => item.source).filter(source => !missingInputs.includes(source)) }))),
        eventAudioIssues(call, present, options),
        cameraAudioIssues(call, plan.cameras.map(camera => camera.scene).filter(scene => sceneNames.has(scene)), options),
      ]).map(([settings, items, eventAudio, cameraAudio]) => [...sceneIssues, ...inputIssues, ...settings, ...items, ...eventAudio, ...cameraAudio]);
    });
