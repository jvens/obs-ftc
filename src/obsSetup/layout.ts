import type { OBSRequestTypes } from 'obs-websocket-js';
import { LOWER_THIRD_SOURCE_NAME } from '../helpers/lowerThird';

export type JsonObject = NonNullable<OBSRequestTypes['CreateInput']['inputSettings']>;

// The OBS layout described in obs-setup.md, as data. Everything is laid out on a 1920x1080 canvas;
// apply.ts scales it to whatever base canvas OBS is using.

export const CANVAS = { width: 1920, height: 1080 };

export type CameraType = 'ndi' | 'capture';
export type AudioMode = 'device' | 'camera' | 'none';

export const CAMERA_INPUT_KINDS: Record<CameraType, string> = {
  ndi: 'ndi_source',
  capture: 'dshow_input',
};

// The setting on each camera input kind that picks which device or stream it shows.
export const CAMERA_DEVICE_PROPERTY: Record<CameraType, string> = {
  ndi: 'ndi_source_name',
  capture: 'video_device_id',
};

export const CAMERA_TYPE_LABELS: Record<CameraType, string> = {
  ndi: 'NDI Source',
  capture: 'Video Capture Device',
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
  cameraMap: 'Camera Map',
};

// Each camera is a scene of its own holding the actual NDI or capture input. Program scenes show
// the camera scene, so remapping a camera (or replacing it with anything else, e.g. a PTZ switcher
// or a second capture card) happens in one place and every scene that uses it follows.
export const cameraSceneName = (label: string) => `${label} Camera`;
export const cameraInputName = (label: string, type: CameraType) =>
  `${cameraSceneName(label)} (${type === 'ndi' ? 'NDI' : 'Capture'})`;
export const cameraMapLabelName = (label: string) => `${SCENE_NAMES.cameraMap} Label: ${label}`;

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

export interface SetupOptions {
  ftcHost: string;
  eventCode: string;
  fieldCount: number;
  cameraType: CameraType;
  audioMode: AudioMode;
  overlaySounds: boolean;
  safeBackgroundUrl: string;
  lowerThirdUrl: string;
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
}

export interface PlannedScene {
  name: string;
  // Top of the OBS source list first.
  items: PlannedItem[];
  // Re-position every item on each run; otherwise items the user has moved are left alone.
  generatedLayout?: boolean;
}

export interface PlannedCamera {
  label: string;
  scene: string;
}

export interface Plan {
  inputs: PlannedInput[];
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

// A grid of every camera, each with a name label, so cameras can be matched up in one view.
const cameraMapItems = (cameras: PlannedCamera[]): PlannedItem[] => {
  const columns = Math.ceil(Math.sqrt(cameras.length));
  const rows = Math.ceil(cameras.length / columns);
  const width = CANVAS.width / columns;
  const height = CANVAS.height / rows;
  const labelHeight = Math.round(height / 8);
  return cameras.flatMap((camera, index) => {
    const x = (index % columns) * width;
    const y = Math.floor(index / columns) * height;
    return [
      { source: cameraMapLabelName(camera.label), rect: { x, y, width, height: labelHeight }, fit: 'contain' as const },
      { source: camera.scene, rect: { x, y, width, height }, fit: 'contain' as const },
    ];
  });
};

export const cameraMapLabel = (label: string, textInputKind: string): PlannedInput => ({
  name: cameraMapLabelName(label),
  kind: textInputKind,
  settings: {
    text: label,
    font: { face: 'Arial', size: 72, style: 'Bold', flags: 1 },
    outline: true,
    outline_size: 4,
    drop_shadow: true,
    bk_color: 0,
    bk_opacity: 60,
  },
});

const fieldNumbers = (fieldCount: number) => Array.from({ length: Math.max(1, fieldCount) }, (_, index) => index + 1);

export const plannedCameras = (fieldCount: number): PlannedCamera[] =>
  [...fieldNumbers(fieldCount).map(field => `Field ${field}`), 'Ceremony']
    .map(label => ({ label, scene: cameraSceneName(label) }));

export const buildPlan = (options: SetupOptions, textInputKind: string): Plan => {
  const fields = fieldNumbers(options.fieldCount);
  const cameras = plannedCameras(options.fieldCount);
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
    // The browser shows a bare image at its natural size; the CSS stretches it to the canvas and
    // leaves a solid colour behind it for when the image can't be loaded (no internet at the venue).
    browserSource(SOURCE_NAMES.safeBackground, options.safeBackgroundUrl, {
      css: 'body { margin: 0; overflow: hidden; background: #0a2240 !important; } '
        + 'img { width: 100vw !important; height: 100vh !important; object-fit: cover; margin: 0 !important; }',
    }),
    browserSource(SOURCE_NAMES.lowerThird, options.lowerThirdUrl, { restart_when_active: true }),
    ...(options.audioMode === 'device'
      ? [{ name: SOURCE_NAMES.audio, kind: 'wasapi_input_capture', settings: { device_id: 'default' }, keepExistingSettings: true }]
      : []),
    ...cameras.map(camera => cameraMapLabel(camera.label, textInputKind)),
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
    { name: SCENE_NAMES.cameraMap, items: [...cameraMapItems(cameras), fullScreen(SOURCE_NAMES.safeBackground)], generatedLayout: true },
  ];

  return { inputs, cameras, scenes };
};
