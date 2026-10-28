import type { OBSRequestTypes, OBSResponseTypes } from 'obs-websocket-js';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { CANVAS, Fit, Rect } from './layout';

export type ObsCall = <Type extends keyof OBSRequestTypes>(
  requestType: Type,
  requestData?: OBSRequestTypes[Type]
) => ResultAsync<OBSResponseTypes[Type], string>;

export interface Canvas {
  width: number;
  height: number;
}

// Runs one step after another, stopping at the first error.
export const sequence = <T>(items: readonly T[], step: (item: T) => ResultAsync<unknown, string>): ResultAsync<void, string> =>
  items.reduce<ResultAsync<void, string>>((chain, item) => chain.andThen(() => step(item).map(() => undefined)), okAsync(undefined));

// For removals where "already gone" is as good as success.
export const ignoreError = (result: ResultAsync<unknown, string>): ResultAsync<void, string> =>
  result.map(() => undefined).orElse(() => okAsync(undefined));

export const delay = (ms: number) => ResultAsync.fromSafePromise<void, string>(new Promise(resolve => setTimeout(resolve, ms)));

// OBS finishes removing an input in the background, and closing a capture device can take tens of
// seconds, so wait until it is really gone before reusing its name.
export const waitForInputsRemoved = (call: ObsCall, names: string[], attempts = 240): ResultAsync<void, string> =>
  names.length === 0 ? okAsync(undefined) : call('GetInputList').andThen(({ inputs }) => {
    const remaining = names.filter(name => inputs.some(input => input.inputName === name));
    if (remaining.length === 0)
      return okAsync(undefined);
    if (attempts <= 0)
      return errAsync(`OBS has not finished removing ${remaining.map(name => `"${name}"`).join(', ')} after a minute. Try again shortly, or restart OBS.`);
    return delay(250).andThen(() => waitForInputsRemoved(call, remaining, attempts - 1));
  });

export interface ListItem {
  name: string;
  value: string;
}

// The choices OBS offers for a list setting of an input, e.g. its device.
export const listPropertyItems = (call: ObsCall, inputName: string, propertyName: string): ResultAsync<ListItem[], string> =>
  call('GetInputPropertiesListPropertyItems', { inputName, propertyName })
    .map(({ propertyItems }) => propertyItems
      .filter(item => item.itemEnabled !== false)
      .map(item => ({ name: String(item.itemName), value: String(item.itemValue) })));

export const getCanvas = (call: ObsCall): ResultAsync<Canvas, string> =>
  call('GetVideoSettings').map(({ baseWidth, baseHeight }) => ({ width: baseWidth, height: baseHeight }));

// Scene item transform that fits a source into `rect` (given on the 1920x1080 layout canvas).
export const transformFor = (rect: Rect, fit: Fit, canvas: Canvas) => {
  const scaleX = canvas.width / CANVAS.width;
  const scaleY = canvas.height / CANVAS.height;
  return {
    positionX: rect.x * scaleX,
    positionY: rect.y * scaleY,
    alignment: 5, // top left
    boundsType: fit === 'cover' ? 'OBS_BOUNDS_SCALE_OUTER' : 'OBS_BOUNDS_SCALE_INNER',
    boundsWidth: rect.width * scaleX,
    boundsHeight: rect.height * scaleY,
    boundsAlignment: 0, // centre
    cropToBounds: fit === 'cover',
  };
};
