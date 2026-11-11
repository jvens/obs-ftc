import type { OBSRequestTypes } from 'obs-websocket-js';
import { LOWER_THIRD_SOURCE_NAME } from '../helpers/lowerThird';
import { LanReceiverConfig } from '../lanCamera/urls';

export type JsonObject = NonNullable<OBSRequestTypes['CreateInput']['inputSettings']>;

// The OBS layout described in obs-setup.md, as data. Everything is laid out on a 1920x1080 canvas;
// apply.ts scales it to whatever base canvas OBS is using.

export const CANVAS = { width: 1920, height: 1080 };

// Cameras that are an OBS input, as opposed to 'shared', which shows another camera's scene.
// lan: a browser source receiving a webcam sent from another computer's browser (see src/lanCamera).
export type InputCameraType = 'capture' | 'ndi' | 'lan';
export type CameraType = InputCameraType | 'shared';
export type AudioMode = 'device' | 'camera' | 'none';

export const DEFAULT_CAMERA_TYPE: InputCameraType = 'capture';

// The platforms the dashboard can set OBS up on.
export type ObsPlatform = 'windows' | 'linux';
export const OBS_PLATFORMS: readonly ObsPlatform[] = ['windows', 'linux'];

// Webcams and capture cards, and audio devices, are different input kinds on each platform;
// everything else is the same everywhere.
export interface PlatformKinds {
  capture: string;
  audio: string;
}

export const PLATFORM_KINDS: Record<ObsPlatform, PlatformKinds> = {
  windows: { capture: 'dshow_input', audio: 'wasapi_input_capture' },
  linux: { capture: 'v4l2_input', audio: 'pulse_input_capture' },
};

export const cameraInputKind = (type: InputCameraType, platform: ObsPlatform) =>
  type === 'capture' ? PLATFORM_KINDS[platform].capture : type === 'ndi' ? 'ndi_source' : 'browser_source';

// The camera type of an input kind, on any platform.
export const cameraTypeOfKind = (kind: unknown): InputCameraType | undefined =>
  OBS_PLATFORMS.some(platform => PLATFORM_KINDS[platform].capture === kind) ? 'capture'
    : kind === 'ndi_source' ? 'ndi'
    : kind === 'browser_source' ? 'lan'
    : undefined;

// Video4Linux cameras carry no audio (OBS refuses to mute them); the other camera kinds can.
export const cameraKindHasAudio = (kind: unknown) => kind !== PLATFORM_KINDS.linux.capture;

// The setting on each camera input kind that picks which device or stream it shows.
export const CAMERA_DEVICE_PROPERTY: Record<string, string> = {
  dshow_input: 'video_device_id',
  v4l2_input: 'device_id',
  ndi_source: 'ndi_source_name',
  browser_source: 'url',
};

export const CAMERA_TYPE_LABELS: Record<CameraType, string> = {
  capture: 'Video Capture Device',
  ndi: 'NDI Source',
  lan: 'LAN Camera (browser on another computer)',
  shared: 'Same as another camera',
};

export const SOURCE_NAMES = {
  overlay: 'FTC Live Overlay',
  pit: 'FTC Pit Display',
  sponsor: 'FTC Sponsor Display',
  safeBackground: 'Safe Background',
  lowerThird: LOWER_THIRD_SOURCE_NAME,
  audio: 'Event Audio',
};

export const SCENE_NAMES = {
  field: (field: number) => `Field ${field}`,
  ceremony: 'Ceremony',
  allianceSelection: 'Alliance Selection',
  pit: 'Pit Display',
  sponsor: 'Sponsor Loop',
};

// Each camera is a scene of its own holding the actual NDI or capture input (or, when one camera
// covers two roles, the other camera's scene). Program scenes show the camera scene, so remapping a
// camera, or replacing it with anything else such as a switcher, happens in one place.
export const cameraSceneName = (label: string) => `Camera - ${label}`;
const CAMERA_INPUT_SUFFIX: Record<InputCameraType, string> = { capture: 'Capture', ndi: 'NDI', lan: 'LAN' };
export const cameraInputName = (label: string, type: InputCameraType) =>
  `${cameraSceneName(label)} (${CAMERA_INPUT_SUFFIX[type]})`;

export const DEFAULT_SAFE_BACKGROUND_URL =
  'https://www.firstinspires.org/hubfs/web/brand/season/2027/downloads/first-canopy-wallpaper-v1.png';

// The camera window FTC Live leaves open in its hybrid alliance selection overlay
// (.hybridSelection .chromaBackground: left 119px, bottom 210px, 912x513).
export const ALLIANCE_SELECTION_CAMERA = { x: 119, y: 357, width: 912, height: 513 };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A camera beyond the fields and the ceremony (the audience, the pits), with a scene of its own
// named after it. The FTC Live overlay is always in that scene, shown or hidden by `overlay`.
export interface CustomCamera {
  name: string;
  overlay: boolean;
}

export interface SetupOptions {
  ftcHost: string;
  eventCode: string;
  fieldCount: number;
  audioMode: AudioMode;
  overlaySounds: boolean;
  safeBackgroundUrl: string;
  lowerThirdUrl: string;
  lanReceiver: LanReceiverConfig;
  customCameras: CustomCamera[];
}

export interface PlannedInput {
  name: string;
  kind: string;
  settings: JsonObject;
  // Settings are only applied when the input is created; afterwards they belong to the user.
  keepExistingSettings?: boolean;
}

// contain: scale to fit inside the rect; cover: fill the rect and crop the overflow.
export type Fit = 'contain' | 'cover';

