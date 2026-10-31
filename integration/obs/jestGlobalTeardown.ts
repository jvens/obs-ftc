import type { ObsStudio } from './obsStudio';

export default async () => {
  await (globalThis as { obsStudio?: ObsStudio }).obsStudio?.stop();
};
