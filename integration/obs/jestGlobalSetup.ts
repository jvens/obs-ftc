// Starts the OBS Studio the contract tests (*.obs.test.ts) run against in `npm run test:obs`, and
// hands it to the test workers through the environment.
import { obsStudioPlatform, startObsStudio } from './obsStudio';

export default async () => {
  const obs = await startObsStudio();
  console.log(`\nTesting against OBS ${obs.version}${process.env.OBS_URL ? '' : ` (${obsStudioPlatform()})`} at ${obs.url}`);
  process.env.OBS_TEST_URL = obs.url;
  process.env.OBS_TEST_PASSWORD = obs.password;
  process.env.OBS_TEST_RECORD_DIR = obs.recordDirectory ?? '';
  (globalThis as { obsStudio?: typeof obs }).obsStudio = obs;
};