export interface PlannedItem {
  source: string;
  rect: Rect;
  fit: Fit;
  // Added hidden (the eye in OBS's source list off); only applied when the item is created.
  hidden?: boolean;
}

export interface PlannedScene {
  name: string;
  // Top of the OBS source list first.
  items: PlannedItem[];
}

export interface PlannedCamera {
  label: string;
  scene: string;
}

export interface Plan {
  inputs: PlannedInput[];
  // Cameras and scenes are listed in the order they should appear in OBS, top first.
  cameras: PlannedCamera[];
  scenes: PlannedScene[];
}

const FULL_SCREEN: Rect = { x: 0, y: 0, ...CANVAS };

const fullScreen = (source: string): PlannedItem => ({ source, rect: FULL_SCREEN, fit: 'contain' });

export const overlayUrl = (ftcHost: string, eventCode: string, sounds: boolean) => {
  const params = new URLSearchParams({
    type: 'audience',
    bindToField: 'all',
    scoringBarLocation: 'bottom',
    allianceOrientation: 'standard',
    mute: String(!sounds),
    muteRandomizationResults: 'false',
    inspectionGroupDivision: 'false',
    fieldStyleTimer: 'false',
    overlay: 'true',
    overlayColor: 'transparent',
    allianceSelectionStyle: 'hybrid',
    awardsStyle: 'overlay',
    dualDivisionRankingStyle: 'sideBySide',
    rankingsFontSize: 'larger',
    showMeetRankings: 'false',
    rankingsAllTeams: 'true',
    name: 'OBS Overlay',
  });
  return `http://${ftcHost}/event/${eventCode}/display/?${params}`;
};

export const displayUrl = (ftcHost: string, eventCode: string, type: 'pit' | 'sponsor') =>
  `http://${ftcHost}/event/${eventCode}/display/?type=${type}`;

const browserSource = (name: string, url: string, extra: JsonObject = {}): PlannedInput => ({
  name,
  kind: 'browser_source',
  settings: { url, width: CANVAS.width, height: CANVAS.height, ...extra },
});

const fieldNumbers = (fieldCount: number) => Array.from({ length: Math.max(1, fieldCount) }, (_, index) => index + 1);

export const plannedCameras = (fieldCount: number, customCameras: CustomCamera[] = []): PlannedCamera[] =>
  [...fieldNumbers(fieldCount).map(field => `Field ${field}`), 'Ceremony', ...customCameras.map(camera => camera.name)]
    .map(label => ({ label, scene: cameraSceneName(label) }));

export const buildPlan = (options: SetupOptions, platform: ObsPlatform): Plan => {
  const fields = fieldNumbers(options.fieldCount);
  const cameras = plannedCameras(options.fieldCount, options.customCameras);
  const ceremonyCamera = cameraSceneName('Ceremony');

  const audio: PlannedItem[] = options.audioMode === 'device' ? [fullScreen(SOURCE_NAMES.audio)] : [];
  const programScene = (name: string, items: PlannedItem[]): PlannedScene => ({
    name,
    items: [...items, fullScreen(SOURCE_NAMES.safeBackground), ...audio],
  });

  const inputs: PlannedInput[] = [
    // Control audio via OBS so the FTC Live field sounds go through the OBS mixer.
    browserSource(SOURCE_NAMES.overlay, overlayUrl(options.ftcHost, options.eventCode, options.overlaySounds), { reroute_audio: true }),
    browserSource(SOURCE_NAMES.pit, displayUrl(options.ftcHost, options.eventCode, 'pit')),
    browserSource(SOURCE_NAMES.sponsor, displayUrl(options.ftcHost, options.eventCode, 'sponsor')),
    // The browser shows a bare image at its natural size; the CSS stretches it to fill the canvas.
    browserSource(SOURCE_NAMES.safeBackground, options.safeBackgroundUrl, {
      css: 'body { margin: 0; overflow: hidden; background: #0a2240 !important; } '
        + 'img { width: 100vw !important; height: 100vh !important; object-fit: cover; margin: 0 !important; }',
    }),
    browserSource(SOURCE_NAMES.lowerThird, options.lowerThirdUrl, { restart_when_active: true }),
    ...(options.audioMode === 'device'
      ? [{ name: SOURCE_NAMES.audio, kind: PLATFORM_KINDS[platform].audio, settings: { device_id: 'default' }, keepExistingSettings: true }]
      : []),
  ];

  const scenes: PlannedScene[] = [
    ...fields.map(field => programScene(SCENE_NAMES.field(field), [
      fullScreen(SOURCE_NAMES.overlay),
      fullScreen(cameraSceneName(`Field ${field}`)),
    ])),
    programScene(SCENE_NAMES.ceremony, [
      fullScreen(SOURCE_NAMES.lowerThird),
      fullScreen(SOURCE_NAMES.overlay),
      fullScreen(ceremonyCamera),
    ]),
    programScene(SCENE_NAMES.allianceSelection, [
      fullScreen(SOURCE_NAMES.overlay),
      { source: ceremonyCamera, rect: ALLIANCE_SELECTION_CAMERA, fit: 'cover' },
    ]),
    programScene(SCENE_NAMES.pit, [fullScreen(SOURCE_NAMES.pit)]),
    programScene(SCENE_NAMES.sponsor, [fullScreen(SOURCE_NAMES.sponsor)]),
    ...options.customCameras.map(camera => programScene(camera.name, [
      fullScreen(SOURCE_NAMES.lowerThird),
      { ...fullScreen(SOURCE_NAMES.overlay), hidden: !camera.overlay },
      fullScreen(cameraSceneName(camera.name)),
    ])),
  ];

  return { inputs, cameras, scenes };
};
