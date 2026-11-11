import { AudioMode, SCENE_NAMES, plannedCameras } from '../obsSetup/layout';

// The steps on the Setup view, in the order a volunteer works through them before going live.
export const SETUP_STEPS = [
  { id: 'ftc-live', title: 'Connect to FTC Live' },
  { id: 'obs', title: 'Connect to OBS Studio' },
  { id: 'scenes', title: 'Scenes and cameras' },
  { id: 'audio', title: 'Audio' },
  { id: 'settings', title: 'Stream and recording settings' },
  { id: 'switching', title: 'Scene switching' },
] as const;

export type SetupStepId = typeof SETUP_STEPS[number]['id'];

export const DEFAULT_STEP: SetupStepId = 'ftc-live';

export const stepFromId = (id: string): SetupStepId | undefined => SETUP_STEPS.find(step => step.id === id)?.id;

// 'done' and 'todo' are checked against FTC Live and OBS; 'info' steps have nothing the dashboard can
// check, so they only describe the choice.
export type StepStatus = 'done' | 'todo' | 'info';

export interface StepState {
  status: StepStatus;
  detail: string;
}

export interface SetupFacts {
  ftcConnected: boolean;
  event?: { name: string; fieldCount: number };
  obsConnected: boolean;
  obsAddress: string;
  // Scene names in OBS's current scene collection.
  scenes: string[];
  fieldCount: number;
  audioMode: AudioMode;
  // Scene switching: the scene for each field (index 0 = field 1) and for finals.
  fieldScenes: string[];
  finalsScene: string;
}

const AUDIO_DETAIL: Record<AudioMode, string> = {
  device: 'Event audio from an input device',
  camera: 'Event audio from the cameras',
  none: 'No event audio',
};

// The scenes Configure OBS Studio builds for this many fields.
export const expectedScenes = (fieldCount: number) => [
  ...Array.from({ length: Math.max(1, fieldCount) }, (_, index) => SCENE_NAMES.field(index + 1)),
  SCENE_NAMES.ceremony,
  SCENE_NAMES.allianceSelection,
  SCENE_NAMES.pit,
  SCENE_NAMES.sponsor,
  ...plannedCameras(fieldCount).map(camera => camera.scene),
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export const setupStepStates = (facts: SetupFacts): Record<SetupStepId, StepState> => {
  const inObs = new Set(facts.scenes);
  const expected = expectedScenes(facts.fieldCount);
  const built = expected.filter(scene => inObs.has(scene)).length;

  const needed = [
    ...facts.fieldScenes.slice(0, Math.max(1, facts.fieldCount)),
    ...(facts.fieldCount >= 2 ? [facts.finalsScene] : []),
  ];
  const assigned = needed.every(scene => scene !== '' && inObs.has(scene));

  return {
    'ftc-live': facts.ftcConnected
      ? { status: 'done', detail: facts.event ? `${facts.event.name} · ${plural(facts.event.fieldCount, 'field')}` : 'Connected' }
      : { status: 'todo', detail: facts.event ? `${facts.event.name}, not connected` : 'Pick the event and connect' },
    obs: facts.obsConnected
      ? { status: 'done', detail: facts.obsAddress }
      : { status: 'todo', detail: 'Not connected' },
    scenes: !facts.obsConnected
      ? { status: 'todo', detail: 'Connect to OBS first' }
      : built === expected.length
        ? { status: 'done', detail: `All ${expected.length} scenes in OBS` }
        : { status: 'todo', detail: `${built} of ${expected.length} scenes in OBS` },
    audio: { status: 'info', detail: AUDIO_DETAIL[facts.audioMode] },
    settings: { status: 'info', detail: 'Recommended: 1080p, 30 fps' },
    switching: facts.obsConnected && assigned
      ? { status: 'done', detail: facts.fieldCount >= 2 ? 'Fields and finals assigned' : 'Field assigned' }
      : { status: 'todo', detail: 'Pick the scene for each field' },
  };
};
